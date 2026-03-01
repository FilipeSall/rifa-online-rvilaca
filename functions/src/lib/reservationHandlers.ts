import {
  type DocumentReference,
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_DOC_ID,
  MAX_PURCHASE_QUANTITY,
  RAFFLE_NUMBER_END,
  RAFFLE_NUMBER_START,
  RESERVATION_DURATION_MS,
} from './constants.js'
import { readCampaignPurchaseQuantityLimits } from './campaignHandlers.js'
import {
  buildChunkBoundsForNumber,
  clearNumberReservation,
  getChunkNumberView,
  getNumberChunkRef,
  mapNumbersByChunkStart,
  markNumberAsReserved,
  readChunkStateFromDoc,
  type NumberChunkRuntimeState,
  writeChunkStateToDoc,
} from './numberChunkStore.js'
import { readCampaignNumberRange } from './numberStateStore.js'
import { asRecord, maskUid, requireActiveUid } from './shared.js'

interface ReserveNumbersInput {
  numbers: number[]
}

interface ReserveNumbersOutput {
  numbers: number[]
  expiresAtMs: number
  reservationSeconds: number
}

interface ReleaseReservationOutput {
  releasedNumbers: number
}

interface ReservationOperationStats {
  numbersRequested: number
  previousCount: number
  uniqueStateReads: number
  conflictsCount: number
  transactionAttempts: number
  chunksRead: number
  chunksWritten: number
}

function createReservationStats(numbersRequested = 0): ReservationOperationStats {
  return {
    numbersRequested,
    previousCount: 0,
    uniqueStateReads: 0,
    conflictsCount: 0,
    transactionAttempts: 0,
    chunksRead: 0,
    chunksWritten: 0,
  }
}

function sanitizeReservationNumbers(
  value: unknown,
  rangeStart: number,
  rangeEnd: number,
  minReservationQuantity: number,
  maxReservationQuantity: number,
): number[] {
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

        if (number < rangeStart || number > rangeEnd) {
          throw new HttpsError('invalid-argument', `Numero fora da faixa permitida: ${number}`)
        }

        return number
      }),
    ),
  ).sort((a, b) => a - b)

  if (parsed.length < minReservationQuantity) {
    throw new HttpsError('invalid-argument', `Selecione no minimo ${minReservationQuantity} numeros`)
  }

  if (parsed.length > maxReservationQuantity) {
    throw new HttpsError(
      'invalid-argument',
      `Selecione no maximo ${maxReservationQuantity} numeros`,
      { maxAllowed: maxReservationQuantity },
    )
  }

  return parsed
}

export function readStoredReservationNumbers(
  value: unknown,
  rangeStart: number = RAFFLE_NUMBER_START,
  rangeEnd: number = RAFFLE_NUMBER_END,
): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((number) => Number.isInteger(number) && number >= rangeStart && number <= rangeEnd),
    ),
  ).sort((a, b) => a - b)
}

function resolveChunkStart(number: number, rangeStart: number, rangeEnd: number): number {
  return buildChunkBoundsForNumber({
    campaignId: CAMPAIGN_DOC_ID,
    number,
    rangeStart,
    rangeEnd,
  }).chunkStart
}

async function loadChunkStatesForNumbers(params: {
  db: Firestore
  transaction: Transaction
  numbers: number[]
  rangeStart: number
  rangeEnd: number
  nowMs: number
  stats: ReservationOperationStats
}) {
  const groupedNumbers = mapNumbersByChunkStart({
    numbers: params.numbers,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
  })

  const chunkStarts = Array.from(groupedNumbers.keys()).sort((a, b) => a - b)
  const chunkRefs = new Map(
    chunkStarts.map((chunkStart) => [chunkStart, getNumberChunkRef(params.db, CAMPAIGN_DOC_ID, chunkStart)]),
  )

  params.stats.chunksRead = chunkStarts.length

  const chunkSnapshots = await Promise.all(
    chunkStarts.map((chunkStart) => {
      const ref = chunkRefs.get(chunkStart)
      return ref ? params.transaction.get(ref) : Promise.resolve(null)
    }),
  )

  const chunkStatesByStart = new Map<number, NumberChunkRuntimeState>()

  for (let index = 0; index < chunkStarts.length; index += 1) {
    const chunkStart = chunkStarts[index]
    const snapshot = chunkSnapshots[index]
    const bounds = buildChunkBoundsForNumber({
      campaignId: CAMPAIGN_DOC_ID,
      number: chunkStart,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
    })
    const chunkState = readChunkStateFromDoc({
      bounds,
      docData: snapshot?.exists ? (snapshot.data() || null) : null,
      nowMs: params.nowMs,
    })
    chunkStatesByStart.set(chunkStart, chunkState)
  }

  return {
    chunkRefs,
    chunkStatesByStart,
  }
}

async function reserveNumbersByChunk(params: {
  db: Firestore
  uid: string
  requestedNumbers: number[]
  expiresAt: Timestamp
  expiresAtMs: number
  campaignRange: { start: number; end: number }
  reservationRef: DocumentReference<DocumentData>
  stats: ReservationOperationStats
}) {
  const nowMs = params.expiresAtMs - RESERVATION_DURATION_MS

  await params.db.runTransaction(async (transaction) => {
    params.stats.transactionAttempts += 1

    const reservationSnapshot = await transaction.get(params.reservationRef)
    const previousNumbers = reservationSnapshot.exists
      ? readStoredReservationNumbers(
        reservationSnapshot.get('numbers'),
        params.campaignRange.start,
        params.campaignRange.end,
      )
      : []
    params.stats.previousCount = previousNumbers.length

    const requestedSet = new Set(params.requestedNumbers)
    const numbersToRelease = previousNumbers.filter((number) => !requestedSet.has(number))
    const allNumbers = Array.from(new Set([...params.requestedNumbers, ...numbersToRelease])).sort((a, b) => a - b)
    params.stats.uniqueStateReads = allNumbers.length

    const { chunkRefs, chunkStatesByStart } = await loadChunkStatesForNumbers({
      db: params.db,
      transaction,
      numbers: allNumbers,
      rangeStart: params.campaignRange.start,
      rangeEnd: params.campaignRange.end,
      nowMs,
      stats: params.stats,
    })

    const conflictedReservedNumbers: number[] = []
    const conflictedPaidNumbers: number[] = []

    for (const number of params.requestedNumbers) {
      const chunkStart = resolveChunkStart(number, params.campaignRange.start, params.campaignRange.end)
      const chunkState = chunkStatesByStart.get(chunkStart)
      if (!chunkState) {
        continue
      }

      const state = getChunkNumberView(chunkState, number)
      if (state.status === 'pago') {
        conflictedPaidNumbers.push(number)
        continue
      }

      if (state.status === 'reservado' && state.reservedBy !== params.uid) {
        conflictedReservedNumbers.push(number)
      }
    }

    const conflictedNumbers = Array.from(new Set(
      [...conflictedReservedNumbers, ...conflictedPaidNumbers],
    )).sort((a, b) => a - b)
    params.stats.conflictsCount = conflictedNumbers.length

    if (conflictedNumbers.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        `Alguns numeros nao estao mais disponiveis: ${conflictedNumbers.join(', ')}`,
        {
          conflictedNumbers,
          conflictedReservedNumbers,
          conflictedPaidNumbers,
        },
      )
    }

    for (const number of numbersToRelease) {
      const chunkStart = resolveChunkStart(number, params.campaignRange.start, params.campaignRange.end)
      const chunkState = chunkStatesByStart.get(chunkStart)
      if (!chunkState) {
        continue
      }

      clearNumberReservation({
        state: chunkState,
        number,
        uid: params.uid,
      })
    }

    for (const number of params.requestedNumbers) {
      const chunkStart = resolveChunkStart(number, params.campaignRange.start, params.campaignRange.end)
      const chunkState = chunkStatesByStart.get(chunkStart)
      if (!chunkState) {
        continue
      }

      markNumberAsReserved({
        state: chunkState,
        number,
        uid: params.uid,
        expiresAtMs: params.expiresAtMs,
      })
    }

    params.stats.chunksWritten = 0
    for (const [chunkStart, chunkState] of chunkStatesByStart.entries()) {
      if (!chunkState.dirty) {
        continue
      }

      const chunkRef = chunkRefs.get(chunkStart)
      if (!chunkRef) {
        continue
      }

      transaction.set(chunkRef, writeChunkStateToDoc(chunkState), { merge: true })
      params.stats.chunksWritten += 1
    }

    transaction.set(
      params.reservationRef,
      {
        uid: params.uid,
        campaignId: CAMPAIGN_DOC_ID,
        numbers: params.requestedNumbers,
        status: 'active',
        expiresAt: params.expiresAt,
        createdAt: reservationSnapshot.exists
          ? reservationSnapshot.get('createdAt') || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export function createReserveNumbersHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    const uid = requireActiveUid(request.auth)
    const startedAtMs = Date.now()
    const stats = createReservationStats()

    try {
      const payload = asRecord(request.data) as Partial<ReserveNumbersInput>
      const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
      const campaignSnapshot = await campaignRef.get()
      const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
      const campaignRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
      const quantityLimits = readCampaignPurchaseQuantityLimits(campaignData)
      const maxReservationQuantity = Math.min(campaignRange.total, MAX_PURCHASE_QUANTITY, quantityLimits.max)
      const minReservationQuantity = Math.min(quantityLimits.min, maxReservationQuantity)
      const requestedNumbers = sanitizeReservationNumbers(
        payload.numbers,
        campaignRange.start,
        campaignRange.end,
        minReservationQuantity,
        maxReservationQuantity,
      )
      const nowMs = Date.now()
      const expiresAtMs = nowMs + RESERVATION_DURATION_MS
      const expiresAt = Timestamp.fromMillis(expiresAtMs)
      const reservationRef = db.collection('numberReservations').doc(uid)
      stats.numbersRequested = requestedNumbers.length

      logger.info('reserveNumbers started', {
        uid: maskUid(uid),
        numbersRequested: stats.numbersRequested,
        conflictsCount: stats.conflictsCount,
        chunksRead: stats.chunksRead,
        chunksWritten: stats.chunksWritten,
        transactionAttempts: stats.transactionAttempts,
      })

      await reserveNumbersByChunk({
        db,
        uid,
        requestedNumbers,
        expiresAt,
        expiresAtMs,
        campaignRange,
        reservationRef,
        stats,
      })

      const durationMs = Date.now() - startedAtMs

      logger.info('reserveNumbers succeeded', {
        uid: maskUid(uid),
        numbersRequested: stats.numbersRequested,
        previousCount: stats.previousCount,
        uniqueStateReads: stats.uniqueStateReads,
        conflictsCount: stats.conflictsCount,
        chunksRead: stats.chunksRead,
        chunksWritten: stats.chunksWritten,
        transactionAttempts: stats.transactionAttempts,
        durationMs,
        expiresAtMs,
      })

      return {
        numbers: requestedNumbers,
        expiresAtMs,
        reservationSeconds: Math.floor(RESERVATION_DURATION_MS / 1000),
      } satisfies ReserveNumbersOutput
    } catch (error) {
      const durationMs = Date.now() - startedAtMs

      logger.error('reserveNumbers failed', {
        uid: maskUid(uid),
        error: String(error),
        code: error instanceof HttpsError ? error.code : null,
        numbersRequested: stats.numbersRequested,
        previousCount: stats.previousCount,
        uniqueStateReads: stats.uniqueStateReads,
        conflictsCount: stats.conflictsCount,
        chunksRead: stats.chunksRead,
        chunksWritten: stats.chunksWritten,
        transactionAttempts: stats.transactionAttempts,
        durationMs,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao reservar numeros.')
    }
  }
}

async function releaseReservationByChunk(params: {
  db: Firestore
  uid: string
  reservationRef: DocumentReference<DocumentData>
  campaignRange: { start: number; end: number }
  nowMs: number
  stats: ReservationOperationStats
}) {
  let releasedNumbers = 0

  await params.db.runTransaction(async (transaction) => {
    params.stats.transactionAttempts += 1

    const reservationSnapshot = await transaction.get(params.reservationRef)
    if (!reservationSnapshot.exists) {
      return
    }

    const reservedNumbers = readStoredReservationNumbers(
      reservationSnapshot.get('numbers'),
      params.campaignRange.start,
      params.campaignRange.end,
    )
    params.stats.previousCount = reservedNumbers.length

    if (reservedNumbers.length === 0) {
      transaction.delete(params.reservationRef)
      return
    }

    const { chunkRefs, chunkStatesByStart } = await loadChunkStatesForNumbers({
      db: params.db,
      transaction,
      numbers: reservedNumbers,
      rangeStart: params.campaignRange.start,
      rangeEnd: params.campaignRange.end,
      nowMs: params.nowMs,
      stats: params.stats,
    })

    for (const number of reservedNumbers) {
      const chunkStart = resolveChunkStart(number, params.campaignRange.start, params.campaignRange.end)
      const chunkState = chunkStatesByStart.get(chunkStart)
      if (!chunkState) {
        continue
      }

      const before = getChunkNumberView(chunkState, number)
      clearNumberReservation({
        state: chunkState,
        number,
        uid: params.uid,
      })
      const after = getChunkNumberView(chunkState, number)
      if (before.status === 'reservado' && before.reservedBy === params.uid && after.status !== 'reservado') {
        releasedNumbers += 1
      }
    }

    params.stats.chunksWritten = 0
    for (const [chunkStart, chunkState] of chunkStatesByStart.entries()) {
      if (!chunkState.dirty) {
        continue
      }

      const chunkRef = chunkRefs.get(chunkStart)
      if (!chunkRef) {
        continue
      }

      transaction.set(chunkRef, writeChunkStateToDoc(chunkState), { merge: true })
      params.stats.chunksWritten += 1
    }

    transaction.delete(params.reservationRef)
  })

  return releasedNumbers
}

export function createReleaseReservationHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null }) => {
    const uid = requireActiveUid(request.auth)
    const startedAtMs = Date.now()
    const stats = createReservationStats(0)

    try {
      const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
      const campaignSnapshot = await campaignRef.get()
      const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
      const campaignRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
      const reservationRef = db.collection('numberReservations').doc(uid)
      const nowMs = Date.now()

      logger.info('releaseReservation started', {
        uid: maskUid(uid),
      })

      const releasedNumbers = await releaseReservationByChunk({
        db,
        uid,
        reservationRef,
        campaignRange,
        nowMs,
        stats,
      })

      const durationMs = Date.now() - startedAtMs

      logger.info('releaseReservation succeeded', {
        uid: maskUid(uid),
        releasedNumbers,
        numbersRequested: stats.numbersRequested,
        conflictsCount: stats.conflictsCount,
        chunksRead: stats.chunksRead,
        chunksWritten: stats.chunksWritten,
        transactionAttempts: stats.transactionAttempts,
        durationMs,
      })

      return {
        releasedNumbers,
      } satisfies ReleaseReservationOutput
    } catch (error) {
      const durationMs = Date.now() - startedAtMs

      logger.error('releaseReservation failed', {
        uid: maskUid(uid),
        error: String(error),
        numbersRequested: stats.numbersRequested,
        conflictsCount: stats.conflictsCount,
        chunksRead: stats.chunksRead,
        chunksWritten: stats.chunksWritten,
        transactionAttempts: stats.transactionAttempts,
        durationMs,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao liberar reserva.')
    }
  }
}
