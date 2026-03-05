import type { CampaignCoupon, CampaignCouponDiscountType } from '../../../../../types/campaign'
import { formatCurrency } from '../../../utils/formatters'

export const MAX_COUPONS = 100

export function normalizeCouponCodeInput(rawCode: string) {
  return rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
}

export function parseCouponValueInput(rawValue: string) {
  return Number(rawValue.replace(',', '.'))
}

export function normalizeCouponDiscountValue(discountType: CampaignCouponDiscountType, parsedValue: number) {
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 0
  }

  if (discountType === 'percent') {
    return Number(Math.min(parsedValue, 100).toFixed(2))
  }

  return Number(parsedValue.toFixed(2))
}

export function canCreateCoupon(params: {
  couponCodeInput: string
  couponValueInput: string
}) {
  const normalizedCode = normalizeCouponCodeInput(params.couponCodeInput)
  const parsedValue = parseCouponValueInput(params.couponValueInput)
  return normalizedCode.length > 0 && Number.isFinite(parsedValue) && parsedValue > 0
}

export function buildCouponFromDraft(params: {
  couponCodeInput: string
  couponValueInput: string
  couponDiscountType: CampaignCouponDiscountType
  nowIso: string
}): CampaignCoupon | null {
  const normalizedCode = normalizeCouponCodeInput(params.couponCodeInput)
  if (!normalizedCode) {
    return null
  }

  const parsedValue = parseCouponValueInput(params.couponValueInput)
  const normalizedValue = normalizeCouponDiscountValue(params.couponDiscountType, parsedValue)

  if (normalizedValue <= 0) {
    return null
  }

  return {
    code: normalizedCode,
    discountType: params.couponDiscountType,
    discountValue: normalizedValue,
    active: true,
    createdAt: params.nowIso,
  }
}

export function upsertCouponByCode(
  coupons: CampaignCoupon[],
  nextCoupon: CampaignCoupon,
  maxCoupons = MAX_COUPONS,
) {
  const deduped = coupons.filter((item) => item.code !== nextCoupon.code)
  return [nextCoupon, ...deduped].slice(0, maxCoupons)
}

export function toggleCouponByCode(coupons: CampaignCoupon[], code: string) {
  return coupons.map((item) => (
    item.code === code
      ? {
          ...item,
          active: !item.active,
        }
      : item
  ))
}

export function removeCouponByCode(coupons: CampaignCoupon[], code: string) {
  return coupons.filter((item) => item.code !== code)
}

export function formatCouponValue(coupon: CampaignCoupon) {
  if (coupon.discountType === 'percent') {
    return `${coupon.discountValue.toFixed(2).replace(/\.00$/, '')}%`
  }

  return formatCurrency(coupon.discountValue)
}
