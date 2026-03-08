import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore, type WriteBatch } from 'firebase-admin/firestore'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type RankingAggregate = {
  cotas: number
  firstPurchaseAtMs: number
}

const CHAMPIONS_RANKING_USERS_COLLECTION = 'championsRankingUsers'
const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'

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

function readString(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function readOrderQuantity(value: unknown, fallbackQuantity: unknown): number {
  if (Array.isArray(value)) {
    return value.filter((item) => Number.isInteger(item) && Number(item) > 0).length
  }

  const parsedQuantity = Number(fallbackQuantity)
  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    return 0
  }

  return parsedQuantity
}

function readTimestampMs(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis()
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

async function commitInChunks(pathsAndData: Array<{ path: string; data: Record<string, unknown> }>, chunkSize = 400) {
  let committed = 0
  for (let index = 0; index < pathsAndData.length; index += chunkSize) {
    const chunk = pathsAndData.slice(index, index + chunkSize)
    const batch: WriteBatch = db.batch()
    for (const row of chunk) {
      batch.set(db.doc(row.path), row.data, { merge: true })
    }
    await batch.commit()
    committed += chunk.length
  }

  return committed
}

const serviceAccount = getServiceAccount()
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
const campaignId = readString(process.env.CAMPAIGN_ID) || DEFAULT_CAMPAIGN_ID
const dryRun = process.env.DRY_RUN !== 'false'

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
  console.log(
    `Backfilling ${CHAMPIONS_RANKING_USERS_COLLECTION} for campaign "${campaignId}" (${dryRun ? 'DRY_RUN' : 'APPLY'})...`,
  )

  const ordersSnapshot = await db.collection('orders')
    .where('status', '==', 'paid')
    .where('type', '==', 'deposit')
    .where('campaignId', '==', campaignId)
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt')
    .get()

  const aggregatesByUser = new Map<string, RankingAggregate>()

  for (const doc of ordersSnapshot.docs) {
    const data = doc.data()
    const userId = readString(data.userId)
    if (!userId) {
      continue
    }

    const quantity = readOrderQuantity(data.reservedNumbers, data.quantity)
    if (quantity <= 0) {
      continue
    }

    const createdAtMs = readTimestampMs(data.createdAt)
    if (!createdAtMs) {
      continue
    }

    const previous = aggregatesByUser.get(userId)
    if (!previous) {
      aggregatesByUser.set(userId, {
        cotas: quantity,
        firstPurchaseAtMs: createdAtMs,
      })
      continue
    }

    aggregatesByUser.set(userId, {
      cotas: previous.cotas + quantity,
      firstPurchaseAtMs: Math.min(previous.firstPurchaseAtMs, createdAtMs),
    })
  }

  const nowMs = Date.now()
  const writes = Array.from(aggregatesByUser.entries()).map(([userId, aggregate]) => ({
    path: `${CHAMPIONS_RANKING_USERS_COLLECTION}/${userId}`,
    data: {
      campaignId,
      userId,
      cotas: aggregate.cotas,
      firstPurchaseAtMs: aggregate.firstPurchaseAtMs,
      updatedAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
    },
  }))

  console.log(`Paid orders scanned: ${ordersSnapshot.size}`)
  console.log(`Users aggregated: ${aggregatesByUser.size}`)
  console.log(`Documents to upsert: ${writes.length}`)

  if (dryRun) {
    console.log('Dry run complete. Set DRY_RUN=false to apply writes.')
    return
  }

  const committed = await commitInChunks(writes)
  console.log(`Backfill complete. Upserted ${committed} documents.`)
}

run().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
