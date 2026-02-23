import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type WriteBatch,
  documentId,
} from 'firebase-admin/firestore'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type ResetOptions = {
  dryRun: boolean
  includeLegacyCollections: boolean
  campaignId: string
  chunkSize: number
}

function getServiceAccount() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (!serviceAccountPath) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_PATH')
  }

  const absolutePath = resolve(process.cwd(), serviceAccountPath)
  const raw = readFileSync(absolutePath, 'utf8')
  const parsed = JSON.parse(raw) as ServiceAccount

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid service account JSON. Expected project_id, client_email and private_key.')
  }

  return parsed
}

function parseArgs(argv: string[]): ResetOptions {
  const includeLegacyCollections = argv.includes('--include-legacy')
  const dryRun = !argv.includes('--confirm')
  const campaignIdFromArgIndex = argv.findIndex((arg) => arg === '--campaign-id')
  const chunkSizeArgIndex = argv.findIndex((arg) => arg === '--chunk-size')

  const campaignId = campaignIdFromArgIndex >= 0
    ? argv[campaignIdFromArgIndex + 1]
    : process.env.CAMPAIGN_DOC_ID || 'campanha-bmw-r1200-gs-2026'

  const chunkSizeRaw = chunkSizeArgIndex >= 0
    ? argv[chunkSizeArgIndex + 1]
    : process.env.RESET_DRAWS_CHUNK_SIZE || '350'
  const chunkSize = Number.parseInt(chunkSizeRaw, 10)

  if (!campaignId) {
    throw new Error('Missing campaign id. Use --campaign-id <id> or CAMPAIGN_DOC_ID.')
  }

  if (!Number.isInteger(chunkSize) || chunkSize <= 0 || chunkSize > 450) {
    throw new Error('Invalid chunk size. Use --chunk-size between 1 and 450.')
  }

  return {
    dryRun,
    includeLegacyCollections,
    campaignId,
    chunkSize,
  }
}

async function deleteByQueryInChunks(params: {
  queryFactory: () => Query<DocumentData>
  chunkSize: number
  dryRun: boolean
  label: string
}) {
  let processed = 0
  let deleted = 0
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  while (true) {
    let query = params.queryFactory().orderBy(documentId()).limit(params.chunkSize)
    if (lastDoc) {
      query = query.startAfter(lastDoc.id)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    processed += snapshot.size
    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    if (!params.dryRun) {
      const batch: WriteBatch = db.batch()
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref)
      }
      await batch.commit()
      deleted += snapshot.size
    }
  }

  console.log(`[${params.label}] matched=${processed} ${params.dryRun ? '(dry-run)' : `deleted=${deleted}`}`)
  return { matched: processed, deleted }
}

async function clearAwardedFlagsInNumberStates(params: {
  chunkSize: number
  dryRun: boolean
}) {
  let matched = 0
  let updated = 0
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  while (true) {
    let query = db.collection('numberStates')
      .where('awardedDrawId', '!=', null)
      .orderBy('awardedDrawId')
      .orderBy(documentId())
      .limit(params.chunkSize)

    if (lastDoc) {
      const lastAwardedDrawId = lastDoc.get('awardedDrawId')
      query = query.startAfter(lastAwardedDrawId, lastDoc.id)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    matched += snapshot.size
    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    if (!params.dryRun) {
      const batch: WriteBatch = db.batch()
      for (const doc of snapshot.docs) {
        batch.set(doc.ref, {
          awardedDrawId: FieldValue.delete(),
          awardedPrize: FieldValue.delete(),
          awardedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
      updated += snapshot.size
    }
  }

  console.log(`[numberStates.awarded*] matched=${matched} ${params.dryRun ? '(dry-run)' : `updated=${updated}`}`)
  return { matched, updated }
}

async function clearLatestDrawSnapshotsOnCampaign(campaignId: string, dryRun: boolean) {
  if (dryRun) {
    console.log(`[campaigns/${campaignId}] would delete latestTopBuyersDraw/latestMainRaffleDraw (dry-run)`)
    return { updated: 0 }
  }

  await db.collection('campaigns').doc(campaignId).set({
    latestTopBuyersDraw: FieldValue.delete(),
    latestMainRaffleDraw: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(`[campaigns/${campaignId}] deleted latest draw snapshots`)
  return { updated: 1 }
}

const serviceAccount = getServiceAccount()
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
    projectId,
  })
}

const db = getFirestore()

async function run() {
  const options = parseArgs(process.argv.slice(2))

  console.log(`Reset draws on project "${projectId}"`)
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (no writes)' : 'CONFIRMED (writes enabled)'}`)
  console.log(`Campaign: ${options.campaignId}`)
  console.log(`Include legacy collections (draws/winners): ${options.includeLegacyCollections ? 'yes' : 'no'}`)

  const topBuyers = await deleteByQueryInChunks({
    queryFactory: () => db.collection('topBuyersDrawResults'),
    chunkSize: options.chunkSize,
    dryRun: options.dryRun,
    label: 'topBuyersDrawResults',
  })

  const mainRaffle = await deleteByQueryInChunks({
    queryFactory: () => db.collection('mainRaffleDrawResults'),
    chunkSize: options.chunkSize,
    dryRun: options.dryRun,
    label: 'mainRaffleDrawResults',
  })

  let drawsLegacy = { matched: 0, deleted: 0 }
  let winnersLegacy = { matched: 0, deleted: 0 }

  if (options.includeLegacyCollections) {
    drawsLegacy = await deleteByQueryInChunks({
      queryFactory: () => db.collection('draws'),
      chunkSize: options.chunkSize,
      dryRun: options.dryRun,
      label: 'draws (legacy)',
    })

    winnersLegacy = await deleteByQueryInChunks({
      queryFactory: () => db.collection('winners'),
      chunkSize: options.chunkSize,
      dryRun: options.dryRun,
      label: 'winners (legacy)',
    })
  }

  const numberStates = await clearAwardedFlagsInNumberStates({
    chunkSize: options.chunkSize,
    dryRun: options.dryRun,
  })
  const campaignUpdate = await clearLatestDrawSnapshotsOnCampaign(options.campaignId, options.dryRun)

  console.log('\nSummary:')
  console.log(`- topBuyersDrawResults: matched=${topBuyers.matched}, affected=${options.dryRun ? 0 : topBuyers.deleted}`)
  console.log(`- mainRaffleDrawResults: matched=${mainRaffle.matched}, affected=${options.dryRun ? 0 : mainRaffle.deleted}`)
  console.log(`- numberStates awarded flags: matched=${numberStates.matched}, affected=${options.dryRun ? 0 : numberStates.updated}`)
  if (options.includeLegacyCollections) {
    console.log(`- draws: matched=${drawsLegacy.matched}, affected=${options.dryRun ? 0 : drawsLegacy.deleted}`)
    console.log(`- winners: matched=${winnersLegacy.matched}, affected=${options.dryRun ? 0 : winnersLegacy.deleted}`)
  }
  console.log(`- campaign latest snapshots: affected=${options.dryRun ? 0 : campaignUpdate.updated}`)

  if (options.dryRun) {
    console.log('\nNo data changed. Re-run with --confirm to apply.')
  } else {
    console.log('\nReset completed.')
  }
}

run().catch((error) => {
  console.error('Reset draws failed:', error)
  process.exit(1)
})
