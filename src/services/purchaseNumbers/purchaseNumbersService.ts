import type { NumberSlot } from '../../utils/purchaseNumbers'

const COUPONS: Record<string, number> = {
  PIX10: 0.1,
  COMBO20: 0.2,
}

export type CouponValidationResult =
  | { status: 'empty'; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; message: string; code: string; discountRate: number }

export function getPurchaseNumberPool() {
  return Array.from({ length: 120 }, (_, index) => {
    const number = 540001 + index

    if ((index + 3) % 11 === 0) {
      return { number, status: 'reservado' as const }
    }

    if ((index + 5) % 17 === 0) {
      return { number, status: 'pago' as const }
    }

    return { number, status: 'disponivel' as const }
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

