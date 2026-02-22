import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  MAX_PURCHASE_QUANTITY,
  MIN_PURCHASE_QUANTITY,
  RAFFLE_NUMBER_END,
  RAFFLE_NUMBER_START,
  RESERVATION_DURATION_MS,
} from './constants.js'
import { asRecord, maskUid, readString, readTimestampMillis, sanitizeString } from './shared.js'

interface ReserveNumbersInput {
  numbers: number[]
}

interface ReserveNumbersOutput {
  numbers: number[]
  expiresAtMs: number
  reservationSeconds: number
}

export function sanitizeNumberStatus(raw: unknown): 'disponivel' | 'reservado' | 'pago' {
  const value = sanitizeString(raw).toLowerCase()

  if (value === 'paid' || value === 'pago') {
    return 'pago'
  }

  if (value === 'reserved' || value === 'reservado') {
    return 'reservado'
  }

  return 'disponivel'
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

export function readStoredReservationNumbers(value: unknown): number[] {
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

export function createReserveNumbersHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
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
  }
}
