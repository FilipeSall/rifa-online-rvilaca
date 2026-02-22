import QRCode from 'qrcode'
import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { extractExternalId, extractPixPayload } from './horsepayPayload.js'
import { getHorsePayToken, horsePayRequest, toHttpsError } from './horsepayClient.js'
import {
  CAMPAIGN_DOC_ID,
  DEPOSIT_RETRY_DELAY_MS,
  HORSEPAY_BASE_URL,
  MAX_DEPOSIT_ORDER_ATTEMPTS,
  REGION,
  type OrderStatus,
  type OrderType,
  type PixType,
} from './constants.js'
import { readCampaignCoupons, readCampaignMinPurchaseQuantity, readCampaignPricePerCota } from './campaignHandlers.js'
import {
  buildNumberStateView,
  buildPaidNumberStateData,
  getNumberStateRef,
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
  sanitizePhone,
  sanitizeString,
  sleep,
  type JsonRecord,
} from './shared.js'

interface CreatePixDepositInput {
  amount?: number
  payerName: string
  phone?: string
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

async function runPaidDepositBusinessLogic(
  db: Firestore,
  order: {
    externalId: string
    campaignId: string
    userId: string | null
    amount: number | null
    reservedNumbers: number[]
  },
) {
  logger.info('runPaidDepositBusinessLogic started', {
    externalId: order.externalId,
    campaignId: order.campaignId,
    userId: order.userId ? maskUid(order.userId) : null,
    reservedNumbersCount: order.reservedNumbers.length,
    amount: sanitizeOptionalAmount(order.amount),
  })
  const paymentRef = db.collection('payments').doc(order.externalId)
  const salesLedgerRef = db.collection('salesLedger').doc(order.externalId)
  const metricsSummaryRef = db.collection('metrics').doc('sales_summary')
  const dateKey = getBrazilDateKey()
  const dailyMetricsRef = db.collection('salesMetricsDaily').doc(dateKey)
  const paymentAuditLogRef = db.collection('auditLogs').doc(`payment_paid_${order.externalId}`)
  const reservationRef = order.userId ? db.collection('numberReservations').doc(order.userId) : null
  const normalizedAmount = sanitizeOptionalAmount(order.amount)
  const soldNumbers = order.reservedNumbers.length
  const nowMs = Date.now()

  await db.runTransaction(async (transaction) => {
    const numberStateRefs = new Map(
      order.reservedNumbers.map((number) => [number, getNumberStateRef(db, order.campaignId, number)]),
    )
    const numberStateSnapshots = await Promise.all(
      order.reservedNumbers.map((number) => {
        const ref = numberStateRefs.get(number)
        return ref ? transaction.get(ref) : Promise.resolve(null)
      }),
    )
    const numberStateSnapshotByNumber = new Map(
      order.reservedNumbers.map((number, index) => [number, numberStateSnapshots[index]]),
    )
    const reservationSnapshot = reservationRef ? await transaction.get(reservationRef) : null
    const salesLedgerSnapshot = await transaction.get(salesLedgerRef)

    transaction.set(
      paymentRef,
      {
        externalId: order.externalId,
        userId: order.userId,
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
        userId: order.userId,
        amount: normalizedAmount,
        soldNumbers,
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
            soldNumbers: FieldValue.increment(soldNumbers),
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
            soldNumbers: FieldValue.increment(soldNumbers),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }

      transaction.set(
        paymentAuditLogRef,
        {
          type: 'payment_paid',
          externalId: order.externalId,
          userId: order.userId,
          amount: normalizedAmount,
          soldNumbers,
          source: 'horsepay_webhook',
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }

    if (!order.userId || order.reservedNumbers.length === 0) {
      return
    }

    for (const number of order.reservedNumbers) {
      const numberStateRef = numberStateRefs.get(number)

      if (!numberStateRef) {
        continue
      }

      const numberStateSnapshot = numberStateSnapshotByNumber.get(number)
      const state = buildNumberStateView({
        number,
        nowMs,
        numberStateData: numberStateSnapshot?.exists ? numberStateSnapshot.data() : null,
      })

      if (state.status === 'pago') {
        continue
      }

      if (state.reservedBy && state.reservedBy !== order.userId) {
        continue
      }

      transaction.set(numberStateRef, buildPaidNumberStateData({
        campaignId: order.campaignId,
        number,
        userId: order.userId,
        orderId: order.externalId,
      }), { merge: true })
    }

    if (!reservationRef) {
      return
    }

    const reservationNumbers = reservationSnapshot?.exists
      ? readStoredReservationNumbers(reservationSnapshot.get('numbers'))
      : []

    if (reservationSnapshot?.exists && sameNumberSet(reservationNumbers, order.reservedNumbers)) {
      transaction.delete(reservationRef)
    }
  })

  logger.info('runPaidDepositBusinessLogic succeeded', {
    externalId: order.externalId,
    reservedNumbersCount: order.reservedNumbers.length,
    amount: normalizedAmount,
  })
}

export function createPixDepositHandler(db: Firestore, secrets: HorsePaySecretReaders) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    try {
      const payload = asRecord(request.data) as Partial<CreatePixDepositInput>
      const requestedAmount = sanitizeOptionalAmount(payload.amount)
      const payerName = sanitizeString(payload.payerName)
      const phone = sanitizePhone(payload.phone)
      const reservationRef = db.collection('numberReservations').doc(request.auth.uid)
      const reservationSnapshot = await reservationRef.get()

      if (!payerName) {
        throw new HttpsError('invalid-argument', 'payerName e obrigatorio')
      }

      if (!reservationSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'Sua reserva nao foi encontrada. Reserve seus numeros novamente.')
      }

      const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
      const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
      const campaignRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
      const minPurchaseQuantity = readCampaignMinPurchaseQuantity(campaignData)
      const reservationNumbers = readStoredReservationNumbers(
        reservationSnapshot.get('numbers'),
        campaignRange.start,
        campaignRange.end,
      )
      const reservationExpiresAtMs = readTimestampMillis(reservationSnapshot.get('expiresAt'))
      const unitPriceAtCheckout = readCampaignPricePerCota(campaignData)
      const subtotalAmount = Number((reservationNumbers.length * unitPriceAtCheckout).toFixed(2))
      const campaignCoupons = readCampaignCoupons(campaignData)
      const coupon = resolveCoupon({
        rawCouponCode: payload.couponCode,
        campaignCoupons,
        subtotal: subtotalAmount,
      })
      const discountAmount = coupon ? coupon.discountAmount : 0
      const expectedAmount = Number(Math.max(subtotalAmount - discountAmount, 0).toFixed(2))

      if (expectedAmount <= 0) {
        throw new HttpsError(
          'invalid-argument',
          'Valor final do pedido invalido. Ajuste o cupom ou a quantidade para gerar o PIX.',
        )
      }

      if (reservationNumbers.length < minPurchaseQuantity) {
        throw new HttpsError(
          'failed-precondition',
          `Sua reserva nao possui numeros suficientes. Minimo da campanha: ${minPurchaseQuantity}.`,
        )
      }

      if (!reservationExpiresAtMs || reservationExpiresAtMs <= Date.now()) {
        throw new HttpsError('failed-precondition', 'Sua reserva expirou. Reserve novamente para gerar o PIX.')
      }

      const hasAmountMismatch = requestedAmount !== null && Math.abs(requestedAmount - expectedAmount) > 0.009
      if (hasAmountMismatch) {
        logger.warn('createPixDeposit amount mismatch', {
          uid: maskUid(request.auth.uid),
          requestedAmount,
          expectedAmount,
          quantity: reservationNumbers.length,
          unitPriceAtCheckout,
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

      const clientReferenceBase = `${request.auth.uid}_${Date.now()}`

      logger.info('createPixDeposit started', {
        uid: maskUid(request.auth.uid),
        requestedAmount,
        expectedAmount,
        subtotalAmount,
        discountAmount,
        couponCode: coupon?.code || null,
        couponDiscountType: coupon?.discountType || null,
        payerNameMasked: maskName(payerName),
        phoneMasked: maskPhoneNumber(phone),
        hasPhone: Boolean(phone),
        clientReferenceBase,
        hasCallbackUrl: Boolean(callbackUrl),
        maxAttempts: MAX_DEPOSIT_ORDER_ATTEMPTS,
        reservationQuantity: reservationNumbers.length,
        minPurchaseQuantity,
        unitPriceAtCheckout,
        hasAmountMismatch,
      })

      const accessToken = await getHorsePayToken({
        baseUrl: HORSEPAY_BASE_URL,
        clientKey: secrets.getClientKey(),
        clientSecret: secrets.getClientSecret(),
      })

      for (let attempt = 1; attempt <= MAX_DEPOSIT_ORDER_ATTEMPTS; attempt += 1) {
        const clientReferenceId = `${clientReferenceBase}_a${attempt}`
        const newOrderPayload: JsonRecord = {
          amount: expectedAmount,
          payer_name: payerName,
          callback_url: callbackUrl,
          client_reference_id: clientReferenceId,
          payment_method: 'PIX',
        }

        if (phone) {
          newOrderPayload.phone = phone
        }

        const newOrder = await horsePayRequest<JsonRecord>({
          baseUrl: HORSEPAY_BASE_URL,
          method: 'post',
          path: '/transaction/neworder',
          token: accessToken,
          data: newOrderPayload,
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
          payloadHasPhoneField: Object.prototype.hasOwnProperty.call(newOrderPayload, 'phone'),
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
              userId: request.auth.uid,
              campaignId: CAMPAIGN_DOC_ID,
              externalId,
              type: 'deposit',
              amount: expectedAmount,
              expectedAmount,
              subtotalAmount,
              discountAmount,
              requestedAmount,
              unitPriceAtCheckout,
              minPurchaseQuantity,
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
          userId: request.auth.uid,
          campaignId: CAMPAIGN_DOC_ID,
          externalId,
          type: 'deposit',
          amount: expectedAmount,
          subtotalAmount,
          discountAmount,
          expectedAmount,
          requestedAmount,
          unitPriceAtCheckout,
          minPurchaseQuantity,
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
          uid: maskUid(request.auth.uid),
          attempt,
          externalId,
          status: persistedStatus,
          hasCopyPaste: Boolean(copyPaste),
          hasQrCode: Boolean(qrCode),
          expectedAmount,
          subtotalAmount,
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
        uid: request.auth?.uid ? maskUid(request.auth.uid) : null,
        rawCouponCode: sanitizeString((request.data as Record<string, unknown> | null)?.couponCode),
        error: String(error),
      })
      throw toHttpsError(error, 'Falha ao criar deposito PIX')
    }
  }
}

export function createRequestWithdrawHandler(db: Firestore, secrets: HorsePaySecretReaders) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    try {
      // HorsePay valida o IP de origem para saques no painel da conta.
      const payload = asRecord(request.data) as Partial<RequestWithdrawInput>
      const amount = sanitizeAmount(payload.amount)
      const pixKey = sanitizeString(payload.pixKey)
      const pixType = sanitizePixType(payload.pixType)

      if (!pixKey) {
        throw new HttpsError('invalid-argument', 'pixKey e obrigatorio')
      }

      const accessToken = await getHorsePayToken({
        baseUrl: HORSEPAY_BASE_URL,
        clientKey: secrets.getClientKey(),
        clientSecret: secrets.getClientSecret(),
      })
      const clientReferenceId = `${request.auth.uid}_${Date.now()}`

      logger.info('requestWithdraw started', {
        uid: maskUid(request.auth.uid),
        amount,
        pixType,
        pixKeyMasked: maskPixKey(pixKey),
        clientReferenceId,
      })

      const response = await horsePayRequest<JsonRecord>({
        baseUrl: HORSEPAY_BASE_URL,
        method: 'post',
        path: '/transaction/withdraw',
        token: accessToken,
        data: {
          amount,
          pix_key: pixKey,
          pix_type: pixType,
          client_reference_id: clientReferenceId,
        },
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
            userId: request.auth.uid,
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
          uid: maskUid(request.auth.uid),
          externalId,
          status: 'pending',
          clientReferenceId,
        })
      }

      return response
    } catch (error) {
      logger.error('requestWithdraw failed', {
        uid: request.auth?.uid ? maskUid(request.auth.uid) : null,
        error: String(error),
      })
      throw toHttpsError(error, 'Falha ao solicitar saque')
    }
  }
}

export function createGetBalanceHandler(secrets: HorsePaySecretReaders) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    try {
      logger.info('getBalance started', { uid: maskUid(request.auth.uid) })
      const accessToken = await getHorsePayToken({
        baseUrl: HORSEPAY_BASE_URL,
        clientKey: secrets.getClientKey(),
        clientSecret: secrets.getClientSecret(),
      })
      const response = await horsePayRequest<JsonRecord>({
        baseUrl: HORSEPAY_BASE_URL,
        method: 'get',
        path: '/user/balance',
        token: accessToken,
      })
      logger.info('getBalance response received', {
        uid: maskUid(request.auth.uid),
        topLevelKeys: getTopLevelKeys(response),
      })
      return response
    } catch (error) {
      logger.error('getBalance failed', {
        uid: request.auth?.uid ? maskUid(request.auth.uid) : null,
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
            await runPaidDepositBusinessLogic(db, {
              externalId,
              campaignId: processedOrder.campaignId,
              userId: processedOrder.userId,
              amount: processedOrder.amount,
              reservedNumbers: processedOrder.reservedNumbers,
            })

            await orderRef.set(
              {
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
              reservedNumbersCount: processedOrder.reservedNumbers.length,
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
