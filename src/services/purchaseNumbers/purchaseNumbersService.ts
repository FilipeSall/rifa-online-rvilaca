const COUPONS: Record<string, number> = {
  PIX10: 0.1,
  COMBO20: 0.2,
}

export type CouponValidationResult =
  | { status: 'empty'; message: string }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; message: string; code: string; discountRate: number }

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
