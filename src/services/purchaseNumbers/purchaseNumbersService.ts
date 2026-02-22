import type { CampaignCoupon } from '../../types/campaign'

export type CouponValidationResult =
  | { status: 'empty'; message: string }
  | { status: 'invalid'; message: string }
  | {
    status: 'valid'
    message: string
    code: string
    discountType: CampaignCoupon['discountType']
    discountValue: number
  }

function normalizeCode(rawCode: string) {
  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24)
}

function computeDiscountAmount(subtotal: number, coupon: CampaignCoupon) {
  if (coupon.discountType === 'percent') {
    return Number(Math.min(subtotal, subtotal * (coupon.discountValue / 100)).toFixed(2))
  }

  return Number(Math.min(subtotal, coupon.discountValue).toFixed(2))
}

export function validateCouponCode(
  rawCode: string,
  campaignCoupons: CampaignCoupon[],
  subtotal: number,
): CouponValidationResult {
  const normalizedCode = normalizeCode(rawCode)

  if (!normalizedCode) {
    return {
      status: 'empty',
      message: 'Digite um cupom valido.',
    }
  }

  const coupon = campaignCoupons.find(
    (item) => item.code === normalizedCode && item.active,
  )

  if (!coupon) {
    return {
      status: 'invalid',
      message: 'Cupom nao encontrado ou inativo.',
    }
  }

  const discountAmount = computeDiscountAmount(subtotal, coupon)
  if (discountAmount <= 0) {
    return {
      status: 'invalid',
      message: 'Cupom sem efeito para o valor atual da compra.',
    }
  }

  const discountLabel = coupon.discountType === 'percent'
    ? `${coupon.discountValue.toFixed(2).replace(/\.00$/, '')}%`
    : `R$ ${coupon.discountValue.toFixed(2).replace('.', ',')}`

  return {
    status: 'valid',
    code: normalizedCode,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    message: `Cupom ${normalizedCode} aplicado: desconto ${discountLabel}.`,
  }
}

export function getCouponHint(campaignCoupons: CampaignCoupon[]) {
  const activeCoupons = campaignCoupons.filter((item) => item.active)
  if (activeCoupons.length === 0) {
    return 'Nenhum cupom ativo para esta campanha.'
  }

  return `Cupons ativos: ${activeCoupons.slice(0, 3).map((item) => item.code).join(', ')}${activeCoupons.length > 3 ? '...' : ''}`
}

export function calculateCouponDiscount(
  subtotal: number,
  discountType: CampaignCoupon['discountType'] | null,
  discountValue: number,
) {
  if (!discountType || discountValue <= 0 || subtotal <= 0) {
    return 0
  }

  if (discountType === 'percent') {
    return Number(Math.min(subtotal, subtotal * (discountValue / 100)).toFixed(2))
  }

  return Number(Math.min(subtotal, discountValue).toFixed(2))
}
