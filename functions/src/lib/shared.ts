import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

export type JsonRecord = Record<string, unknown>

export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

export function sanitizePhone(value: unknown): string | null {
  const raw = sanitizeString(value)
  return raw || null
}

export function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as JsonRecord
}

export function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  return null
}

export function getTopLevelKeys(value: unknown): string[] {
  return Object.keys(asRecord(value)).slice(0, 25)
}

export function getValueShape(value: unknown): Record<string, string> {
  const record = asRecord(value)
  const entries = Object.entries(record).slice(0, 25).map(([key, fieldValue]) => [
    key,
    Array.isArray(fieldValue) ? 'array' : typeof fieldValue,
  ])

  return Object.fromEntries(entries)
}

export function getNestedValue(source: unknown, path: string): unknown {
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

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function sanitizeAmount(input: unknown): number {
  const amount = Number(input)

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'amount deve ser um numero maior que zero')
  }

  return Number(amount.toFixed(2))
}

export function sanitizeOptionalAmount(input: unknown): number | null {
  if (input === undefined || input === null || input === '') {
    return null
  }

  const amount = Number(input)
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return Number(amount.toFixed(2))
}

export function readMetricNumber(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Number(numeric.toFixed(2))
}

export function readTimestampMillis(value: unknown): number | null {
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

export function sameNumberSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)

  return sortedA.every((value, index) => value === sortedB[index])
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const serialized = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')
  return `{${serialized}}`
}

export function buildWebhookEventId(externalId: string, payload: JsonRecord): string {
  const stablePayload = stableStringify(payload)
  return createHash('sha256').update(`${externalId}:${stablePayload}`).digest('hex').slice(0, 32)
}

export function getBrazilDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '0000'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

export function maskUid(uid: string): string {
  if (uid.length <= 8) {
    return `${uid.slice(0, 2)}***`
  }

  return `${uid.slice(0, 4)}...${uid.slice(-4)}`
}

export function maskName(name: string): string {
  const clean = sanitizeString(name)
  if (!clean) {
    return ''
  }

  if (clean.length <= 2) {
    return `${clean[0]}*`
  }

  return `${clean.slice(0, 1)}***${clean.slice(-1)}`
}

export function maskPhoneNumber(phone: string | null): string | null {
  if (!phone) {
    return null
  }

  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) {
    return '***'
  }

  return `***${digits.slice(-4)}`
}

export function maskPixKey(pixKey: string): string {
  const value = sanitizeString(pixKey)
  if (value.length <= 6) {
    return '***'
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`
}

export function readHeaderValue(headers: unknown, key: string): string {
  if (!headers || typeof headers !== 'object') {
    return ''
  }

  const candidate = (headers as Record<string, unknown>)[key]
  if (typeof candidate === 'string') {
    return candidate.trim()
  }

  if (Array.isArray(candidate) && candidate.length > 0) {
    const first = candidate[0]
    return typeof first === 'string' ? first.trim() : ''
  }

  return ''
}

export function readQueryToken(query: unknown): string {
  if (!query || typeof query !== 'object') {
    return ''
  }

  const candidate = (query as Record<string, unknown>).token
  if (typeof candidate === 'string') {
    return candidate.trim()
  }

  if (Array.isArray(candidate) && candidate.length > 0) {
    const first = candidate[0]
    return typeof first === 'string' ? first.trim() : ''
  }

  return ''
}

export function hasValidWebhookToken(
  request: { query?: unknown; headers?: unknown },
  expectedToken: string,
): boolean {
  if (!expectedToken) {
    return true
  }

  const queryToken = readQueryToken(request.query)
  if (queryToken && queryToken === expectedToken) {
    return true
  }

  const headerToken =
    readHeaderValue(request.headers, 'x-horsepay-webhook-token') ||
    readHeaderValue(request.headers, 'x-webhook-token')
  return headerToken === expectedToken
}
