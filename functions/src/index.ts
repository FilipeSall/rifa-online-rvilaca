import axios from 'axios'
import QRCode from 'qrcode'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'

initializeApp()

const db = getFirestore()
const REGION = 'southamerica-east1'
const HORSEPAY_BASE_URL = 'https://api.horsepay.io'
const HORSEPAY_CLIENT_KEY = defineSecret('HORSEPAY_CLIENT_KEY')
const HORSEPAY_CLIENT_SECRET = defineSecret('HORSEPAY_CLIENT_SECRET')

setGlobalOptions({
  region: REGION,
})

type JsonRecord = Record<string, unknown>
type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'
type OrderStatus = 'pending' | 'paid' | 'failed'
type OrderType = 'deposit' | 'withdraw'
const MAX_DEPOSIT_ORDER_ATTEMPTS = 3
const DEPOSIT_RETRY_DELAY_MS = 1200

interface HorsePayAuthResponse {
  access_token?: string
  token?: string
}

interface CreatePixDepositInput {
  amount: number
  payerName: string
  phone?: string
}

interface CreatePixDepositOutput {
  externalId: string
  copyPaste: string | null
  qrCode: string | null
  status: 'pending' | 'failed'
}

interface RequestWithdrawInput {
  amount: number
  pixKey: string
  pixType: PixType
}

function maskUid(uid: string): string {
  if (uid.length <= 8) {
    return `${uid.slice(0, 2)}***`
  }

  return `${uid.slice(0, 4)}...${uid.slice(-4)}`
}

function maskName(name: string): string {
  const clean = sanitizeString(name)
  if (!clean) {
    return ''
  }

  if (clean.length <= 2) {
    return `${clean[0]}*`
  }

  return `${clean.slice(0, 1)}***${clean.slice(-1)}`
}

function maskPhoneNumber(phone: string | null): string | null {
  if (!phone) {
    return null
  }

  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) {
    return '***'
  }

  return `***${digits.slice(-4)}`
}

function getTopLevelKeys(value: unknown): string[] {
  return Object.keys(asRecord(value)).slice(0, 25)
}

function getValueShape(value: unknown): Record<string, string> {
  const record = asRecord(value)
  const entries = Object.entries(record).slice(0, 25).map(([key, fieldValue]) => [
    key,
    Array.isArray(fieldValue) ? 'array' : typeof fieldValue,
  ])

  return Object.fromEntries(entries)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as JsonRecord
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  return null
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

function getNestedValue(source: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = source

  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return null
    }

    current = (current as JsonRecord)[part]
  }

  return current
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

function getWebhookUrl(): string | null {
  const projectId = parseFirebaseProjectId()

  if (!projectId) {
    return null
  }

  return `https://${REGION}-${projectId}.cloudfunctions.net/pixWebhook`
}

function sanitizeAmount(input: unknown): number {
  const amount = Number(input)

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'amount deve ser um numero maior que zero')
  }

  return Number(amount.toFixed(2))
}

function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function sanitizePhone(value: unknown): string | null {
  const raw = sanitizeString(value)
  return raw || null
}

function sanitizePixType(value: unknown): PixType {
  const pixType = sanitizeString(value).toUpperCase() as PixType
  const allowed = new Set<PixType>(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])

  if (!allowed.has(pixType)) {
    throw new HttpsError('invalid-argument', 'pixType invalido')
  }

  return pixType
}

function maskPixKey(pixKey: string): string {
  const value = sanitizeString(pixKey)
  if (value.length <= 6) {
    return '***'
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`
}

function extractHorsePayMessage(data: unknown): string | null {
  if (!data) {
    return null
  }

  if (typeof data === 'string') {
    return data
  }

  const payload = asRecord(data)
  return (
    readString(payload.message) ||
    readString(payload.error) ||
    readString(payload.msg) ||
    null
  )
}

function toHttpsError(error: unknown, fallbackMessage: string): HttpsError {
  if (error instanceof HttpsError) {
    return error
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as { response?: { status?: number; data?: unknown } }
    const status = axiosError.response?.status || 500
    const message = extractHorsePayMessage(axiosError.response?.data) || fallbackMessage

    if (status === 400) {
      return new HttpsError('invalid-argument', message)
    }

    if (status === 401) {
      return new HttpsError('unauthenticated', message)
    }

    if (status === 403) {
      return new HttpsError('permission-denied', message)
    }

    if (status === 404) {
      return new HttpsError('not-found', message)
    }

    if (status === 429) {
      return new HttpsError('resource-exhausted', message)
    }
  }

  return new HttpsError('internal', fallbackMessage)
}

async function horsePayRequest<T>({
  method,
  path,
  token,
  data,
}: {
  method: 'get' | 'post'
  path: string
  token?: string
  data?: unknown
}): Promise<T> {
  try {
    const response = await axios.request<T>({
      method,
      url: `${HORSEPAY_BASE_URL}${path}`,
      data,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    logger.info('HorsePay request success', {
      path,
      method,
      statusCode: response.status,
      topLevelKeys: getTopLevelKeys(response.data),
    })

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || null
      const responseData = error.response?.data
      logger.error('HorsePay request failed', {
        path,
        method,
        statusCode,
        responseTopLevelKeys: getTopLevelKeys(responseData),
        responseShape: getValueShape(responseData),
        horsePayMessage: extractHorsePayMessage(responseData),
      })
    } else {
      logger.error('HorsePay request failed (non-axios)', {
        path,
        method,
        error: String(error),
      })
    }

    throw error
  }
}

async function getHorsePayToken(): Promise<string> {
  const clientKey = HORSEPAY_CLIENT_KEY.value()
  const clientSecret = HORSEPAY_CLIENT_SECRET.value()

  if (!clientKey || !clientSecret) {
    throw new HttpsError('internal', 'Secrets da HorsePay nao configurados')
  }

  const tokenResponse = await horsePayRequest<HorsePayAuthResponse>({
    method: 'post',
    path: '/auth/token',
    data: {
      client_key: clientKey,
      client_secret: clientSecret,
    },
  })

  const accessToken = tokenResponse.access_token || tokenResponse.token
  if (!accessToken) {
    throw new HttpsError('internal', 'HorsePay nao retornou access_token')
  }

  logger.info('HorsePay token generated', {
    hasAccessToken: Boolean(accessToken),
    topLevelKeys: getTopLevelKeys(tokenResponse),
  })

  return accessToken
}

function extractExternalId(payload: unknown): string | null {
  const record = asRecord(payload)
  const candidatePaths = [
    'external_id',
    'externalId',
    'id',
    'transaction_id',
    'transactionId',
    'data.external_id',
    'data.externalId',
    'data.id',
    'data.transaction_id',
    'data.transactionId',
    'transaction.external_id',
    'transaction.externalId',
    'transaction.id',
    'order.external_id',
    'order.externalId',
    'order.id',
    'result.external_id',
    'result.externalId',
    'result.id',
  ]

  for (const path of candidatePaths) {
    const candidate = readString(getNestedValue(record, path))
    if (candidate) {
      return candidate
    }
  }

  const dataNode = getNestedValue(record, 'data')
  if (Array.isArray(dataNode) && dataNode.length > 0) {
    const first = asRecord(dataNode[0])
    return readString(first.external_id) || readString(first.externalId) || readString(first.id) || null
  }

  return (
    readString(record.external_id) ||
    readString(record.externalId) ||
    readString(record.id) ||
    readString(record.transaction_id) ||
    readString(record.transactionId) ||
    null
  )
}

function extractPixPayload(payload: unknown): { copyPaste: string | null; qrCode: string | null } {
  const record = asRecord(payload)
  const pix = asRecord(record.pix)
  const dataNode = asRecord(record.data)
  const dataPix = asRecord(dataNode.pix)
  const transactionNode = asRecord(record.transaction)
  const transactionPix = asRecord(transactionNode.pix)
  const paymentNode = asRecord(record.payment)
  const paymentPix = asRecord(paymentNode.pix)
  const resultNode = asRecord(record.result)
  const resultPix = asRecord(resultNode.pix)
  const resultPayment = asRecord(resultNode.payment)
  const dataPayment = asRecord(dataNode.payment)
  const transactionPayment = asRecord(transactionNode.payment)

  const copyPaste =
    readString(record.copy_past) ||
    readString(record.copy_paste) ||
    readString(record.copyPaste) ||
    readString(record.pix_copy_paste) ||
    readString(record.pix_copy_past) ||
    readString(record.pixCode) ||
    readString(record.pix_code) ||
    readString(pix.copy_paste) ||
    readString(pix.copyPaste) ||
    readString(pix.copy_past) ||
    readString(pix.pix_code) ||
    readString(pix.pixCode) ||
    readString(dataNode.copy_paste) ||
    readString(dataNode.copy_past) ||
    readString(dataNode.copyPaste) ||
    readString(dataNode.pix_copy_paste) ||
    readString(dataNode.pix_copy_past) ||
    readString(dataNode.pixCode) ||
    readString(dataNode.pix_code) ||
    readString(dataPix.copy_paste) ||
    readString(dataPix.copy_past) ||
    readString(dataPix.copyPaste) ||
    readString(dataPix.pix_code) ||
    readString(dataPix.pixCode) ||
    readString(paymentNode.copy_paste) ||
    readString(paymentNode.copy_past) ||
    readString(paymentNode.copyPaste) ||
    readString(paymentNode.pix_copy_paste) ||
    readString(paymentNode.pix_copy_past) ||
    readString(paymentNode.pix_code) ||
    readString(paymentNode.pixCode) ||
    readString(paymentNode.emv) ||
    readString(paymentNode.payload) ||
    readString(paymentPix.copy_paste) ||
    readString(paymentPix.copy_past) ||
    readString(paymentPix.copyPaste) ||
    readString(paymentPix.pix_copy_paste) ||
    readString(paymentPix.pix_copy_past) ||
    readString(paymentPix.pix_code) ||
    readString(paymentPix.pixCode) ||
    readString(paymentPix.emv) ||
    readString(resultNode.copy_paste) ||
    readString(resultNode.copy_past) ||
    readString(resultNode.copyPaste) ||
    readString(resultNode.pix_copy_paste) ||
    readString(resultNode.pix_copy_past) ||
    readString(resultNode.pix_code) ||
    readString(resultNode.pixCode) ||
    readString(resultPix.copy_paste) ||
    readString(resultPix.copy_past) ||
    readString(resultPix.copyPaste) ||
    readString(resultPix.pix_code) ||
    readString(resultPix.pixCode) ||
    readString(resultPayment.copy_paste) ||
    readString(resultPayment.copy_past) ||
    readString(resultPayment.copyPaste) ||
    readString(resultPayment.pix_code) ||
    readString(resultPayment.pixCode) ||
    readString(resultPayment.payload) ||
    readString(dataPayment.copy_paste) ||
    readString(dataPayment.copy_past) ||
    readString(dataPayment.copyPaste) ||
    readString(dataPayment.pix_code) ||
    readString(dataPayment.pixCode) ||
    readString(transactionPayment.copy_paste) ||
    readString(transactionPayment.copy_past) ||
    readString(transactionPayment.copyPaste) ||
    readString(transactionPayment.pix_code) ||
    readString(transactionPayment.pixCode) ||
    readString(transactionNode.copy_paste) ||
    readString(transactionNode.copyPaste) ||
    readString(transactionNode.copy_past) ||
    readString(transactionNode.pix_copy_paste) ||
    readString(transactionNode.pix_copy_past) ||
    readString(transactionNode.pixCode) ||
    readString(transactionNode.pix_code) ||
    readString(transactionPix.copy_paste) ||
    readString(transactionPix.copy_past) ||
    readString(transactionPix.copyPaste) ||
    readString(transactionPix.pix_code) ||
    readString(transactionPix.pixCode) ||
    null

  const qrCode =
    readString(record.pix_qr_code) ||
    readString(record.pix_qrcode) ||
    readString(record.qrcode) ||
    readString(record.qrcode_base64) ||
    readString(record.qr_code) ||
    readString(record.qrCode) ||
    readString(pix.qr_code) ||
    readString(pix.qrCode) ||
    readString(pix.qrcode) ||
    readString(pix.qrcode_base64) ||
    readString(dataNode.pix_qr_code) ||
    readString(dataNode.pix_qrcode) ||
    readString(dataNode.qrcode) ||
    readString(dataNode.qrcode_base64) ||
    readString(dataNode.qr_code) ||
    readString(dataNode.qrCode) ||
    readString(dataPix.qr_code) ||
    readString(dataPix.qrCode) ||
    readString(dataPix.qrcode) ||
    readString(dataPix.qrcode_base64) ||
    readString(paymentNode.pix_qr_code) ||
    readString(paymentNode.pix_qrcode) ||
    readString(paymentNode.qr_code) ||
    readString(paymentNode.qrCode) ||
    readString(paymentNode.qrcode) ||
    readString(paymentNode.qrcode_base64) ||
    readString(paymentNode.qr_image) ||
    readString(paymentNode.qrImage) ||
    readString(paymentPix.qr_code) ||
    readString(paymentPix.qrCode) ||
    readString(paymentPix.qrcode) ||
    readString(paymentPix.qrcode_base64) ||
    readString(paymentPix.qr_image) ||
    readString(resultNode.qr_code) ||
    readString(resultNode.qrCode) ||
    readString(resultNode.qrcode) ||
    readString(resultNode.qrcode_base64) ||
    readString(resultPix.qr_code) ||
    readString(resultPix.qrCode) ||
    readString(resultPix.qrcode) ||
    readString(resultPix.qrcode_base64) ||
    readString(resultPayment.qr_code) ||
    readString(resultPayment.qrCode) ||
    readString(resultPayment.qrcode) ||
    readString(resultPayment.qrcode_base64) ||
    readString(resultPayment.qr_image) ||
    readString(dataPayment.qr_code) ||
    readString(dataPayment.qrCode) ||
    readString(dataPayment.qrcode) ||
    readString(dataPayment.qrcode_base64) ||
    readString(transactionPayment.qr_code) ||
    readString(transactionPayment.qrCode) ||
    readString(transactionPayment.qrcode) ||
    readString(transactionPayment.qrcode_base64) ||
    readString(transactionNode.pix_qr_code) ||
    readString(transactionNode.pix_qrcode) ||
    readString(transactionNode.qrcode) ||
    readString(transactionNode.qrcode_base64) ||
    readString(transactionNode.qr_code) ||
    readString(transactionNode.qrCode) ||
    readString(transactionPix.qr_code) ||
    readString(transactionPix.qrCode) ||
    readString(transactionPix.qrcode) ||
    readString(transactionPix.qrcode_base64) ||
    null

  return { copyPaste, qrCode }
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

async function runPaidDepositBusinessLogic(order: {
  externalId: string
  userId: string | null
  amount: number | null
}) {
  const paymentRef = db.collection('payments').doc(order.externalId)

  await paymentRef.set(
    {
      externalId: order.externalId,
      userId: order.userId,
      amount: order.amount,
      status: 'paid',
      source: 'horsepay_webhook',
      releasedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

const securedCallableOptions = {
  region: REGION,
  cors: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://rifa-online-395d9.web.app',
    'https://rifa-online-395d9.firebaseapp.com',
  ],
  secrets: [HORSEPAY_CLIENT_KEY, HORSEPAY_CLIENT_SECRET],
}

export const createPixDeposit = onCall(
  securedCallableOptions,
  async (request: { auth?: { uid?: string } | null; data: unknown }) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
  }

  try {
    const payload = asRecord(request.data) as Partial<CreatePixDepositInput>
    const amount = sanitizeAmount(payload.amount)
    const payerName = sanitizeString(payload.payerName)
    const phone = sanitizePhone(payload.phone)

    if (!payerName) {
      throw new HttpsError('invalid-argument', 'payerName e obrigatorio')
    }

    const callbackUrl = getWebhookUrl()
    if (!callbackUrl) {
      throw new HttpsError('internal', 'Nao foi possivel montar a callback_url do webhook')
    }

    const clientReferenceBase = `${request.auth.uid}_${Date.now()}`

    logger.info('createPixDeposit started', {
      uid: maskUid(request.auth.uid),
      amount,
      payerNameMasked: maskName(payerName),
      phoneMasked: maskPhoneNumber(phone),
      hasPhone: Boolean(phone),
      clientReferenceBase,
      hasCallbackUrl: Boolean(callbackUrl),
      maxAttempts: MAX_DEPOSIT_ORDER_ATTEMPTS,
    })

    const accessToken = await getHorsePayToken()

    for (let attempt = 1; attempt <= MAX_DEPOSIT_ORDER_ATTEMPTS; attempt += 1) {
      const clientReferenceId = `${clientReferenceBase}_a${attempt}`
      const newOrderPayload: JsonRecord = {
        amount,
        payer_name: payerName,
        callback_url: callbackUrl,
        client_reference_id: clientReferenceId,
        payment_method: 'PIX',
      }

      if (phone) {
        newOrderPayload.phone = phone
      }

      const newOrder = await horsePayRequest<JsonRecord>({
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
            externalId,
            type: 'deposit',
            amount,
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
        externalId,
        type: 'deposit',
        amount,
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
        clientReferenceId,
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
      error: String(error),
    })
    throw toHttpsError(error, 'Falha ao criar deposito PIX')
  }
  },
)

export const requestWithdraw = onCall(
  securedCallableOptions,
  async (request: { auth?: { uid?: string } | null; data: unknown }) => {
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

    const accessToken = await getHorsePayToken()
    const clientReferenceId = `${request.auth.uid}_${Date.now()}`

    logger.info('requestWithdraw started', {
      uid: maskUid(request.auth.uid),
      amount,
      pixType,
      pixKeyMasked: maskPixKey(pixKey),
      clientReferenceId,
    })

    const response = await horsePayRequest<JsonRecord>({
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
  },
)

export const getBalance = onCall(
  securedCallableOptions,
  async (request: { auth?: { uid?: string } | null; data: unknown }) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
  }

  try {
    logger.info('getBalance started', { uid: maskUid(request.auth.uid) })
    const accessToken = await getHorsePayToken()
    const response = await horsePayRequest<JsonRecord>({
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
  },
)

export const pixWebhook = onRequest(
  { region: REGION },
  async (
    request: { method: string; body: unknown },
    response: { status: (code: number) => { json: (body: unknown) => void }; json?: (body: unknown) => void },
  ) => {
  if (request.method !== 'POST') {
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
      const orderRef = db.collection('orders').doc(externalId)
      const orderSnapshot = await orderRef.get()
      const existingOrder = (orderSnapshot.exists ? orderSnapshot.data() : null) as DocumentData | null

      const orderType = inferOrderType(payload, (existingOrder?.type as OrderType | undefined) || 'deposit')
      const status = inferOrderStatus(payload)
      const extractedPixPayload = extractPixPayload(payload)
      const copyPaste = extractedPixPayload.copyPaste
      const qrCodeFromGateway = extractedPixPayload.qrCode
      const qrCode = await ensureQrCodeBase64(qrCodeFromGateway, copyPaste)

      logger.info('pixWebhook order status inferred', {
        externalId,
        orderType,
        status,
        hadExistingOrder: Boolean(existingOrder),
      })

      const updateData: DocumentData = {
        externalId,
        type: orderType,
        status,
        webhookPayload: payload,
        webhookReceivedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (existingOrder?.userId) {
        updateData.userId = existingOrder.userId
      }

      if (existingOrder?.amount !== undefined) {
        updateData.amount = existingOrder.amount
      } else if (payload.amount !== undefined) {
        updateData.amount = Number(payload.amount)
      }

      if (copyPaste) {
        updateData.pixCopyPaste = copyPaste
      }

      if (qrCode) {
        updateData.pixQrCode = qrCode
      }

      await orderRef.set(updateData, { merge: true })

      logger.info('pixWebhook order persisted', {
        externalId,
        status,
        orderType,
        hasCopyPaste: Boolean(copyPaste),
        hasGatewayQrCode: Boolean(qrCodeFromGateway),
        hasQrCode: Boolean(qrCode),
      })

      if (status === 'paid' && orderType === 'deposit' && existingOrder?.status !== 'paid') {
        await runPaidDepositBusinessLogic({
          externalId,
          userId: (existingOrder?.userId as string | undefined) || null,
          amount:
            (typeof existingOrder?.amount === 'number' ? existingOrder.amount : null) ||
            (payload.amount !== undefined ? Number(payload.amount) : null),
        })

        logger.info('pixWebhook business logic executed', {
          externalId,
          orderType,
          status,
        })
      }
    }
  } catch (error) {
    logger.error('pixWebhook processing error', {
      error: String(error),
      payload,
    })
  }

  response.status(200).json({ ok: true })
  },
)
