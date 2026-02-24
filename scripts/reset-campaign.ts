import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import {
  FieldPath,
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type ResetOptions = {
  campaignId: string
  dryRun: boolean
  queryChunkSize: number
  writeChunkSize: number
  includeLegacyCollections: boolean
  includeLegacyCampaignNumbers: boolean
  confirmCampaignId: string | null
  confirmPhrase: string | null
}

type DeleteStats = {
  matched: number
  affected: number
}

type MetricsAdjustment = {
  totalRevenue: number
  paidOrders: number
  soldNumbers: number
  byDate: Map<string, { revenue: number; paidOrders: number; soldNumbers: number }>
}

type OrderCleanupStats = {
  orders: DeleteStats
  orderEvents: DeleteStats
  orderNumbersSubcollection: DeleteStats
  payments: DeleteStats
  salesLedger: DeleteStats
  metricsPlanned: {
    totalRevenue: number
    paidOrders: number
    soldNumbers: number
  }
}

const MAX_QUERY_CHUNK_SIZE = 450
const MAX_WRITE_CHUNK_SIZE = 420

function readArgValue(argv: string[], flag: string): string | null {
  const index = argv.findIndex((item) => item === flag)
  if (index < 0) {
    return null
  }

  return argv[index + 1] || null
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

function parseChunkSize(rawValue: string | null, fallbackValue: number, label: string) {
  const value = rawValue || String(fallbackValue)
  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_QUERY_CHUNK_SIZE) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_QUERY_CHUNK_SIZE}.`)
  }

  return parsed
}

function parseOptions(argv: string[]): ResetOptions {
  const dryRun = !argv.includes('--confirm')
  const campaignId = readArgValue(argv, '--campaign-id')
    || process.env.CAMPAIGN_DOC_ID
    || 'campanha-bmw-r1200-gs-2026'

  if (!campaignId) {
    throw new Error('Missing campaign id. Use --campaign-id <id> or CAMPAIGN_DOC_ID.')
  }

  const queryChunkSize = parseChunkSize(
    readArgValue(argv, '--query-chunk-size') || process.env.RESET_CAMPAIGN_QUERY_CHUNK_SIZE || null,
    300,
    'query chunk size',
  )

  const writeChunkSize = parseChunkSize(
    readArgValue(argv, '--write-chunk-size') || process.env.RESET_CAMPAIGN_WRITE_CHUNK_SIZE || null,
    300,
    'write chunk size',
  )

  if (writeChunkSize > MAX_WRITE_CHUNK_SIZE) {
    throw new Error(`write chunk size must be <= ${MAX_WRITE_CHUNK_SIZE}.`)
  }

  return {
    campaignId,
    dryRun,
    queryChunkSize,
    writeChunkSize,
    includeLegacyCollections: !argv.includes('--skip-legacy-collections'),
    includeLegacyCampaignNumbers: !argv.includes('--skip-legacy-campaign-numbers'),
    confirmCampaignId: readArgValue(argv, '--confirm-campaign-id'),
    confirmPhrase: readArgValue(argv, '--confirm-phrase'),
  }
}

function assertDoubleConfirmation(options: ResetOptions) {
  if (options.dryRun) {
    return
  }

  const expectedPhrase = `RESET:${options.campaignId}`

  if (options.confirmCampaignId !== options.campaignId) {
    throw new Error(`Second confirmation failed: use --confirm-campaign-id ${options.campaignId}`)
  }

  if (options.confirmPhrase !== expectedPhrase) {
    throw new Error(`Second confirmation failed: use --confirm-phrase ${expectedPhrase}`)
  }
}

function sanitizeString(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function sanitizeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function sanitizeInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : 0
}

function readTimestampMillis(value: unknown): number | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  if ('toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(millis) ? millis : null
  }

  return null
}

function toBrazilDateKey(sourceMs: number): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(new Date(sourceMs))
  const year = parts.find((item) => item.type === 'year')?.value || '0000'
  const month = parts.find((item) => item.type === 'month')?.value || '01'
  const day = parts.find((item) => item.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}

function readOrderSoldNumbers(data: DocumentData | undefined): number {
  const reservedNumbers = data?.reservedNumbers
  if (Array.isArray(reservedNumbers)) {
    return reservedNumbers.filter((item) => Number.isInteger(item) && Number(item) > 0).length
  }

  const quantity = Number(data?.quantity)
  if (Number.isInteger(quantity) && quantity > 0) {
    return quantity
  }

  return 0
}

function createEmptyMetricsAdjustment(): MetricsAdjustment {
  return {
    totalRevenue: 0,
    paidOrders: 0,
    soldNumbers: 0,
    byDate: new Map(),
  }
}

function buildMetricsAdjustment(params: {
  orderData: DocumentData | undefined
  salesLedgerData: DocumentData | undefined
}): MetricsAdjustment {
  const { orderData, salesLedgerData } = params
  const status = sanitizeString(orderData?.status).toLowerCase()
  const type = sanitizeString(orderData?.type).toLowerCase()

  if (status !== 'paid' || type !== 'deposit') {
    return createEmptyMetricsAdjustment()
  }

  const adjustment = createEmptyMetricsAdjustment()
  const ledgerRevenue = sanitizeNumber(salesLedgerData?.amount)
  const ledgerSoldNumbers = sanitizeInteger(salesLedgerData?.soldNumbers)
  const orderRevenue = sanitizeNumber(orderData?.amount)
  const orderSoldNumbers = readOrderSoldNumbers(orderData)

  adjustment.totalRevenue = ledgerRevenue > 0 ? ledgerRevenue : Math.max(orderRevenue, 0)
  adjustment.soldNumbers = ledgerSoldNumbers > 0 ? ledgerSoldNumbers : Math.max(orderSoldNumbers, 0)
  adjustment.paidOrders = 1

  const ledgerDateKey = sanitizeString(salesLedgerData?.dateKey)
  const paidAtMs = readTimestampMillis(orderData?.paidAt)
    || readTimestampMillis(orderData?.paidBusinessAppliedAt)
    || readTimestampMillis(orderData?.updatedAt)
  const dateKey = ledgerDateKey || (paidAtMs ? toBrazilDateKey(paidAtMs) : '')

  if (dateKey) {
    adjustment.byDate.set(dateKey, {
      revenue: adjustment.totalRevenue,
      paidOrders: adjustment.paidOrders,
      soldNumbers: adjustment.soldNumbers,
    })
  }

  return adjustment
}

function mergeMetricsAdjustment(target: MetricsAdjustment, source: MetricsAdjustment) {
  target.totalRevenue += source.totalRevenue
  target.paidOrders += source.paidOrders
  target.soldNumbers += source.soldNumbers

  for (const [dateKey, current] of source.byDate.entries()) {
    const previous = target.byDate.get(dateKey)

    if (!previous) {
      target.byDate.set(dateKey, { ...current })
      continue
    }

    target.byDate.set(dateKey, {
      revenue: previous.revenue + current.revenue,
      paidOrders: previous.paidOrders + current.paidOrders,
      soldNumbers: previous.soldNumbers + current.soldNumbers,
    })
  }
}

function applyMetricsAdjustmentToTransaction(transaction: Transaction, adjustment: MetricsAdjustment) {
  if (
    adjustment.totalRevenue <= 0
    && adjustment.paidOrders <= 0
    && adjustment.soldNumbers <= 0
    && adjustment.byDate.size === 0
  ) {
    return
  }

  const metricsSummaryRef = db.collection('metrics').doc('sales_summary')
  transaction.set(metricsSummaryRef, {
    totalRevenue: FieldValue.increment(-adjustment.totalRevenue),
    paidOrders: FieldValue.increment(-adjustment.paidOrders),
    soldNumbers: FieldValue.increment(-adjustment.soldNumbers),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  for (const [dateKey, value] of adjustment.byDate.entries()) {
    const dailyMetricsRef = db.collection('salesMetricsDaily').doc(dateKey)
    transaction.set(dailyMetricsRef, {
      date: dateKey,
      revenue: FieldValue.increment(-value.revenue),
      paidOrders: FieldValue.increment(-value.paidOrders),
      soldNumbers: FieldValue.increment(-value.soldNumbers),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
}

function chunkArray<T>(rows: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize))
  }

  return chunks
}

async function deleteRefsInTransactionalChunks(params: {
  refs: Array<DocumentReference<DocumentData>>
  writeChunkSize: number
  dryRun: boolean
  onFirstChunk?: (transaction: Transaction) => void
}) {
  if (params.refs.length === 0 || params.dryRun) {
    return
  }

  const chunks = chunkArray(params.refs, params.writeChunkSize)

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const refsChunk = chunks[chunkIndex]

    await db.runTransaction(async (transaction) => {
      if (chunkIndex === 0 && params.onFirstChunk) {
        params.onFirstChunk(transaction)
      }

      for (const ref of refsChunk) {
        transaction.delete(ref)
      }
    })
  }
}

async function deleteCollectionByCampaignInTransactions(params: {
  collectionName: string
  campaignId: string
  queryChunkSize: number
  writeChunkSize: number
  dryRun: boolean
  label: string
}) {
  let matched = 0
  let affected = 0
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  while (true) {
    let query: Query<DocumentData> = db.collection(params.collectionName)
      .where('campaignId', '==', params.campaignId)
      .orderBy(FieldPath.documentId())
      .limit(params.queryChunkSize)

    if (lastDoc) {
      query = query.startAfter(lastDoc.id)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    matched += snapshot.size
    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    const refs = snapshot.docs.map((doc) => doc.ref)

    await deleteRefsInTransactionalChunks({
      refs,
      writeChunkSize: params.writeChunkSize,
      dryRun: params.dryRun,
    })

    if (!params.dryRun) {
      affected += refs.length
    }
  }

  console.log(`[${params.label}] matched=${matched} ${params.dryRun ? '(dry-run)' : `affected=${affected}`}`)
  return { matched, affected } satisfies DeleteStats
}

async function resetLegacyCampaignNumbers(params: {
  campaignId: string
  queryChunkSize: number
  writeChunkSize: number
  dryRun: boolean
}) {
  const statuses = ['reserved', 'paid', 'reservado', 'pago']
  let matched = 0
  let affected = 0

  for (const status of statuses) {
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

    while (true) {
      let query: Query<DocumentData> = db.collection(`campaigns/${params.campaignId}/numbers`)
        .where('status', '==', status)
        .orderBy(FieldPath.documentId())
        .limit(params.queryChunkSize)

      if (lastDoc) {
        query = query.startAfter(lastDoc.id)
      }

      const snapshot = await query.get()
      if (snapshot.empty) {
        break
      }

      matched += snapshot.size
      lastDoc = snapshot.docs[snapshot.docs.length - 1]

      if (!params.dryRun) {
        const docsChunks = chunkArray(snapshot.docs, params.writeChunkSize)
        for (const chunk of docsChunks) {
          await db.runTransaction(async (transaction) => {
            for (const doc of chunk) {
              transaction.set(doc.ref, {
                status: 'available',
                reservedBy: null,
                reservedAt: null,
                reservationExpiresAt: null,
                expiresAt: null,
                ownerUid: null,
                orderId: null,
                paidAt: null,
                awardedDrawId: null,
                awardedPrize: null,
                awardedAt: null,
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true })
            }
          })
          affected += chunk.length
        }
      }
    }
  }

  console.log(`[campaigns/${params.campaignId}/numbers] matched=${matched} ${params.dryRun ? '(dry-run)' : `affected=${affected}`}`)
  return { matched, affected } satisfies DeleteStats
}

async function cleanupOrdersAndArtifacts(params: {
  campaignId: string
  queryChunkSize: number
  writeChunkSize: number
  dryRun: boolean
}) {
  const stats: OrderCleanupStats = {
    orders: { matched: 0, affected: 0 },
    orderEvents: { matched: 0, affected: 0 },
    orderNumbersSubcollection: { matched: 0, affected: 0 },
    payments: { matched: 0, affected: 0 },
    salesLedger: { matched: 0, affected: 0 },
    metricsPlanned: {
      totalRevenue: 0,
      paidOrders: 0,
      soldNumbers: 0,
    },
  }

  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  while (true) {
    let query = db.collection('orders')
      .where('campaignId', '==', params.campaignId)
      .orderBy(FieldPath.documentId())
      .limit(params.queryChunkSize)

    if (lastDoc) {
      query = query.startAfter(lastDoc.id)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    for (const orderDoc of snapshot.docs) {
      const orderRef = orderDoc.ref
      const orderId = orderDoc.id
      const paymentRef = db.collection('payments').doc(orderId)
      const salesLedgerRef = db.collection('salesLedger').doc(orderId)

      const [eventRefs, orderNumbersRefs, paymentSnapshot, salesLedgerSnapshot] = await Promise.all([
        orderRef.collection('events').listDocuments(),
        orderRef.collection('numbers').listDocuments(),
        paymentRef.get(),
        salesLedgerRef.get(),
      ])

      const orderData = orderDoc.data()
      const salesLedgerData = salesLedgerSnapshot.exists ? salesLedgerSnapshot.data() : undefined
      const adjustment = buildMetricsAdjustment({ orderData, salesLedgerData })

      stats.orders.matched += 1
      stats.orderEvents.matched += eventRefs.length
      stats.orderNumbersSubcollection.matched += orderNumbersRefs.length
      stats.payments.matched += paymentSnapshot.exists ? 1 : 0
      stats.salesLedger.matched += salesLedgerSnapshot.exists ? 1 : 0
      stats.metricsPlanned.totalRevenue += adjustment.totalRevenue
      stats.metricsPlanned.paidOrders += adjustment.paidOrders
      stats.metricsPlanned.soldNumbers += adjustment.soldNumbers

      const refsToDelete: Array<DocumentReference<DocumentData>> = [
        orderRef,
        ...eventRefs,
        ...orderNumbersRefs,
      ]

      if (paymentSnapshot.exists) {
        refsToDelete.push(paymentRef)
      }

      if (salesLedgerSnapshot.exists) {
        refsToDelete.push(salesLedgerRef)
      }

      await deleteRefsInTransactionalChunks({
        refs: refsToDelete,
        writeChunkSize: params.writeChunkSize,
        dryRun: params.dryRun,
        onFirstChunk: (transaction) => {
          applyMetricsAdjustmentToTransaction(transaction, adjustment)
        },
      })

      if (!params.dryRun) {
        stats.orders.affected += 1
        stats.orderEvents.affected += eventRefs.length
        stats.orderNumbersSubcollection.affected += orderNumbersRefs.length
        stats.payments.affected += paymentSnapshot.exists ? 1 : 0
        stats.salesLedger.affected += salesLedgerSnapshot.exists ? 1 : 0
      }
    }
  }

  console.log(`[orders] matched=${stats.orders.matched} ${params.dryRun ? '(dry-run)' : `affected=${stats.orders.affected}`}`)
  console.log(`[orders/*/events] matched=${stats.orderEvents.matched} ${params.dryRun ? '(dry-run)' : `affected=${stats.orderEvents.affected}`}`)
  console.log(`[orders/*/numbers] matched=${stats.orderNumbersSubcollection.matched} ${params.dryRun ? '(dry-run)' : `affected=${stats.orderNumbersSubcollection.affected}`}`)
  console.log(`[payments] matched=${stats.payments.matched} ${params.dryRun ? '(dry-run)' : `affected=${stats.payments.affected}`}`)
  console.log(`[salesLedger] matched=${stats.salesLedger.matched} ${params.dryRun ? '(dry-run)' : `affected=${stats.salesLedger.affected}`}`)

  if (params.dryRun) {
    console.log(
      `[metrics adjustments planned] revenue=-${stats.metricsPlanned.totalRevenue.toFixed(2)}, paidOrders=-${stats.metricsPlanned.paidOrders}, soldNumbers=-${stats.metricsPlanned.soldNumbers}`,
    )
  } else {
    console.log(
      `[metrics adjustments applied] revenue=-${stats.metricsPlanned.totalRevenue.toFixed(2)}, paidOrders=-${stats.metricsPlanned.paidOrders}, soldNumbers=-${stats.metricsPlanned.soldNumbers}`,
    )
  }

  return stats
}

async function resetCampaignSnapshotAndCounters(campaignId: string, dryRun: boolean) {
  const campaignRef = db.collection('campaigns').doc(campaignId)
  const campaignSnapshot = await campaignRef.get()

  if (!campaignSnapshot.exists) {
    console.log(`[campaigns/${campaignId}] not found, skip counters reset`)
    return { affected: 0 }
  }

  const campaignData = campaignSnapshot.data() || {}
  const totalNumbers = Math.max(
    sanitizeInteger(campaignData.totalNumbers),
    sanitizeInteger(campaignData.totalCotas),
  )

  if (dryRun) {
    console.log(
      `[campaigns/${campaignId}] would reset sold/reserved counters and latest draw snapshots${totalNumbers > 0 ? ` (availableCotas=${totalNumbers})` : ''} (dry-run)`,
    )
    return { affected: 0 }
  }

  await db.runTransaction(async (transaction) => {
    const updateData: DocumentData = {
      soldCotas: 0,
      reservedCotas: 0,
      latestTopBuyersDraw: FieldValue.delete(),
      latestMainRaffleDraw: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (totalNumbers > 0) {
      updateData.availableCotas = totalNumbers
    }

    transaction.set(campaignRef, updateData, { merge: true })
  })

  console.log(`[campaigns/${campaignId}] counters/snapshots reset`)
  return { affected: 1 }
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
  const options = parseOptions(process.argv.slice(2))
  assertDoubleConfirmation(options)

  console.log(`Reset campaign data on project "${projectId}"`)
  console.log(`Campaign: ${options.campaignId}`)
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (no writes)' : 'CONFIRMED (writes enabled)'}`)
  console.log(`Chunk sizes: query=${options.queryChunkSize}, write=${options.writeChunkSize}`)
  console.log(`Include legacy collections (draws/winners): ${options.includeLegacyCollections ? 'yes' : 'no'}`)
  console.log(`Include legacy campaign numbers reset: ${options.includeLegacyCampaignNumbers ? 'yes' : 'no'}`)

  const orderStats = await cleanupOrdersAndArtifacts({
    campaignId: options.campaignId,
    queryChunkSize: options.queryChunkSize,
    writeChunkSize: options.writeChunkSize,
    dryRun: options.dryRun,
  })

  const numberStates = await deleteCollectionByCampaignInTransactions({
    collectionName: 'numberStates',
    campaignId: options.campaignId,
    queryChunkSize: options.queryChunkSize,
    writeChunkSize: options.writeChunkSize,
    dryRun: options.dryRun,
    label: 'numberStates',
  })

  const reservations = await deleteCollectionByCampaignInTransactions({
    collectionName: 'numberReservations',
    campaignId: options.campaignId,
    queryChunkSize: options.queryChunkSize,
    writeChunkSize: options.writeChunkSize,
    dryRun: options.dryRun,
    label: 'numberReservations',
  })

  const topBuyersDrawResults = await deleteCollectionByCampaignInTransactions({
    collectionName: 'topBuyersDrawResults',
    campaignId: options.campaignId,
    queryChunkSize: options.queryChunkSize,
    writeChunkSize: options.writeChunkSize,
    dryRun: options.dryRun,
    label: 'topBuyersDrawResults',
  })

  const mainRaffleDrawResults = await deleteCollectionByCampaignInTransactions({
    collectionName: 'mainRaffleDrawResults',
    campaignId: options.campaignId,
    queryChunkSize: options.queryChunkSize,
    writeChunkSize: options.writeChunkSize,
    dryRun: options.dryRun,
    label: 'mainRaffleDrawResults',
  })

  let drawsLegacy: DeleteStats = { matched: 0, affected: 0 }
  let winnersLegacy: DeleteStats = { matched: 0, affected: 0 }

  if (options.includeLegacyCollections) {
    drawsLegacy = await deleteCollectionByCampaignInTransactions({
      collectionName: 'draws',
      campaignId: options.campaignId,
      queryChunkSize: options.queryChunkSize,
      writeChunkSize: options.writeChunkSize,
      dryRun: options.dryRun,
      label: 'draws (legacy)',
    })

    winnersLegacy = await deleteCollectionByCampaignInTransactions({
      collectionName: 'winners',
      campaignId: options.campaignId,
      queryChunkSize: options.queryChunkSize,
      writeChunkSize: options.writeChunkSize,
      dryRun: options.dryRun,
      label: 'winners (legacy)',
    })
  }

  let legacyCampaignNumbers: DeleteStats = { matched: 0, affected: 0 }

  if (options.includeLegacyCampaignNumbers) {
    legacyCampaignNumbers = await resetLegacyCampaignNumbers({
      campaignId: options.campaignId,
      queryChunkSize: options.queryChunkSize,
      writeChunkSize: options.writeChunkSize,
      dryRun: options.dryRun,
    })
  }

  const campaignReset = await resetCampaignSnapshotAndCounters(options.campaignId, options.dryRun)

  console.log('\nSummary:')
  console.log(`- orders: matched=${orderStats.orders.matched}, affected=${options.dryRun ? 0 : orderStats.orders.affected}`)
  console.log(`- orders/*/events: matched=${orderStats.orderEvents.matched}, affected=${options.dryRun ? 0 : orderStats.orderEvents.affected}`)
  console.log(`- orders/*/numbers: matched=${orderStats.orderNumbersSubcollection.matched}, affected=${options.dryRun ? 0 : orderStats.orderNumbersSubcollection.affected}`)
  console.log(`- payments: matched=${orderStats.payments.matched}, affected=${options.dryRun ? 0 : orderStats.payments.affected}`)
  console.log(`- salesLedger: matched=${orderStats.salesLedger.matched}, affected=${options.dryRun ? 0 : orderStats.salesLedger.affected}`)
  console.log(`- numberStates: matched=${numberStates.matched}, affected=${options.dryRun ? 0 : numberStates.affected}`)
  console.log(`- numberReservations: matched=${reservations.matched}, affected=${options.dryRun ? 0 : reservations.affected}`)
  console.log(`- topBuyersDrawResults: matched=${topBuyersDrawResults.matched}, affected=${options.dryRun ? 0 : topBuyersDrawResults.affected}`)
  console.log(`- mainRaffleDrawResults: matched=${mainRaffleDrawResults.matched}, affected=${options.dryRun ? 0 : mainRaffleDrawResults.affected}`)

  if (options.includeLegacyCollections) {
    console.log(`- draws (legacy): matched=${drawsLegacy.matched}, affected=${options.dryRun ? 0 : drawsLegacy.affected}`)
    console.log(`- winners (legacy): matched=${winnersLegacy.matched}, affected=${options.dryRun ? 0 : winnersLegacy.affected}`)
  }

  if (options.includeLegacyCampaignNumbers) {
    console.log(`- campaigns/${options.campaignId}/numbers reset: matched=${legacyCampaignNumbers.matched}, affected=${options.dryRun ? 0 : legacyCampaignNumbers.affected}`)
  }

  if (options.dryRun) {
    console.log('- campaign counters/snapshots: affected=0')
    console.log('\nNo data changed. To apply, use:')
    console.log(`bun run scripts/reset-campaign.ts --campaign-id ${options.campaignId} --confirm --confirm-campaign-id ${options.campaignId} --confirm-phrase RESET:${options.campaignId}`)
    return
  }

  console.log(`- campaign counters/snapshots: affected=${campaignReset.affected}`)
  console.log('\nCampaign reset completed.')
}

run().catch((error) => {
  console.error('Reset campaign failed:', error)
  process.exit(1)
})
