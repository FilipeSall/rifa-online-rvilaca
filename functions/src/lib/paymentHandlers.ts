import QRCode from 'qrcode'
import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { extractExternalId, extractPixPayload } from './horsepayPayload.js'
import { toHttpsError } from './horsepayClient.js'
import {
  CAMPAIGN_DOC_ID,
  DEPOSIT_RETRY_DELAY_MS,
  MAX_DEPOSIT_ORDER_ATTEMPTS,
  REGION,
  type OrderStatus,
  type OrderType,
  type PixType,
} from './constants.js'
import { createPaymentGateway, resolveHorsePayBaseUrl, shouldUseMockHorsePay } from './paymentGateway.js'
import { getCampaignDocCached } from './campaignDocCache.js'
import {
  readCampaignCoupons,
  readCampaignFeaturedPromotion,
  readCampaignPackPrices,
  readCampaignPurchaseQuantityLimits,
  readCampaignPricePerCota,
} from './campaignHandlers.js'
import {
  buildChunkBoundsForChunkStart,
  clearNumberReservation,
  getChunkNumberView,
  getNumberChunkRef,
  mapNumbersByChunkStart,
  markNumberAsPaid,
  NUMBER_CHUNK_SIZE,
  readChunkStateFromDoc,
  type NumberChunkRuntimeState,
  writeChunkStateToDoc,
} from './numberChunkStore.js'
import {
  readCampaignNumberRange,
} from './numberStateStore.js'
import { readStoredReservationNumbers } from './reservationHandlers.js'
import {
  asRecord,
  buildWebhookEventId,
  getBrazilDateKey,
  getTopLevelKeys,
  getValueShape,
  hasValidWebhookToken,
  maskName,
  maskPhoneNumber,
  maskPixKey,
  maskUid,
  readString,
  readTimestampMillis,
  sameNumberSet,
  sanitizeAmount,
  sanitizeOptionalAmount,
  sanitizeString,
  sleep,
  requireActiveUid,
  type JsonRecord,
} from './shared.js'

interface CreatePixDepositInput {
  amount?: number
  payerName: string
  phone?: string
  cpf?: string
  couponCode?: string
}

interface CreatePixDepositOutput {
  externalId: string
  copyPaste: string | null
  qrCode: string | null
  status: 'pending' | 'failed'
}

type CouponResolution = {
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  discountAmount: number
}

type PricingSummary = {
  quantity: number
  unitPriceAtCheckout: number
  matchedPackQuantity: number | null
  subtotalBaseAmount: number
  promotionDiscountAmount: number
  subtotalAfterPromotionAmount: number
  expectedAmount: number
  appliedPromotionLabel: string | null
  appliedPromotionType: 'percent' | 'fixed' | null
  appliedPromotionValue: number | null
}

interface RequestWithdrawInput {
  amount: number
  pixKey: string
  pixType: PixType
}

interface ProcessWebhookOrderResult {
  externalId: string
  campaignId: string
  orderType: OrderType
  status: OrderStatus
  eventId: string
  userId: string | null
  amount: number | null
  reservedNumbers: number[]
  shouldApplyPaidDeposit: boolean
}

interface HorsePaySecretReaders {
  getClientKey: () => string
  getClientSecret: () => string
  getWebhookToken: () => string
}

interface WebhookRequest {
  method: string
  body: unknown
  query?: unknown
  headers?: unknown
  ip?: string
}

interface WebhookResponse {
  status: (code: number) => { json: (body: unknown) => void }
}

function dataUrlToBase64(value: string): string | null {
  const trimmed = sanitizeString(value)
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=]+)$/i.exec(trimmed)
  return match?.[1] || null
}

async function ensureQrCodeBase64(
  qrCode: string | null,
  copyPaste: string | null,
): Promise<string | null> {
  if (qrCode) {
    const fromDataUrl = dataUrlToBase64(qrCode)
    return fromDataUrl || qrCode
  }

  if (!copyPaste) {
    return null
  }

  try {
    const dataUrl = await QRCode.toDataURL(copyPaste, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
    })

    return dataUrlToBase64(dataUrl) || null
  } catch (error) {
    logger.warn('Failed to generate QR code from copyPaste', {
      error: String(error),
    })
    return null
  }
}

function parseFirebaseProjectId(): string | null {
  if (process.env.GCLOUD_PROJECT) {
    return process.env.GCLOUD_PROJECT
  }

  if (!process.env.FIREBASE_CONFIG) {
    return null
  }

  try {
    const parsed = JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: string }
    return parsed?.projectId || null
  } catch {
    return null
  }
}

function getWebhookUrl(webhookToken?: string | null): string | null {
  const configuredCallbackUrl = sanitizeString(process.env.HORSEPAY_WEBHOOK_CALLBACK_URL)
  if (configuredCallbackUrl) {
    try {
      const parsed = new URL(configuredCallbackUrl)
      if (webhookToken && !parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', webhookToken)
      }
      return parsed.toString()
    } catch {
      return null
    }
  }

  const projectId = parseFirebaseProjectId()

  if (!projectId) {
    return null
  }

  const baseUrl = `https://${REGION}-${projectId}.cloudfunctions.net/pixWebhook`
  if (!webhookToken) {
    return baseUrl
  }

  return `${baseUrl}?token=${encodeURIComponent(webhookToken)}`
}

function resolveOrderStatusTransition(currentStatus: OrderStatus | null, incomingStatus: OrderStatus): OrderStatus {
  if (!currentStatus) {
    return incomingStatus
  }

  if (currentStatus === 'paid') {
    return 'paid'
  }

  if (currentStatus === 'failed' && incomingStatus === 'pending') {
    return 'failed'
  }

  return incomingStatus
}

function sanitizePixType(value: unknown): PixType {
  const pixType = sanitizeString(value).toUpperCase() as PixType
  const allowed = new Set<PixType>(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])

  if (!allowed.has(pixType)) {
    throw new HttpsError('invalid-argument', 'pixType invalido')
  }

  return pixType
}

function sanitizeCpf(value: unknown): string | null {
  const digits = sanitizeString(value).replace(/\D/g, '')
  if (!digits) {
    return null
  }

  if (digits.length !== 11) {
    throw new HttpsError('invalid-argument', 'cpf deve conter 11 digitos')
  }

  return digits
}

function normalizeGatewayPhone(value: unknown): string | null {
  const rawDigits = sanitizeString(value).replace(/\D/g, '')
  if (!rawDigits) {
    return null
  }

  let digits = rawDigits
  if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(-11)
  }

  if (digits.length === 10 || digits.length === 11) {
    return digits
  }

  return null
}

function inferOrderStatus(payload: unknown): OrderStatus {
  const record = asRecord(payload)

  if (record.status === true) {
    return 'paid'
  }

  if (record.status === false) {
    return 'failed'
  }

  const rawStatus = String(
    record.status || record.payment_status || record.transaction_status || record.order_status || '',
  )
    .trim()
    .toLowerCase()

  if (!rawStatus) {
    return 'pending'
  }

  if (
    rawStatus.includes('paid') ||
    rawStatus.includes('success') ||
    rawStatus.includes('approved') ||
    rawStatus.includes('completed')
  ) {
    return 'paid'
  }

  if (
    rawStatus.includes('fail') ||
    rawStatus.includes('cancel') ||
    rawStatus.includes('reject') ||
    rawStatus.includes('expired')
  ) {
    return 'failed'
  }

  return 'pending'
}

function inferOrderType(payload: unknown, fallback: OrderType = 'deposit'): OrderType {
  const record = asRecord(payload)
  const value = String(record.type || record.transaction_type || record.operation || '')
    .trim()
    .toLowerCase()

  if (!value) {
    return fallback
  }

  if (value.includes('withdraw') || value.includes('saque')) {
    return 'withdraw'
  }

  if (value.includes('deposit') || value.includes('pix')) {
    return 'deposit'
  }

  return fallback
}

function computeDiscountAmount(
  subtotal: number,
  discountType: 'percent' | 'fixed',
  discountValue: number,
) {
  if (discountType === 'percent') {
    return Number(Math.min(subtotal, subtotal * (discountValue / 100)).toFixed(2))
  }

  return Number(Math.min(subtotal, discountValue).toFixed(2))
}

function resolveCoupon(params: {
  rawCouponCode: unknown
  campaignCoupons: ReturnType<typeof readCampaignCoupons>
  subtotal: number
}): CouponResolution | null {
  const couponCode = sanitizeString(params.rawCouponCode)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24)
  if (!couponCode) {
    return null
  }

  const matchedCoupon = params.campaignCoupons.find(
    (coupon) => coupon.code === couponCode && coupon.active,
  )

  if (!matchedCoupon) {
    throw new HttpsError('invalid-argument', 'Cupom invalido ou inativo para esta campanha.')
  }

  const discountAmount = computeDiscountAmount(
    params.subtotal,
    matchedCoupon.discountType,
    matchedCoupon.discountValue,
  )

  if (discountAmount <= 0) {
    throw new HttpsError('invalid-argument', 'Cupom sem efeito para o valor atual da compra.')
  }

  return {
    code: matchedCoupon.code,
    discountType: matchedCoupon.discountType,
    discountValue: matchedCoupon.discountValue,
    discountAmount,
  }
}

function calculatePromotionDiscount(
  subtotalBase: number,
  quantity: number,
  featuredPromotion: ReturnType<typeof readCampaignFeaturedPromotion>,
) {
  if (!featuredPromotion || !featuredPromotion.active || quantity < featuredPromotion.targetQuantity) {
    return {
      discount: 0,
      label: null as string | null,
      discountType: null as 'percent' | 'fixed' | null,
      discountValue: null as number | null,
    }
  }

  if (featuredPromotion.discountType === 'percent') {
    const discount = Number(Math.min(subtotalBase, subtotalBase * (featuredPromotion.discountValue / 100)).toFixed(2))
    return {
      discount,
      label: featuredPromotion.label || null,
      discountType: featuredPromotion.discountType,
      discountValue: featuredPromotion.discountValue,
    }
  }

  const discount = Number(Math.min(subtotalBase, featuredPromotion.discountValue).toFixed(2))
  return {
    discount,
    label: featuredPromotion.label || null,
    discountType: featuredPromotion.discountType,
    discountValue: featuredPromotion.discountValue,
  }
}

function calculatePricingSummary(campaignData: DocumentData | undefined, quantity: number): PricingSummary {
  const unitPriceAtCheckout = readCampaignPricePerCota(campaignData)
  const packPrices = readCampaignPackPrices(campaignData)
  const featuredPromotion = readCampaignFeaturedPromotion(campaignData)
  const matchedPack = packPrices.find((pack) => pack.active && pack.quantity === quantity) || null
  const subtotalBaseAmount = matchedPack
    ? Number(matchedPack.price.toFixed(2))
    : Number((quantity * unitPriceAtCheckout).toFixed(2))
  const promotion = calculatePromotionDiscount(subtotalBaseAmount, quantity, featuredPromotion)
  const subtotalAfterPromotionAmount = Number(Math.max(subtotalBaseAmount - promotion.discount, 0).toFixed(2))

  return {
    quantity,
    unitPriceAtCheckout,
    matchedPackQuantity: matchedPack?.quantity || null,
    subtotalBaseAmount,
    promotionDiscountAmount: promotion.discount,
    subtotalAfterPromotionAmount,
    expectedAmount: subtotalAfterPromotionAmount,
    appliedPromotionLabel: promotion.label,
    appliedPromotionType: promotion.discountType,
    appliedPromotionValue: promotion.discountValue,
  }
}

function parseOrderNumberCandidate(value: unknown): number | null {
  if (Number.isInteger(value)) {
    return Number(value)
  }

  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  const digits = normalized.replace(/\D/g, '')
  if (!digits) {
    return null
  }

  const parsed = Number(digits)
  return Number.isInteger(parsed) ? parsed : null
}

function sanitizeOrderNumbersForRange(value: unknown, rangeStart: number, rangeEnd: number): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => parseOrderNumberCandidate(item))
      .filter((item): item is number =>
        item !== null && item >= rangeStart && item <= rangeEnd),
  )).sort((a, b) => a - b)
}

export async function readLegacyOrderNumbersSubcollection(params: {
  db: Firestore
  externalId: string
  rangeStart: number
  rangeEnd: number
}) {
  const snapshot = await params.db.collection('orders').doc(params.externalId).collection('numbers')
    .select('number', 'ticketNumber', 'numero', 'value')
    .get()

  const recovered = new Set<number>()

  for (const document of snapshot.docs) {
    const data = document.data()
    const candidates = [
      data.number,
      data.ticketNumber,
      data.numero,
      data.value,
      document.id,
    ]

    for (const candidate of candidates) {
      const parsed = parseOrderNumberCandidate(candidate)
      if (
        parsed !== null
        && parsed >= params.rangeStart
        && parsed <= params.rangeEnd
      ) {
        recovered.add(parsed)
        break
      }
    }
  }

  return Array.from(recovered).sort((a, b) => a - b)
}

async function processWebhookOrder(
  db: Firestore,
  params: {
    externalId: string
    payload: JsonRecord
    copyPaste: string | null
    qrCode: string | null
  },
): Promise<ProcessWebhookOrderResult> {
  const { externalId, payload, copyPaste, qrCode } = params
  logger.info('processWebhookOrder started', {
    externalId,
    hasCopyPaste: Boolean(copyPaste),
    hasQrCode: Boolean(qrCode),
    topLevelKeys: getTopLevelKeys(payload),
  })
  const orderRef = db.collection('orders').doc(externalId)
  const eventId = buildWebhookEventId(externalId, payload)
  const eventRef = orderRef.collection('events').doc(eventId)
  const incomingStatus = inferOrderStatus(payload)
  let result: ProcessWebhookOrderResult = {
    externalId,
    campaignId: CAMPAIGN_DOC_ID,
    eventId,
    orderType: 'deposit',
    status: incomingStatus,
    userId: null,
    amount: sanitizeOptionalAmount(payload.amount),
    reservedNumbers: [],
    shouldApplyPaidDeposit: false,
  }

  await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef)
    const eventSnapshot = await transaction.get(eventRef)
    const existingOrder = (orderSnapshot.exists ? orderSnapshot.data() : null) as DocumentData | null
    const existingOrderType = (existingOrder?.type as OrderType | undefined) || 'deposit'
    const campaignId = readString(existingOrder?.campaignId) || CAMPAIGN_DOC_ID
    const orderType = inferOrderType(payload, existingOrderType)
    const existingStatusRaw = sanitizeString(existingOrder?.status).toLowerCase()
    const currentStatus: OrderStatus | null =
      existingStatusRaw === 'pending' || existingStatusRaw === 'paid' || existingStatusRaw === 'failed'
        ? (existingStatusRaw as OrderStatus)
        : null
    const status = resolveOrderStatusTransition(currentStatus, incomingStatus)
    const userId = readString(existingOrder?.userId)
    const reservedNumbers = readStoredReservationNumbers(existingOrder?.reservedNumbers)
    const existingAmount = sanitizeOptionalAmount(existingOrder?.amount)
    const payloadAmount = sanitizeOptionalAmount(payload.amount)
    const amount = existingAmount ?? payloadAmount
    const hasPaidApplied = readTimestampMillis(existingOrder?.paidBusinessAppliedAt) !== null
    const processingBy = sanitizeString(existingOrder?.paidBusinessProcessingBy)
    const shouldApplyPaidDeposit =
      status === 'paid' && orderType === 'deposit' && !hasPaidApplied && !processingBy

    if (!eventSnapshot.exists) {
      transaction.create(eventRef, {
        eventId,
        externalId,
        orderType,
        status,
        source: 'horsepay_webhook',
        hasInfractionStatus: payload.infraction_status !== undefined,
        payload,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    const updateData: DocumentData = {
      externalId,
      campaignId,
      type: orderType,
      status,
      webhookPayload: payload,
      webhookPayloadHash: eventId,
      latestWebhookEventId: eventId,
      webhookReceivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (userId) {
      updateData.userId = userId
    }

    if (amount !== null) {
      updateData.amount = amount
    }

    if (copyPaste) {
      updateData.pixCopyPaste = copyPaste
    }

    if (qrCode) {
      updateData.pixQrCode = qrCode
    }

    if (shouldApplyPaidDeposit) {
      updateData.paidBusinessProcessingBy = eventId
      updateData.paidBusinessProcessingAt = FieldValue.serverTimestamp()
      updateData.paidBusinessProcessingError = null
    }

    transaction.set(orderRef, updateData, { merge: true })
    result = {
      externalId,
      campaignId,
      eventId,
      orderType,
      status,
      userId,
      amount,
      reservedNumbers,
      shouldApplyPaidDeposit,
    }
  })

  logger.info('processWebhookOrder succeeded', {
    externalId: result.externalId,
    eventId: result.eventId,
    status: result.status,
    orderType: result.orderType,
    shouldApplyPaidDeposit: result.shouldApplyPaidDeposit,
    reservedNumbersCount: result.reservedNumbers.length,
  })

  return result
}

export async function runPaidDepositBusinessLogic(
  db: Firestore,
  order: {
    externalId: string
    campaignId: string
    userId: string | null
    amount: number | null
    reservedNumbers: number[]
  },
) {
  const startedAtMs = Date.now()
  const campaignData = await getCampaignDocCached(db, order.campaignId)
  const campaignRange = readCampaignNumberRange(campaignData, order.campaignId)
  const normalizedReservedNumbers = readStoredReservationNumbers(
    order.reservedNumbers,
    campaignRange.start,
    campaignRange.end,
  )

  if (!order.userId) {
    throw new HttpsError(
      'failed-precondition',
      `Pedido ${order.externalId} nao possui userId para baixa de numeros.`,
    )
  }

  if (normalizedReservedNumbers.length <= 0) {
    throw new HttpsError(
      'failed-precondition',
      `Pedido ${order.externalId} pago sem numeros reservados para baixa.`,
    )
  }
  const userId = order.userId

  const transactionStats = {
    numbersRequested: normalizedReservedNumbers.length,
    previousCount: 0,
    uniqueStateReads: 0,
    transactionAttempts: 0,
    conflictsCount: 0,
    chunksRead: 0,
    chunksWritten: 0,
  }

  logger.info('runPaidDepositBusinessLogic started', {
    externalId: order.externalId,
    campaignId: order.campaignId,
    userId: maskUid(userId),
    reservedNumbersCount: normalizedReservedNumbers.length,
    amount: sanitizeOptionalAmount(order.amount),
    numbersRequested: transactionStats.numbersRequested,
    previousCount: transactionStats.previousCount,
    uniqueStateReads: transactionStats.uniqueStateReads,
    transactionAttempts: transactionStats.transactionAttempts,
    conflictsCount: transactionStats.conflictsCount,
    chunksRead: transactionStats.chunksRead,
    chunksWritten: transactionStats.chunksWritten,
  })
  const paymentRef = db.collection('payments').doc(order.externalId)
  const salesLedgerRef = db.collection('salesLedger').doc(order.externalId)
  const metricsSummaryRef = db.collection('metrics').doc('sales_summary')
  const dateKey = getBrazilDateKey()
  const dailyMetricsRef = db.collection('salesMetricsDaily').doc(dateKey)
  const reservationRef = db.collection('numberReservations').doc(userId)
  const normalizedAmount = sanitizeOptionalAmount(order.amount)
  const nowMs = Date.now()

  const soldNumbersCommitted = await db.runTransaction(async (transaction) => {
    transactionStats.transactionAttempts += 1
    let soldNumbersInAttempt = 0
    const headerRefs = reservationRef ? [reservationRef, salesLedgerRef] : [salesLedgerRef]
    const headerSnapshots = await transaction.getAll(...headerRefs)
    const reservationSnapshot = reservationRef ? headerSnapshots[0] : null
    const salesLedgerSnapshot = reservationRef ? headerSnapshots[1] : headerSnapshots[0]
    transactionStats.uniqueStateReads = normalizedReservedNumbers.length

    const chunkStatesByStart = new Map<number, NumberChunkRuntimeState>()
    const chunkRefs = new Map<number, ReturnType<typeof getNumberChunkRef>>()

    const grouped = mapNumbersByChunkStart({
      numbers: normalizedReservedNumbers,
      rangeStart: campaignRange.start,
      rangeEnd: campaignRange.end,
    })
    const chunkStarts = Array.from(grouped.keys()).sort((a, b) => a - b)
    for (const chunkStart of chunkStarts) {
      chunkRefs.set(chunkStart, getNumberChunkRef(db, order.campaignId, chunkStart))
    }
    transactionStats.chunksRead = chunkStarts.length

    const orderedChunkRefs = chunkStarts
      .map((chunkStart) => chunkRefs.get(chunkStart))
      .filter((ref): ref is ReturnType<typeof getNumberChunkRef> => Boolean(ref))
    const chunkSnapshots = orderedChunkRefs.length > 0
      ? await transaction.getAll(...orderedChunkRefs)
      : []

    for (let index = 0; index < chunkStarts.length; index += 1) {
      const chunkStart = chunkStarts[index]
      const snapshot = chunkSnapshots[index]
      const bounds = buildChunkBoundsForChunkStart({
        campaignId: order.campaignId,
        rangeStart: campaignRange.start,
        rangeEnd: campaignRange.end,
        chunkStart,
      })
      const chunkState = readChunkStateFromDoc({
        bounds,
        docData: snapshot?.exists ? (snapshot.data() || null) : null,
        nowMs,
      })
      chunkStatesByStart.set(chunkStart, chunkState)
    }

    for (const number of normalizedReservedNumbers) {
      const chunkStart = campaignRange.start + Math.floor((number - campaignRange.start) / NUMBER_CHUNK_SIZE) * NUMBER_CHUNK_SIZE
      const chunkState = chunkStatesByStart.get(chunkStart)
      if (!chunkState) {
        continue
      }

      const state = getChunkNumberView(chunkState, number)
      if (state.status === 'pago') {
        transactionStats.conflictsCount += 1
        continue
      }

      if (state.status === 'reservado' && state.reservedBy && state.reservedBy !== userId) {
        transactionStats.conflictsCount += 1
        continue
      }

      clearNumberReservation({
        state: chunkState,
        number,
        uid: userId,
      })
      markNumberAsPaid({
        state: chunkState,
        number,
        userId,
        orderId: order.externalId,
        paidAtMs: nowMs,
      })
      soldNumbersInAttempt += 1
    }

    const reservationNumbers = reservationSnapshot?.exists
      ? readStoredReservationNumbers(reservationSnapshot.get('numbers'), campaignRange.start, campaignRange.end)
      : []
    transactionStats.previousCount = reservationNumbers.length
    const shouldDeleteReservation = Boolean(
      reservationRef
      && reservationSnapshot?.exists
      && sameNumberSet(reservationNumbers, normalizedReservedNumbers),
    )

    transaction.set(
      paymentRef,
      {
        externalId: order.externalId,
        userId,
        amount: normalizedAmount,
        status: 'paid',
        source: 'horsepay_webhook',
        releasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    if (!salesLedgerSnapshot.exists) {
      transaction.create(salesLedgerRef, {
        externalId: order.externalId,
        userId,
        amount: normalizedAmount,
        soldNumbers: soldNumbersInAttempt,
        dateKey,
        source: 'horsepay_webhook',
        createdAt: FieldValue.serverTimestamp(),
      })

      if (normalizedAmount !== null) {
        transaction.set(
          metricsSummaryRef,
          {
            totalRevenue: FieldValue.increment(normalizedAmount),
            paidOrders: FieldValue.increment(1),
            soldNumbers: FieldValue.increment(soldNumbersInAttempt),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        transaction.set(
          dailyMetricsRef,
          {
            date: dateKey,
            revenue: FieldValue.increment(normalizedAmount),
            paidOrders: FieldValue.increment(1),
            soldNumbers: FieldValue.increment(soldNumbersInAttempt),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
    }

    transactionStats.chunksWritten = 0
    for (const [chunkStart, chunkState] of chunkStatesByStart.entries()) {
      if (!chunkState.dirty) {
        continue
      }
      const chunkRef = chunkRefs.get(chunkStart)
      if (!chunkRef) {
        continue
      }
      transaction.set(chunkRef, writeChunkStateToDoc(chunkState), { merge: true })
      transactionStats.chunksWritten += 1
    }

    if (shouldDeleteReservation && reservationRef) {
      transaction.delete(reservationRef)
    }

    return soldNumbersInAttempt
  })

  logger.info('runPaidDepositBusinessLogic succeeded', {
    externalId: order.externalId,
    reservedNumbersCount: normalizedReservedNumbers.length,
    soldNumbersCommitted,
    amount: normalizedAmount,
    numbersRequested: transactionStats.numbersRequested,
    previousCount: transactionStats.previousCount,
    uniqueStateReads: transactionStats.uniqueStateReads,
    transactionAttempts: transactionStats.transactionAttempts,
    conflictsCount: transactionStats.conflictsCount,
    chunksRead: transactionStats.chunksRead,
    chunksWritten: transactionStats.chunksWritten,
    durationMs: Date.now() - startedAtMs,
  })
}

export function createPixDepositHandler(db: Firestore, secrets: HorsePaySecretReaders) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    const uid = requireActiveUid(request.auth)

    try {
      const payload = asRecord(request.data) as Partial<CreatePixDepositInput>
      const requestedAmount = sanitizeOptionalAmount(payload.amount)
      const payerName = sanitizeString(payload.payerName)
      const phone = normalizeGatewayPhone(payload.phone)
      const cpf = sanitizeCpf(payload.cpf)
      const rawPhoneDigits = sanitizeString(payload.phone).replace(/\D/g, '')
      const reservationRef = db.collection('numberReservations').doc(uid)
      const reservationSnapshot = await reservationRef.get()

      if (!payerName) {
        throw new HttpsError('invalid-argument', 'payerName e obrigatorio')
      }

      if (!cpf) {
        throw new HttpsError('invalid-argument', 'cpf e obrigatorio')
      }

      if (!reservationSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'Sua reserva nao foi encontrada. Reserve seus numeros novamente.')
      }

      const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
      const campaignRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
      const quantityLimits = readCampaignPurchaseQuantityLimits(campaignData)
      const reservationNumbers = readStoredReservationNumbers(
        reservationSnapshot.get('numbers'),
        campaignRange.start,
        campaignRange.end,
      )
      const reservationExpiresAtMs = readTimestampMillis(reservationSnapshot.get('expiresAt'))
      const pricing = calculatePricingSummary(campaignData, reservationNumbers.length)
      const campaignCoupons = readCampaignCoupons(campaignData)
      const coupon = resolveCoupon({
        rawCouponCode: payload.couponCode,
        campaignCoupons,
        subtotal: pricing.subtotalAfterPromotionAmount,
      })
      const discountAmount = coupon ? coupon.discountAmount : 0
      const expectedAmount = Number(Math.max(pricing.subtotalAfterPromotionAmount - discountAmount, 0).toFixed(2))

      if (expectedAmount <= 0) {
        throw new HttpsError(
          'invalid-argument',
          'Valor final do pedido invalido. Ajuste o cupom ou a quantidade para gerar o PIX.',
        )
      }

      if (reservationNumbers.length < quantityLimits.min || reservationNumbers.length > quantityLimits.max) {
        throw new HttpsError(
          'failed-precondition',
          `Sua reserva deve conter entre ${quantityLimits.min} e ${quantityLimits.max} numeros.`,
        )
      }

      if (!reservationExpiresAtMs || reservationExpiresAtMs <= Date.now()) {
        throw new HttpsError('failed-precondition', 'Sua reserva expirou. Reserve novamente para gerar o PIX.')
      }

      const hasAmountMismatch = requestedAmount !== null && Math.abs(requestedAmount - expectedAmount) > 0.009
      if (hasAmountMismatch) {
        logger.warn('createPixDeposit amount mismatch', {
          uid: maskUid(uid),
          requestedAmount,
          expectedAmount,
          quantity: reservationNumbers.length,
          unitPriceAtCheckout: pricing.unitPriceAtCheckout,
          matchedPackQuantity: pricing.matchedPackQuantity,
        })
      }

      const webhookToken = sanitizeString(secrets.getWebhookToken())
      if (!webhookToken) {
        throw new HttpsError('internal', 'HORSEPAY_WEBHOOK_TOKEN nao configurado')
      }

      const callbackUrl = getWebhookUrl(webhookToken)
      if (!callbackUrl) {
        throw new HttpsError('internal', 'Nao foi possivel montar a callback_url do webhook')
      }

      const clientReferenceBase = `${uid}_${Date.now()}`

      logger.info('createPixDeposit started', {
        uid: maskUid(uid),
        requestedAmount,
        expectedAmount,
        subtotalBaseAmount: pricing.subtotalBaseAmount,
        promotionDiscountAmount: pricing.promotionDiscountAmount,
        subtotalAmount: pricing.subtotalAfterPromotionAmount,
        discountAmount,
        couponCode: coupon?.code || null,
        couponDiscountType: coupon?.discountType || null,
        featuredPromotionLabel: pricing.appliedPromotionLabel,
        featuredPromotionType: pricing.appliedPromotionType,
        featuredPromotionValue: pricing.appliedPromotionValue,
        payerNameMasked: maskName(payerName),
        phoneMasked: maskPhoneNumber(phone),
        hasPhone: Boolean(phone),
        rawPhoneDigitsLength: rawPhoneDigits.length || null,
        phoneIgnoredAsInvalid: Boolean(rawPhoneDigits) && !phone,
        hasCpf: Boolean(cpf),
        clientReferenceBase,
        hasCallbackUrl: Boolean(callbackUrl),
        maxAttempts: MAX_DEPOSIT_ORDER_ATTEMPTS,
        reservationQuantity: reservationNumbers.length,
        minReservationQuantity: quantityLimits.min,
        maxReservationQuantity: quantityLimits.max,
        unitPriceAtCheckout: pricing.unitPriceAtCheckout,
        matchedPackQuantity: pricing.matchedPackQuantity,
        hasAmountMismatch,
      })

      const paymentGateway = createPaymentGateway({
        useMock: shouldUseMockHorsePay(),
        baseUrl: resolveHorsePayBaseUrl(),
        clientKey: secrets.getClientKey(),
        clientSecret: secrets.getClientSecret(),
      })

      for (let attempt = 1; attempt <= MAX_DEPOSIT_ORDER_ATTEMPTS; attempt += 1) {
        const clientReferenceId = `${clientReferenceBase}_a${attempt}`
        const newOrder = await paymentGateway.createDepositOrder({
          amount: expectedAmount,
          payerName,
          callbackUrl,
          clientReferenceId,
          phone,
        })

        const externalId = extractExternalId(newOrder)
        const extractedPixPayload = extractPixPayload(newOrder)
        const copyPaste = extractedPixPayload.copyPaste
        const qrCodeFromGateway = extractedPixPayload.qrCode
        const qrCode = await ensureQrCodeBase64(qrCodeFromGateway, copyPaste)

        logger.info('HorsePay neworder response received', {
          attempt,
          clientReferenceId,
          externalId,
          hasCopyPaste: Boolean(copyPaste),
          hasGatewayQrCode: Boolean(qrCodeFromGateway),
          hasQrCode: Boolean(qrCode),
          topLevelKeys: getTopLevelKeys(newOrder),
          topLevelShape: getValueShape(newOrder),
          hasDataNode: newOrder.data !== undefined,
          hasTransactionNode: newOrder.transaction !== undefined,
          hasResultNode: newOrder.result !== undefined,
          dataKeys: getTopLevelKeys(newOrder.data),
          resultKeys: getTopLevelKeys(newOrder.result),
          transactionKeys: getTopLevelKeys(newOrder.transaction),
          payloadHasPhoneField: Boolean(phone),
        })

        if (!qrCodeFromGateway && qrCode && copyPaste) {
          logger.info('Generated QR code from copyPaste fallback', {
            attempt,
            externalId,
            clientReferenceId,
          })
        }

        if (!externalId) {
          logger.error('HorsePay neworder missing external_id', {
            attempt,
            topLevelKeys: getTopLevelKeys(newOrder),
            topLevelShape: getValueShape(newOrder),
            hasDataNode: newOrder.data !== undefined,
            hasTransactionNode: newOrder.transaction !== undefined,
            hasResultNode: newOrder.result !== undefined,
            dataKeys: getTopLevelKeys(newOrder.data),
            resultKeys: getTopLevelKeys(newOrder.result),
            transactionKeys: getTopLevelKeys(newOrder.transaction),
            dataShape: getValueShape(newOrder.data),
            resultShape: getValueShape(newOrder.result),
            transactionShape: getValueShape(newOrder.transaction),
            clientReferenceId,
          })

          if (attempt < MAX_DEPOSIT_ORDER_ATTEMPTS) {
            await sleep(DEPOSIT_RETRY_DELAY_MS)
            continue
          }

          throw new HttpsError('internal', 'HorsePay nao retornou external_id')
        }

        if (!copyPaste && !qrCode) {
          logger.warn('HorsePay neworder returned without PIX payload', {
            attempt,
            externalId,
            clientReferenceId,
            topLevelKeys: getTopLevelKeys(newOrder),
          })

          await db.collection('orders').doc(externalId).set(
            {
              userId: uid,
              campaignId: CAMPAIGN_DOC_ID,
              externalId,
              type: 'deposit',
              amount: expectedAmount,
              expectedAmount,
              subtotalBaseAmount: pricing.subtotalBaseAmount,
              promotionDiscountAmount: pricing.promotionDiscountAmount,
              subtotalAmount: pricing.subtotalAfterPromotionAmount,
              discountAmount,
              payerName,
              payerPhone: phone,
              payerCpf: cpf,
              requestedAmount,
              unitPriceAtCheckout: pricing.unitPriceAtCheckout,
              matchedPackQuantity: pricing.matchedPackQuantity,
              appliedPromotionLabel: pricing.appliedPromotionLabel,
              appliedPromotionDiscountType: pricing.appliedPromotionType,
              appliedPromotionDiscountValue: pricing.appliedPromotionValue,
              quantity: reservationNumbers.length,
              reservedNumbers: reservationNumbers,
              appliedCouponCode: coupon?.code || null,
              appliedCouponDiscountType: coupon?.discountType || null,
              appliedCouponDiscountValue: coupon?.discountValue || null,
              reservationExpiresAt: Timestamp.fromMillis(reservationExpiresAtMs),
              status: 'failed',
              failureReason: 'missing_pix_payload',
              pixCopyPaste: null,
              pixQrCode: null,
              clientReferenceId,
              attempt,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )

          if (attempt < MAX_DEPOSIT_ORDER_ATTEMPTS) {
            await sleep(DEPOSIT_RETRY_DELAY_MS)
            continue
          }

          throw new HttpsError(
            'internal',
            'Gateway nao retornou dados PIX para o pedido. Gere um novo PIX e tente novamente.',
          )
        }

        const status = inferOrderStatus(newOrder)
        const persistedStatus: CreatePixDepositOutput['status'] = status === 'failed' ? 'failed' : 'pending'

        await db.collection('orders').doc(externalId).set({
          userId: uid,
          campaignId: CAMPAIGN_DOC_ID,
          externalId,
          type: 'deposit',
          amount: expectedAmount,
          subtotalBaseAmount: pricing.subtotalBaseAmount,
          promotionDiscountAmount: pricing.promotionDiscountAmount,
          subtotalAmount: pricing.subtotalAfterPromotionAmount,
          discountAmount,
          payerName,
          payerPhone: phone,
          payerCpf: cpf,
          expectedAmount,
          requestedAmount,
          unitPriceAtCheckout: pricing.unitPriceAtCheckout,
          matchedPackQuantity: pricing.matchedPackQuantity,
          appliedPromotionLabel: pricing.appliedPromotionLabel,
          appliedPromotionDiscountType: pricing.appliedPromotionType,
          appliedPromotionDiscountValue: pricing.appliedPromotionValue,
          quantity: reservationNumbers.length,
          reservedNumbers: reservationNumbers,
          appliedCouponCode: coupon?.code || null,
          appliedCouponDiscountType: coupon?.discountType || null,
          appliedCouponDiscountValue: coupon?.discountValue || null,
          reservationExpiresAt: Timestamp.fromMillis(reservationExpiresAtMs),
          status: persistedStatus,
          pixCopyPaste: copyPaste,
          pixQrCode: qrCode,
          clientReferenceId,
          attempt,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        logger.info('createPixDeposit persisted order', {
          uid: maskUid(uid),
          attempt,
          externalId,
          status: persistedStatus,
          hasCopyPaste: Boolean(copyPaste),
          hasQrCode: Boolean(qrCode),
          expectedAmount,
          subtotalBaseAmount: pricing.subtotalBaseAmount,
          promotionDiscountAmount: pricing.promotionDiscountAmount,
          subtotalAmount: pricing.subtotalAfterPromotionAmount,
          discountAmount,
          appliedCouponCode: coupon?.code || null,
          clientReferenceId,
        })

        logger.info('createPixDeposit response ready', {
          externalId,
          status: persistedStatus,
          hasCopyPaste: Boolean(copyPaste),
          hasQrCode: Boolean(qrCode),
        })

        return {
          externalId,
          copyPaste,
          qrCode,
          status: persistedStatus,
        } satisfies CreatePixDepositOutput
      }

      throw new HttpsError('internal', 'Falha ao criar deposito PIX apos multiplas tentativas')
    } catch (error) {
      logger.error('createPixDeposit failed', {
        uid: maskUid(uid),
        rawCouponCode: sanitizeString((request.data as Record<string, unknown> | null)?.couponCode),
        error: String(error),
      })
      throw toHttpsError(error, 'Falha ao criar deposito PIX')
    }
  }
}

export function createRequestWithdrawHandler(db: Firestore, secrets: HorsePaySecretReaders) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    const uid = requireActiveUid(request.auth)

    try {
      // HorsePay valida o IP de origem para saques no painel da conta.
      const payload = asRecord(request.data) as Partial<RequestWithdrawInput>
      const amount = sanitizeAmount(payload.amount)
      const pixKey = sanitizeString(payload.pixKey)
      const pixType = sanitizePixType(payload.pixType)

      if (!pixKey) {
        throw new HttpsError('invalid-argument', 'pixKey e obrigatorio')
      }

      const paymentGateway = createPaymentGateway({
        useMock: shouldUseMockHorsePay(),
        baseUrl: resolveHorsePayBaseUrl(),
        clientKey: secrets.getClientKey(),
        clientSecret: secrets.getClientSecret(),
      })
      const clientReferenceId = `${uid}_${Date.now()}`

      logger.info('requestWithdraw started', {
        uid: maskUid(uid),
        amount,
        pixType,
        pixKeyMasked: maskPixKey(pixKey),
        clientReferenceId,
      })

      const response = await paymentGateway.requestWithdraw({
        amount,
        pixKey,
        pixType,
        clientReferenceId,
      })

      const externalId = extractExternalId(response)

      logger.info('HorsePay withdraw response received', {
        clientReferenceId,
        externalId,
        topLevelKeys: getTopLevelKeys(response),
      })

      if (externalId) {
        await db.collection('orders').doc(externalId).set(
          {
            userId: uid,
            externalId,
            type: 'withdraw',
            amount,
            status: 'pending',
            pixKeyMasked: maskPixKey(pixKey),
            clientReferenceId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )

        logger.info('requestWithdraw persisted order', {
          uid: maskUid(uid),
          externalId,
          status: 'pending',
          clientReferenceId,
        })
      }

      return response
    } catch (error) {
      logger.error('requestWithdraw failed', {
        uid: maskUid(uid),
        error: String(error),
      })
      throw toHttpsError(error, 'Falha ao solicitar saque')
    }
  }
}

export function createGetBalanceHandler(secrets: HorsePaySecretReaders) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    const uid = requireActiveUid(request.auth)

    try {
      logger.info('getBalance started', { uid: maskUid(uid) })
      const paymentGateway = createPaymentGateway({
        useMock: shouldUseMockHorsePay(),
        baseUrl: resolveHorsePayBaseUrl(),
        clientKey: secrets.getClientKey(),
        clientSecret: secrets.getClientSecret(),
      })
      const response = await paymentGateway.getBalance()
      logger.info('getBalance response received', {
        uid: maskUid(uid),
        topLevelKeys: getTopLevelKeys(response),
      })
      return response
    } catch (error) {
      logger.error('getBalance failed', {
        uid: maskUid(uid),
        error: String(error),
      })
      throw toHttpsError(error, 'Falha ao consultar saldo')
    }
  }
}

export function createPixWebhookHandler(db: Firestore, secrets: HorsePaySecretReaders) {
  return async (request: WebhookRequest, response: WebhookResponse) => {
    if (request.method !== 'POST') {
      logger.info('pixWebhook ignored non-post request', { method: request.method })
      response.status(200).json({ ok: true })
      return
    }

    const webhookToken = sanitizeString(secrets.getWebhookToken())
    if (!hasValidWebhookToken(request, webhookToken)) {
      logger.warn('pixWebhook rejected: invalid webhook token', {
        ip: request.ip || null,
      })
      response.status(200).json({ ok: true })
      return
    }

    const payload = asRecord(request.body)
    const webhookExternalId = extractExternalId(payload)

    logger.info('pixWebhook received', {
      method: request.method,
      externalId: webhookExternalId,
      hasInfractionStatus: payload.infraction_status !== undefined,
      topLevelKeys: getTopLevelKeys(payload),
    })

    try {
      if (payload.infraction_status !== undefined) {
        const infractionRef = await db.collection('infractions').add({
          infractionStatus: payload.infraction_status,
          externalId: extractExternalId(payload),
          payload,
          createdAt: FieldValue.serverTimestamp(),
        })

        logger.info('pixWebhook infraction persisted', {
          infractionId: infractionRef.id,
          externalId: webhookExternalId,
        })
      }

      const externalId = webhookExternalId
      if (externalId) {
        const extractedPixPayload = extractPixPayload(payload)
        const copyPaste = extractedPixPayload.copyPaste
        const qrCodeFromGateway = extractedPixPayload.qrCode
        const qrCode = await ensureQrCodeBase64(qrCodeFromGateway, copyPaste)

        const processedOrder = await processWebhookOrder(db, {
          externalId,
          payload,
          copyPaste,
          qrCode,
        })

        logger.info('pixWebhook order processed', {
          externalId,
          eventId: processedOrder.eventId,
          status: processedOrder.status,
          orderType: processedOrder.orderType,
          hasCopyPaste: Boolean(copyPaste),
          hasGatewayQrCode: Boolean(qrCodeFromGateway),
          hasQrCode: Boolean(qrCode),
          shouldApplyPaidDeposit: processedOrder.shouldApplyPaidDeposit,
        })

        if (processedOrder.shouldApplyPaidDeposit) {
          const orderRef = db.collection('orders').doc(externalId)

          try {
            const campaignData = await getCampaignDocCached(db, processedOrder.campaignId)
            const campaignRange = readCampaignNumberRange(campaignData, processedOrder.campaignId)
            let normalizedReservedNumbers = sanitizeOrderNumbersForRange(
              processedOrder.reservedNumbers,
              campaignRange.start,
              campaignRange.end,
            )
            let recoveredFromLegacy = false

            if (normalizedReservedNumbers.length === 0) {
              normalizedReservedNumbers = await readLegacyOrderNumbersSubcollection({
                db,
                externalId,
                rangeStart: campaignRange.start,
                rangeEnd: campaignRange.end,
              })
              recoveredFromLegacy = normalizedReservedNumbers.length > 0
            }

            if (!processedOrder.userId) {
              throw new HttpsError(
                'failed-precondition',
                `Pedido ${externalId} pago sem userId associado.`,
              )
            }

            if (normalizedReservedNumbers.length <= 0) {
              throw new HttpsError(
                'failed-precondition',
                `Pedido ${externalId} pago sem numeros reservados validos para baixa.`,
              )
            }

            if (recoveredFromLegacy) {
              await orderRef.set(
                {
                  reservedNumbers: normalizedReservedNumbers,
                  quantity: normalizedReservedNumbers.length,
                  reservedNumbersRecoveredAt: FieldValue.serverTimestamp(),
                  reservedNumbersRecoveredSource: 'orders_numbers_subcollection',
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true },
              )
            }

            await runPaidDepositBusinessLogic(db, {
              externalId,
              campaignId: processedOrder.campaignId,
              userId: processedOrder.userId,
              amount: processedOrder.amount,
              reservedNumbers: normalizedReservedNumbers,
            })

            await orderRef.set(
              {
                reservedNumbers: normalizedReservedNumbers,
                quantity: normalizedReservedNumbers.length,
                paidBusinessAppliedAt: FieldValue.serverTimestamp(),
                paidBusinessProcessingBy: FieldValue.delete(),
                paidBusinessProcessingAt: FieldValue.delete(),
                paidBusinessProcessingError: null,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            )

            logger.info('pixWebhook business logic executed', {
              externalId,
              eventId: processedOrder.eventId,
              reservedNumbersCount: normalizedReservedNumbers.length,
              recoveredFromLegacy,
            })
          } catch (processingError) {
            await orderRef.set(
              {
                paidBusinessProcessingBy: FieldValue.delete(),
                paidBusinessProcessingAt: FieldValue.delete(),
                paidBusinessProcessingError: String(processingError).slice(0, 800),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            )

            throw processingError
          }
        }
      }
    } catch (error) {
      logger.error('pixWebhook processing error', {
        error: String(error),
        payload,
      })
    }

    logger.info('pixWebhook response sent', {
      ok: true,
      externalId: webhookExternalId || null,
    })
    response.status(200).json({ ok: true })
  }
}
