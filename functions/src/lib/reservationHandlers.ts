import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_DOC_ID,
  MAX_PURCHASE_QUANTITY,
  MIN_PURCHASE_QUANTITY,
  RAFFLE_NUMBER_END,
  RAFFLE_NUMBER_START,
  RESERVATION_DURATION_MS,
} from './constants.js'
import {
  buildNumberStateView,
  buildReservedNumberStateData,
  getNumberStateRef,
  readCampaignNumberRange,
} from './numberStateStore.js'
import { asRecord, maskUid } from './shared.js'

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

function sanitizeReservationNumbers(value: unknown, rangeStart: number, rangeEnd: number): number[] {
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

  if (parsed.length < MIN_PURCHASE_QUANTITY) {
    throw new HttpsError('invalid-argument', `Selecione no minimo ${MIN_PURCHASE_QUANTITY} numeros`)
  }

  if (parsed.length > MAX_PURCHASE_QUANTITY) {
    throw new HttpsError('invalid-argument', `Selecione no maximo ${MAX_PURCHASE_QUANTITY} numeros`)
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

export function createReserveNumbersHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    const payload = asRecord(request.data) as Partial<ReserveNumbersInput>
    const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
    const campaignSnapshot = await campaignRef.get()
    const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
    const campaignRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
    const requestedNumbers = sanitizeReservationNumbers(payload.numbers, campaignRange.start, campaignRange.end)
    const uid = request.auth.uid
    const nowMs = Date.now()
    const expiresAtMs = nowMs + RESERVATION_DURATION_MS
    const expiresAt = Timestamp.fromMillis(expiresAtMs)
    const reservationRef = db.collection('numberReservations').doc(uid)

    await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef)
      const previousNumbers = reservationSnapshot.exists
        ? readStoredReservationNumbers(
            reservationSnapshot.get('numbers'),
            campaignRange.start,
            campaignRange.end,
          )
        : []
      const requestedSet = new Set(requestedNumbers)
      const numbersToRelease = previousNumbers.filter((number) => !requestedSet.has(number))
      const allNumbers = Array.from(new Set([...requestedNumbers, ...numbersToRelease]))
      const numberStateRefs = new Map(
        allNumbers.map((number) => [number, getNumberStateRef(db, CAMPAIGN_DOC_ID, number)]),
      )
      const numberStateSnapshots = await Promise.all(
        allNumbers.map((number) => {
          const ref = numberStateRefs.get(number)
          return ref ? transaction.get(ref) : Promise.resolve(null)
        }),
      )
      const numberStateSnapshotByNumber = new Map(
        allNumbers.map((number, index) => [number, numberStateSnapshots[index]]),
      )

      for (const number of requestedNumbers) {
        const numberStateSnapshot = numberStateSnapshotByNumber.get(number)
        const state = buildNumberStateView({
          number,
          nowMs,
          numberStateData: numberStateSnapshot?.exists ? numberStateSnapshot.data() : null,
        })
        const hasActiveReservation =
          state.status === 'reservado'
          && (state.reservationExpiresAtMs === null || state.reservationExpiresAtMs > nowMs)

        if (state.status === 'pago') {
          throw new HttpsError('failed-precondition', `Numero ${number} ja foi pago`)
        }

        if (hasActiveReservation && state.reservedBy !== uid) {
          throw new HttpsError(
            'failed-precondition',
            `Numero ${number} nao esta mais disponivel. Atualize a selecao e tente novamente.`,
          )
        }
      }

      for (const number of numbersToRelease) {
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

        if (state.status === 'reservado' && state.reservedBy === uid) {
          transaction.delete(numberStateRef)
        }
      }

      for (const number of requestedNumbers) {
        const numberStateRef = numberStateRefs.get(number)

        if (!numberStateRef) {
          continue
        }

        transaction.set(numberStateRef, buildReservedNumberStateData({
          campaignId: CAMPAIGN_DOC_ID,
          number,
          uid,
          expiresAt,
        }), { merge: true })
      }

      transaction.set(
        reservationRef,
        {
          uid,
          campaignId: CAMPAIGN_DOC_ID,
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
  }
}

export function createReleaseReservationHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    const uid = request.auth.uid
    const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
    const campaignSnapshot = await campaignRef.get()
    const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
    const campaignRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
    const reservationRef = db.collection('numberReservations').doc(uid)
    const nowMs = Date.now()
    let releasedNumbers = 0

    await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef)
      if (!reservationSnapshot.exists) {
        return
      }

      const reservedNumbers = readStoredReservationNumbers(
        reservationSnapshot.get('numbers'),
        campaignRange.start,
        campaignRange.end,
      )

      if (reservedNumbers.length === 0) {
        transaction.delete(reservationRef)
        return
      }

      const numberStateRefs = new Map(
        reservedNumbers.map((number) => [number, getNumberStateRef(db, CAMPAIGN_DOC_ID, number)]),
      )
      const numberStateSnapshots = await Promise.all(
        reservedNumbers.map((number) => {
          const ref = numberStateRefs.get(number)
          return ref ? transaction.get(ref) : Promise.resolve(null)
        }),
      )

      for (let index = 0; index < reservedNumbers.length; index += 1) {
        const number = reservedNumbers[index]
        const numberStateRef = numberStateRefs.get(number)
        const numberStateSnapshot = numberStateSnapshots[index]

        if (!numberStateRef) {
          continue
        }

        const state = buildNumberStateView({
          number,
          nowMs,
          numberStateData: numberStateSnapshot?.exists ? numberStateSnapshot.data() : null,
        })

        if (state.status === 'reservado' && state.reservedBy === uid) {
          transaction.delete(numberStateRef)
          releasedNumbers += 1
        }
      }

      transaction.delete(reservationRef)
    })

    logger.info('releaseReservation succeeded', {
      uid: maskUid(uid),
      releasedNumbers,
    })

    return {
      releasedNumbers,
    } satisfies ReleaseReservationOutput
  }
}
