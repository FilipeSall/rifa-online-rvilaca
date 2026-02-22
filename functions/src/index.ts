import axios from 'axios'
import QRCode from 'qrcode'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore, type DocumentData } from 'firebase-admin/firestore'
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
const RESERVATION_DURATION_MS = 10 * 60 * 1000
const MIN_PURCHASE_QUANTITY = 10
const MAX_PURCHASE_QUANTITY = 300
const RAFFLE_NUMBER_START = 540001
const RAFFLE_NUMBER_END = 540120
const CAMPAIGN_DOC_ID = 'campanha-bmw-r1200-gs-2026'
const DEFAULT_CAMPAIGN_TITLE = 'Sorteio BMW R1200 GS'
const DEFAULT_PRICE_PER_COTA = 0.99
const DEFAULT_MAIN_PRIZE = 'BMW R1200 GS 2015/2016'
const DEFAULT_SECOND_PRIZE = 'Honda CG Start 160 2026/2026'
const DEFAULT_BONUS_PRIZE = '20 PIX de R$ 1.000'

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

interface ReserveNumbersInput {
  numbers: number[]
}

interface ReserveNumbersOutput {
  numbers: number[]
  expiresAtMs: number
  reservationSeconds: number
}

interface UpsertCampaignSettingsInput {
  title?: string
  pricePerCota?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
}

interface UpsertCampaignSettingsOutput {
  campaignId: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
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

function sanitizeCampaignPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpsError('invalid-argument', 'pricePerCota deve ser um numero maior que zero.')
  }

  return Number(numeric.toFixed(2))
}

function sanitizeCampaignTitle(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'title nao pode ser vazio.')
  }

  return normalized.slice(0, 120)
}

function sanitizeCampaignPrize(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', `${fieldName} nao pode ser vazio.`)
  }

  return normalized.slice(0, 160)
}

async function assertAdminRole(uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem alterar a campanha.')
  }
}

function readCampaignTitle(data: DocumentData | undefined): string {
  const fromTitle = sanitizeString(data?.title)
  if (fromTitle) {
    return fromTitle
  }

  const fromName = sanitizeString(data?.name)
  if (fromName) {
    return fromName
  }

  return DEFAULT_CAMPAIGN_TITLE
}

function readCampaignPricePerCota(data: DocumentData | undefined): number {
  const numeric = Number(data?.pricePerCota)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_PRICE_PER_COTA
  }

  return Number(numeric.toFixed(2))
}

function readCampaignMainPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.mainPrize)
  return value || DEFAULT_MAIN_PRIZE
}

function readCampaignSecondPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.secondPrize)
  return value || DEFAULT_SECOND_PRIZE
}

function readCampaignBonusPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.bonusPrize)
  return value || DEFAULT_BONUS_PRIZE
}

function sanitizeNumberStatus(raw: unknown): 'disponivel' | 'reservado' | 'pago' {
  const value = sanitizeString(raw).toLowerCase()

  if (value === 'paid' || value === 'pago') {
    return 'pago'
  }

  if (value === 'reserved' || value === 'reservado') {
    return 'reservado'
  }

  return 'disponivel'
}

function readTimestampMillis(value: unknown): number | null {
  if (!value) {
    return null
  }

  if (value instanceof Timestamp) {
    return value.toMillis()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return Number((value as { toMillis: () => number }).toMillis())
    } catch {
      return null
    }
  }

  return null
}

function sanitizeReservationNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'numbers deve ser uma lista')
  }

  const parsed = Array.from(
    new Set(
      value.map((item) => {
        const number = Number(item)
        if (!Number.isInteger(number)) {
          throw new HttpsError('invalid-argument', 'Todos os numeros devem ser inteiros')
        }

        if (number < RAFFLE_NUMBER_START || number > RAFFLE_NUMBER_END) {
          throw new HttpsError('invalid-argument', `Numero fora da faixa permitida: ${number}`)
        }

        return number
      }),
    ),
  ).sort((a, b) => a - b)

  if (parsed.length < MIN_PURCHASE_QUANTITY) {
    throw new HttpsError('invalid-argument', `Selecione no minimo ${MIN_PURCHASE_QUANTITY} numeros`)
  }

  if (parsed.length > MAX_PURCHASE_QUANTITY) {
    throw new HttpsError('invalid-argument', `Selecione no maximo ${MAX_PURCHASE_QUANTITY} numeros`)
  }

  return parsed
}

function readStoredReservationNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter(
          (number) =>
            Number.isInteger(number) && number >= RAFFLE_NUMBER_START && number <= RAFFLE_NUMBER_END,
        ),
    ),
  ).sort((a, b) => a - b)
}

function sameNumberSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)

  return sortedA.every((value, index) => value === sortedB[index])
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
  reservedNumbers: number[]
}) {
  const paymentRef = db.collection('payments').doc(order.externalId)
  const reservationRef = order.userId ? db.collection('numberReservations').doc(order.userId) : null

  await db.runTransaction(async (transaction) => {
    const numberSnapshots = await Promise.all(
      order.reservedNumbers.map(async (number) => {
        const numberRef = db.collection('raffleNumbers').doc(String(number))
        const numberSnapshot = await transaction.get(numberRef)
        return { number, numberRef, numberSnapshot }
      }),
    )
    const reservationSnapshot = reservationRef ? await transaction.get(reservationRef) : null

    transaction.set(
      paymentRef,
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

    if (!order.userId || order.reservedNumbers.length === 0) {
      return
    }

    for (const { number, numberRef, numberSnapshot } of numberSnapshots) {
      const data = numberSnapshot.exists ? numberSnapshot.data() : null
      const status = sanitizeNumberStatus(data?.status)
      const reservedBy = readString(data?.reservedBy)

      if (status === 'pago') {
        continue
      }

      if (reservedBy && reservedBy !== order.userId) {
        continue
      }

      transaction.set(
        numberRef,
        {
          number,
          status: 'pago',
          reservedBy: null,
          reservedAt: null,
          reservationExpiresAt: null,
          ownerUid: order.userId,
          orderId: order.externalId,
          paidAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
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
}

const callableOptions = {
  region: REGION,
  cors: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://rifa-online-395d9.web.app',
    'https://rifa-online-395d9.firebaseapp.com',
  ],
}

const securedCallableOptions = {
  ...callableOptions,
  secrets: [HORSEPAY_CLIENT_KEY, HORSEPAY_CLIENT_SECRET],
}

export const upsertCampaignSettings = onCall(
  callableOptions,
  async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    await assertAdminRole(request.auth.uid)

    const payload = asRecord(request.data) as Partial<UpsertCampaignSettingsInput>
    const nextTitle = sanitizeCampaignTitle(payload.title)
    const nextPricePerCota = sanitizeCampaignPrice(payload.pricePerCota)
    const nextMainPrize = sanitizeCampaignPrize(payload.mainPrize, 'mainPrize')
    const nextSecondPrize = sanitizeCampaignPrize(payload.secondPrize, 'secondPrize')
    const nextBonusPrize = sanitizeCampaignPrize(payload.bonusPrize, 'bonusPrize')
    const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
    const campaignSnapshot = await campaignRef.get()

    const updateData: DocumentData = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    }

    if (nextTitle !== null) {
      updateData.title = nextTitle
      updateData.name = nextTitle
    }

    if (nextPricePerCota !== null) {
      updateData.pricePerCota = nextPricePerCota
    }

    if (nextMainPrize !== null) {
      updateData.mainPrize = nextMainPrize
    }

    if (nextSecondPrize !== null) {
      updateData.secondPrize = nextSecondPrize
    }

    if (nextBonusPrize !== null) {
      updateData.bonusPrize = nextBonusPrize
    }

    if (!campaignSnapshot.exists) {
      if (!updateData.title) {
        updateData.title = DEFAULT_CAMPAIGN_TITLE
        updateData.name = DEFAULT_CAMPAIGN_TITLE
      }

      if (!updateData.pricePerCota) {
        updateData.pricePerCota = DEFAULT_PRICE_PER_COTA
      }

      if (!updateData.mainPrize) {
        updateData.mainPrize = DEFAULT_MAIN_PRIZE
      }

      if (!updateData.secondPrize) {
        updateData.secondPrize = DEFAULT_SECOND_PRIZE
      }

      if (!updateData.bonusPrize) {
        updateData.bonusPrize = DEFAULT_BONUS_PRIZE
      }

      updateData.status = 'active'
      updateData.createdAt = FieldValue.serverTimestamp()
    } else if (
      nextTitle === null &&
      nextPricePerCota === null &&
      nextMainPrize === null &&
      nextSecondPrize === null &&
      nextBonusPrize === null
    ) {
      throw new HttpsError('invalid-argument', 'Nenhum dado valido para atualizar campanha.')
    }

    await campaignRef.set(updateData, { merge: true })

    const updatedCampaign = await campaignRef.get()
    const campaignData = (updatedCampaign.exists ? updatedCampaign.data() : undefined) as DocumentData | undefined

    return {
      campaignId: CAMPAIGN_DOC_ID,
      title: readCampaignTitle(campaignData),
      pricePerCota: readCampaignPricePerCota(campaignData),
      mainPrize: readCampaignMainPrize(campaignData),
      secondPrize: readCampaignSecondPrize(campaignData),
      bonusPrize: readCampaignBonusPrize(campaignData),
    } satisfies UpsertCampaignSettingsOutput
  },
)

export const reserveNumbers = onCall(
  callableOptions,
  async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    const payload = asRecord(request.data) as Partial<ReserveNumbersInput>
    const requestedNumbers = sanitizeReservationNumbers(payload.numbers)
    const uid = request.auth.uid
    const nowMs = Date.now()
    const expiresAtMs = nowMs + RESERVATION_DURATION_MS
    const expiresAt = Timestamp.fromMillis(expiresAtMs)
    const reservationRef = db.collection('numberReservations').doc(uid)

    await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef)
      const previousNumbers = reservationSnapshot.exists
        ? readStoredReservationNumbers(reservationSnapshot.get('numbers'))
        : []
      const requestedSet = new Set(requestedNumbers)
      const numbersToRelease = previousNumbers.filter((number) => !requestedSet.has(number))
      const allNumbers = Array.from(new Set([...requestedNumbers, ...numbersToRelease]))
      const numberRefs = new Map(allNumbers.map((number) => [number, db.collection('raffleNumbers').doc(String(number))]))
      const snapshots = await Promise.all(
        allNumbers.map(async (number) => {
          const ref = numberRefs.get(number)
          if (!ref) {
            return [number, null] as const
          }

          const snapshot = await transaction.get(ref)
          return [number, snapshot] as const
        }),
      )
      const snapshotByNumber = new Map(snapshots)

      for (const number of requestedNumbers) {
        const snapshot = snapshotByNumber.get(number)
        const data = snapshot?.exists ? snapshot.data() : null
        const status = sanitizeNumberStatus(data?.status)
        const reservedBy = readString(data?.reservedBy)
        const reservationExpiresAt = readTimestampMillis(data?.reservationExpiresAt || data?.expiresAt)
        const isExpired = reservationExpiresAt !== null && reservationExpiresAt <= nowMs

        if (status === 'pago') {
          throw new HttpsError('failed-precondition', `Numero ${number} ja foi pago`)
        }

        if (status === 'reservado' && !isExpired && reservedBy && reservedBy !== uid) {
          throw new HttpsError(
            'failed-precondition',
            `Numero ${number} nao esta mais disponivel. Atualize a selecao e tente novamente.`,
          )
        }
      }

      for (const number of numbersToRelease) {
        const ref = numberRefs.get(number)
        if (!ref) {
          continue
        }

        const snapshot = snapshotByNumber.get(number)
        const data = snapshot?.exists ? snapshot.data() : null
        const status = sanitizeNumberStatus(data?.status)
        const reservedBy = readString(data?.reservedBy)

        if (status === 'pago') {
          continue
        }

        if (status === 'reservado' && reservedBy === uid) {
          transaction.set(
            ref,
            {
              number,
              status: 'disponivel',
              reservedBy: null,
              reservedAt: null,
              reservationExpiresAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
        }
      }

      for (const number of requestedNumbers) {
        const ref = numberRefs.get(number)
        if (!ref) {
          continue
        }

        transaction.set(
          ref,
          {
            number,
            status: 'reservado',
            reservedBy: uid,
            reservedAt: FieldValue.serverTimestamp(),
            reservationExpiresAt: expiresAt,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }

      transaction.set(
        reservationRef,
        {
          uid,
          numbers: requestedNumbers,
          status: 'active',
          expiresAt,
          createdAt: reservationSnapshot.exists
            ? reservationSnapshot.get('createdAt') || FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    logger.info('reserveNumbers succeeded', {
      uid: maskUid(uid),
      quantity: requestedNumbers.length,
      firstNumber: requestedNumbers[0],
      lastNumber: requestedNumbers[requestedNumbers.length - 1],
      expiresAtMs,
    })

    return {
      numbers: requestedNumbers,
      expiresAtMs,
      reservationSeconds: Math.floor(RESERVATION_DURATION_MS / 1000),
    } satisfies ReserveNumbersOutput
  },
)

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
    const reservationRef = db.collection('numberReservations').doc(request.auth.uid)
    const reservationSnapshot = await reservationRef.get()

    if (!payerName) {
      throw new HttpsError('invalid-argument', 'payerName e obrigatorio')
    }

    if (!reservationSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Sua reserva nao foi encontrada. Reserve seus numeros novamente.')
    }

    const reservationNumbers = readStoredReservationNumbers(reservationSnapshot.get('numbers'))
    const reservationExpiresAtMs = readTimestampMillis(reservationSnapshot.get('expiresAt'))

    if (reservationNumbers.length < MIN_PURCHASE_QUANTITY) {
      throw new HttpsError(
        'failed-precondition',
        'Sua reserva nao possui numeros suficientes para finalizar o pagamento.',
      )
    }

    if (!reservationExpiresAtMs || reservationExpiresAtMs <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Sua reserva expirou. Reserve novamente para gerar o PIX.')
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
      reservationQuantity: reservationNumbers.length,
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
            reservedNumbers: reservationNumbers,
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
        externalId,
        type: 'deposit',
        amount,
        reservedNumbers: reservationNumbers,
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
        const reservedNumbers = readStoredReservationNumbers(existingOrder?.reservedNumbers)

        await runPaidDepositBusinessLogic({
          externalId,
          userId: (existingOrder?.userId as string | undefined) || null,
          amount:
            (typeof existingOrder?.amount === 'number' ? existingOrder.amount : null) ||
            (payload.amount !== undefined ? Number(payload.amount) : null),
          reservedNumbers,
        })

        logger.info('pixWebhook business logic executed', {
          externalId,
          orderType,
          status,
          reservedNumbersCount: reservedNumbers.length,
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
