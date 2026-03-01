import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore'
import { CAMPAIGN_DOC_ID } from './constants.js'
import { asRecord, readString, readTimestampMillis } from './shared.js'

export const NUMBER_CHUNK_SIZE = 1000

export type NumberStatus = 'disponivel' | 'reservado' | 'pago'

export interface NumberChunkBounds {
  campaignId: string
  chunkStart: number
  chunkEnd: number
  size: number
}

export interface NumberChunkReservationMetaEntry {
  reservedBy: string
  expiresAtMs: number
}

export interface NumberChunkPaidMetaEntry {
  ownerUid: string
  orderId: string
  paidAtMs: number | null
  awardedDrawId: string | null
  awardedPrize: string | null
  awardedAtMs: number | null
}

export type NumberChunkReservationMeta = Record<string, NumberChunkReservationMetaEntry>
export type NumberChunkPaidMeta = Record<string, NumberChunkPaidMetaEntry>

export interface NumberChunkRuntimeState extends NumberChunkBounds {
  reservedBits: Uint8Array
  paidBits: Uint8Array
  reservationMeta: NumberChunkReservationMeta
  paidMeta: NumberChunkPaidMeta
  reservedCount: number
  paidCount: number
  availableCount: number
  dirty: boolean
}

export interface ChunkNumberView {
  number: number
  status: NumberStatus
  reservedBy: string | null
  reservationExpiresAtMs: number | null
}

function toMetaKey(number: number): string {
  return String(number)
}

export function buildNumberChunkDocId(campaignId: string, chunkStart: number) {
  return `${campaignId}_${chunkStart}`
}

export function getNumberChunkRef(db: Firestore, campaignId: string, chunkStart: number) {
  return db.collection('numberChunks').doc(buildNumberChunkDocId(campaignId, chunkStart))
}

export function buildChunkBoundsForChunkStart(params: {
  campaignId?: string
  rangeStart: number
  rangeEnd: number
  chunkStart: number
}): NumberChunkBounds {
  const rangeStart = Math.min(params.rangeStart, params.rangeEnd)
  const rangeEnd = Math.max(params.rangeStart, params.rangeEnd)
  const safeChunkStart = Math.max(rangeStart, Math.min(params.chunkStart, rangeEnd))
  const chunkEnd = Math.min(safeChunkStart + NUMBER_CHUNK_SIZE - 1, rangeEnd)
  return {
    campaignId: params.campaignId || CAMPAIGN_DOC_ID,
    chunkStart: safeChunkStart,
    chunkEnd,
    size: Math.max(0, chunkEnd - safeChunkStart + 1),
  }
}

export function buildChunkBoundsForNumber(params: {
  campaignId?: string
  number: number
  rangeStart: number
  rangeEnd: number
}): NumberChunkBounds {
  const rangeStart = Math.min(params.rangeStart, params.rangeEnd)
  const rangeEnd = Math.max(params.rangeStart, params.rangeEnd)
  const clampedNumber = Math.max(rangeStart, Math.min(params.number, rangeEnd))
  const offset = clampedNumber - rangeStart
  const chunkStart = rangeStart + Math.floor(offset / NUMBER_CHUNK_SIZE) * NUMBER_CHUNK_SIZE
  return buildChunkBoundsForChunkStart({
    campaignId: params.campaignId,
    rangeStart,
    rangeEnd,
    chunkStart,
  })
}

export function mapNumbersByChunkStart(params: {
  numbers: number[]
  rangeStart: number
  rangeEnd: number
}): Map<number, number[]> {
  const grouped = new Map<number, number[]>()
  const uniqueNumbers = Array.from(new Set(
    params.numbers.filter((number) =>
      Number.isInteger(number) && number >= params.rangeStart && number <= params.rangeEnd),
  )).sort((a, b) => a - b)

  for (const number of uniqueNumbers) {
    const bounds = buildChunkBoundsForNumber({
      number,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
    })
    const current = grouped.get(bounds.chunkStart) || []
    current.push(number)
    grouped.set(bounds.chunkStart, current)
  }

  return grouped
}

export function listChunkStartsInWindow(params: {
  pageStart: number
  pageSize: number
  rangeStart: number
  rangeEnd: number
}): number[] {
  if (params.pageSize <= 0) {
    return []
  }

  const start = Math.max(params.rangeStart, Math.min(params.pageStart, params.rangeEnd))
  const end = Math.min(start + params.pageSize - 1, params.rangeEnd)
  const chunkStarts: number[] = []

  for (let number = start; number <= end; number += NUMBER_CHUNK_SIZE) {
    const bounds = buildChunkBoundsForNumber({
      number,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
    })
    chunkStarts.push(bounds.chunkStart)
  }

  const finalBounds = buildChunkBoundsForNumber({
    number: end,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
  })
  chunkStarts.push(finalBounds.chunkStart)

  return Array.from(new Set(chunkStarts)).sort((a, b) => a - b)
}

function createEmptyBitmap(size: number): Uint8Array {
  return new Uint8Array(Math.ceil(Math.max(size, 0) / 8))
}

function readBitmap(raw: unknown, size: number): Uint8Array {
  if (typeof raw !== 'string' || !raw) {
    return createEmptyBitmap(size)
  }

  try {
    const decoded = Buffer.from(raw, 'base64')
    const expectedBytes = Math.ceil(Math.max(size, 0) / 8)
    if (decoded.length !== expectedBytes) {
      return createEmptyBitmap(size)
    }
    return Uint8Array.from(decoded)
  } catch {
    return createEmptyBitmap(size)
  }
}

function writeBitmap(bitmap: Uint8Array): string {
  return Buffer.from(bitmap).toString('base64')
}

function getBit(bitmap: Uint8Array, index: number): boolean {
  const byteIndex = Math.floor(index / 8)
  const bitIndex = index % 8
  if (byteIndex < 0 || byteIndex >= bitmap.length) {
    return false
  }

  return (bitmap[byteIndex] & (1 << bitIndex)) !== 0
}

function setBit(bitmap: Uint8Array, index: number, enabled: boolean): boolean {
  const byteIndex = Math.floor(index / 8)
  const bitIndex = index % 8
  if (byteIndex < 0 || byteIndex >= bitmap.length) {
    return false
  }

  const mask = 1 << bitIndex
  const before = bitmap[byteIndex]
  bitmap[byteIndex] = enabled ? before | mask : before & (~mask)
  return bitmap[byteIndex] !== before
}

function resolveNumberOffset(state: NumberChunkRuntimeState, number: number): number | null {
  if (!Number.isInteger(number) || number < state.chunkStart || number > state.chunkEnd) {
    return null
  }

  return number - state.chunkStart
}

function readReservationMeta(raw: unknown, bounds: NumberChunkBounds): NumberChunkReservationMeta {
  const parsed = asRecord(raw)
  const result: NumberChunkReservationMeta = {}

  for (const [key, rawValue] of Object.entries(parsed)) {
    const number = Number(key)
    if (!Number.isInteger(number) || number < bounds.chunkStart || number > bounds.chunkEnd) {
      continue
    }

    const data = asRecord(rawValue)
    const reservedBy = readString(data.reservedBy)
    const expiresAtMs = readTimestampMillis(data.expiresAtMs ?? data.expiresAt ?? data.reservationExpiresAt)

    if (!reservedBy || !expiresAtMs || expiresAtMs <= 0) {
      continue
    }

    result[toMetaKey(number)] = {
      reservedBy,
      expiresAtMs,
    }
  }

  return result
}

function readPaidMeta(raw: unknown, bounds: NumberChunkBounds): NumberChunkPaidMeta {
  const parsed = asRecord(raw)
  const result: NumberChunkPaidMeta = {}

  for (const [key, rawValue] of Object.entries(parsed)) {
    const number = Number(key)
    if (!Number.isInteger(number) || number < bounds.chunkStart || number > bounds.chunkEnd) {
      continue
    }

    const data = asRecord(rawValue)
    const ownerUid = readString(data.ownerUid)
    const orderId = readString(data.orderId)

    if (!ownerUid || !orderId) {
      continue
    }

    result[toMetaKey(number)] = {
      ownerUid,
      orderId,
      paidAtMs: readTimestampMillis(data.paidAtMs ?? data.paidAt),
      awardedDrawId: readString(data.awardedDrawId),
      awardedPrize: readString(data.awardedPrize),
      awardedAtMs: readTimestampMillis(data.awardedAtMs ?? data.awardedAt),
    }
  }

  return result
}

function recountChunk(state: NumberChunkRuntimeState) {
  let paidCount = 0
  let reservedCount = 0

  for (let offset = 0; offset < state.size; offset += 1) {
    if (getBit(state.paidBits, offset)) {
      paidCount += 1
      continue
    }

    if (getBit(state.reservedBits, offset)) {
      reservedCount += 1
    }
  }

  const availableCount = Math.max(0, state.size - paidCount - reservedCount)
  if (
    paidCount !== state.paidCount
    || reservedCount !== state.reservedCount
    || availableCount !== state.availableCount
  ) {
    state.dirty = true
  }
  state.paidCount = paidCount
  state.reservedCount = reservedCount
  state.availableCount = availableCount
}

export function createEmptyChunkState(bounds: NumberChunkBounds): NumberChunkRuntimeState {
  return {
    ...bounds,
    reservedBits: createEmptyBitmap(bounds.size),
    paidBits: createEmptyBitmap(bounds.size),
    reservationMeta: {},
    paidMeta: {},
    reservedCount: 0,
    paidCount: 0,
    availableCount: bounds.size,
    dirty: false,
  }
}

export function readChunkStateFromDoc(params: {
  bounds: NumberChunkBounds
  docData: DocumentData | null | undefined
  nowMs: number
}): NumberChunkRuntimeState {
  const state = createEmptyChunkState(params.bounds)
  const raw = params.docData || null
  if (!raw) {
    return state
  }

  state.reservedBits = readBitmap(raw.reservedBitmap, state.size)
  state.paidBits = readBitmap(raw.paidBitmap, state.size)
  state.reservationMeta = readReservationMeta(raw.reservationMeta, state)
  state.paidMeta = readPaidMeta(raw.paidMeta, state)
  reconcileChunkState(state, params.nowMs)
  return state
}

export function reconcileChunkState(state: NumberChunkRuntimeState, nowMs: number) {
  for (let offset = 0; offset < state.size; offset += 1) {
    const number = state.chunkStart + offset
    const key = toMetaKey(number)
    const paid = getBit(state.paidBits, offset)
    let reserved = getBit(state.reservedBits, offset)
    const reservation = state.reservationMeta[key]
    const paidMeta = state.paidMeta[key]
    const hasActiveReservation = Boolean(reservation && reservation.reservedBy && reservation.expiresAtMs > nowMs)

    if (paid) {
      if (reserved) {
        const changed = setBit(state.reservedBits, offset, false)
        state.dirty = state.dirty || changed
        reserved = false
      }

      if (reservation) {
        delete state.reservationMeta[key]
        state.dirty = true
      }

      if (!paidMeta || !paidMeta.ownerUid || !paidMeta.orderId) {
        delete state.paidMeta[key]
        state.dirty = true
      }
      continue
    }

    if (paidMeta) {
      delete state.paidMeta[key]
      state.dirty = true
    }

    if (!reserved && hasActiveReservation) {
      const changed = setBit(state.reservedBits, offset, true)
      state.dirty = state.dirty || changed
      reserved = true
    }

    if (reserved && !hasActiveReservation) {
      const changed = setBit(state.reservedBits, offset, false)
      state.dirty = state.dirty || changed
      reserved = false
      if (reservation) {
        delete state.reservationMeta[key]
        state.dirty = true
      }
    }

    if (!reserved && reservation) {
      delete state.reservationMeta[key]
      state.dirty = true
    }
  }

  recountChunk(state)
}

export function getChunkNumberView(state: NumberChunkRuntimeState, number: number): ChunkNumberView {
  const offset = resolveNumberOffset(state, number)
  if (offset === null) {
    return {
      number,
      status: 'disponivel',
      reservedBy: null,
      reservationExpiresAtMs: null,
    }
  }

  if (getBit(state.paidBits, offset)) {
    return {
      number,
      status: 'pago',
      reservedBy: null,
      reservationExpiresAtMs: null,
    }
  }

  if (!getBit(state.reservedBits, offset)) {
    return {
      number,
      status: 'disponivel',
      reservedBy: null,
      reservationExpiresAtMs: null,
    }
  }

  const reservation = state.reservationMeta[toMetaKey(number)]
  return {
    number,
    status: 'reservado',
    reservedBy: reservation?.reservedBy || null,
    reservationExpiresAtMs: reservation?.expiresAtMs || null,
  }
}

export function getChunkPaidMeta(
  state: NumberChunkRuntimeState,
  number: number,
): NumberChunkPaidMetaEntry | null {
  const offset = resolveNumberOffset(state, number)
  if (offset === null) {
    return null
  }

  if (!getBit(state.paidBits, offset)) {
    return null
  }

  return state.paidMeta[toMetaKey(number)] || null
}

export function markNumberAsReserved(params: {
  state: NumberChunkRuntimeState
  number: number
  uid: string
  expiresAtMs: number
}) {
  const { state, number, uid, expiresAtMs } = params
  const offset = resolveNumberOffset(state, number)
  if (offset === null || getBit(state.paidBits, offset)) {
    return
  }

  const changed = setBit(state.reservedBits, offset, true)
  if (changed) {
    state.dirty = true
  }

  const key = toMetaKey(number)
  const previous = state.reservationMeta[key]
  if (!previous || previous.reservedBy !== uid || previous.expiresAtMs !== expiresAtMs) {
    state.reservationMeta[key] = {
      reservedBy: uid,
      expiresAtMs,
    }
    state.dirty = true
  }
}

export function clearNumberReservation(params: {
  state: NumberChunkRuntimeState
  number: number
  uid: string
}) {
  const { state, number, uid } = params
  const offset = resolveNumberOffset(state, number)
  if (offset === null || getBit(state.paidBits, offset)) {
    return
  }

  const key = toMetaKey(number)
  const meta = state.reservationMeta[key]
  if (!meta || meta.reservedBy !== uid) {
    return
  }

  const changed = setBit(state.reservedBits, offset, false)
  if (changed) {
    state.dirty = true
  }
  delete state.reservationMeta[key]
  state.dirty = true
}

export function markNumberAsPaid(params: {
  state: NumberChunkRuntimeState
  number: number
  userId: string
  orderId: string
  paidAtMs: number | null
}) {
  const { state, number, userId, orderId, paidAtMs } = params
  const offset = resolveNumberOffset(state, number)
  if (offset === null) {
    return
  }

  const key = toMetaKey(number)
  const paidChanged = setBit(state.paidBits, offset, true)
  const reservedChanged = setBit(state.reservedBits, offset, false)
  const hadReservation = Boolean(state.reservationMeta[key])
  delete state.reservationMeta[key]

  const previous = state.paidMeta[key]
  const next: NumberChunkPaidMetaEntry = {
    ownerUid: userId,
    orderId,
    paidAtMs,
    awardedDrawId: previous?.awardedDrawId || null,
    awardedPrize: previous?.awardedPrize || null,
    awardedAtMs: previous?.awardedAtMs || null,
  }

  if (
    !previous
    || previous.ownerUid !== next.ownerUid
    || previous.orderId !== next.orderId
    || previous.paidAtMs !== next.paidAtMs
    || previous.awardedDrawId !== next.awardedDrawId
    || previous.awardedPrize !== next.awardedPrize
    || previous.awardedAtMs !== next.awardedAtMs
  ) {
    state.paidMeta[key] = next
    state.dirty = true
  }

  if (paidChanged || reservedChanged || hadReservation) {
    state.dirty = true
  }
}

export function markNumberAsAwarded(params: {
  state: NumberChunkRuntimeState
  number: number
  drawId: string
  prize: string
  awardedAtMs: number
}) {
  const offset = resolveNumberOffset(params.state, params.number)
  if (offset === null || !getBit(params.state.paidBits, offset)) {
    return
  }

  const key = toMetaKey(params.number)
  const existing = params.state.paidMeta[key]
  if (!existing) {
    return
  }

  if (
    existing.awardedDrawId === params.drawId
    && existing.awardedPrize === params.prize
    && existing.awardedAtMs === params.awardedAtMs
  ) {
    return
  }

  params.state.paidMeta[key] = {
    ...existing,
    awardedDrawId: params.drawId,
    awardedPrize: params.prize,
    awardedAtMs: params.awardedAtMs,
  }
  params.state.dirty = true
}

export function writeChunkStateToDoc(
  state: NumberChunkRuntimeState,
  timestampValue: unknown = FieldValue.serverTimestamp(),
): DocumentData {
  recountChunk(state)
  return {
    campaignId: state.campaignId,
    chunkStart: state.chunkStart,
    chunkEnd: state.chunkEnd,
    size: state.size,
    reservedBitmap: writeBitmap(state.reservedBits),
    paidBitmap: writeBitmap(state.paidBits),
    reservationMeta: state.reservationMeta,
    paidMeta: state.paidMeta,
    reservedCount: state.reservedCount,
    paidCount: state.paidCount,
    availableCount: state.availableCount,
    updatedAt: timestampValue,
  }
}

export function buildChunkWindowNumbers(params: {
  chunkStates: Map<number, NumberChunkRuntimeState>
  pageStart: number
  pageSize: number
  rangeEnd: number
}): Array<{
  number: number
  status: NumberStatus
  reservationExpiresAtMs: number | null
}> {
  const pageEnd = Math.min(params.pageStart + params.pageSize - 1, params.rangeEnd)
  const numbers: Array<{
    number: number
    status: NumberStatus
    reservationExpiresAtMs: number | null
  }> = []
  const orderedStates = Array.from(params.chunkStates.values()).sort((a, b) => a.chunkStart - b.chunkStart)
  let stateIndex = 0

  for (let number = params.pageStart; number <= pageEnd; number += 1) {
    while (stateIndex < orderedStates.length && number > orderedStates[stateIndex].chunkEnd) {
      stateIndex += 1
    }
    const state = stateIndex < orderedStates.length ? orderedStates[stateIndex] : null

    if (!state || number < state.chunkStart) {
      numbers.push({
        number,
        status: 'disponivel',
        reservationExpiresAtMs: null,
      })
      continue
    }

    const view = getChunkNumberView(state, number)
    numbers.push({
      number,
      status: view.status,
      reservationExpiresAtMs: view.reservationExpiresAtMs,
    })
  }

  return numbers
}
