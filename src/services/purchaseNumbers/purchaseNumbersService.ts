import type { NumberSlot } from '../../types/purchaseNumbers'
import { RAFFLE_NUMBER_END, RAFFLE_NUMBER_START } from '../../const/purchaseNumbers'

const COUPONS: Record<string, number> = {
  PIX10: 0.1,
  COMBO20: 0.2,
}

export type CouponValidationResult =
  | { status: 'empty'; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; message: string; code: string; discountRate: number }

export type RemoteNumberState = {
  status: string
  reservationExpiresAtMs: number | null
}

export function normalizeRemoteNumberStatus(remote: RemoteNumberState, nowMs: number): NumberSlot['status'] {
  const normalized = remote.status.trim().toLowerCase()
  const isReserved = normalized === 'reservado' || normalized === 'reserved'
  const isPaid = normalized === 'pago' || normalized === 'paid'
  const isExpiredReservation =
    remote.reservationExpiresAtMs !== null && remote.reservationExpiresAtMs <= nowMs

  if (isPaid) {
    return 'pago'
  }

  if (isReserved && !isExpiredReservation) {
    return 'reservado'
  }

  return 'disponivel'
}

export function getPurchaseNumberPool(remoteStateByNumber: Map<number, RemoteNumberState>) {
  const size = RAFFLE_NUMBER_END - RAFFLE_NUMBER_START + 1
  const nowMs = Date.now()

  return Array.from({ length: size }, (_, index) => {
    const number = RAFFLE_NUMBER_START + index
    const remote = remoteStateByNumber.get(number)

    if (!remote) {
      return { number, status: 'disponivel' as const }
    }

    return {
      number,
      status: normalizeRemoteNumberStatus(remote, nowMs),
    }
  }) satisfies NumberSlot[]
}

export function validateCouponCode(rawCode: string): CouponValidationResult {
  const normalizedCode = rawCode.trim().toUpperCase()

  if (!normalizedCode) {
    return {
      status: 'empty',
      message: 'Digite um cupom válido.',
    }
  }

  const discountRate = COUPONS[normalizedCode]

  if (!discountRate) {
    return {
      status: 'invalid',
      message: 'Cupom não encontrado.',
    }
  }

  return {
    status: 'valid',
    code: normalizedCode,
    discountRate,
    message: `Cupom ${normalizedCode} aplicado com sucesso.`,
  }
}

export function getCouponHint() {
  return 'Cupons de teste: PIX10 e COMBO20'
}
