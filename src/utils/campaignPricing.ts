import type {
  CampaignCoupon,
  CampaignFeaturedPromotion,
  CampaignPackPrice,
  CampaignSettings,
} from '../types/campaign'

type PricingCampaignConfig = Pick<CampaignSettings, 'pricePerCota' | 'packPrices' | 'featuredPromotions'>

export type CampaignPricingBreakdown = {
  quantity: number
  matchedPack: CampaignPackPrice | null
  subtotalBase: number
  promotionDiscount: number
  subtotalAfterPromotion: number
  couponDiscount: number
  total: number
  appliedPromotion: CampaignFeaturedPromotion | null
}

function toMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Number(value.toFixed(2))
}

function calculateCouponDiscount(subtotal: number, coupon: CampaignCoupon | null) {
  if (!coupon || subtotal <= 0) {
    return 0
  }

  if (coupon.discountType === 'percent') {
    return Number(Math.min(subtotal, subtotal * (coupon.discountValue / 100)).toFixed(2))
  }

  return Number(Math.min(subtotal, coupon.discountValue).toFixed(2))
}

function calculatePromotionDiscount(
  subtotalBase: number,
  quantity: number,
  promotions: CampaignFeaturedPromotion[],
) {
  if (!Array.isArray(promotions) || promotions.length === 0 || subtotalBase <= 0) {
    return { discount: 0, promotion: null as CampaignFeaturedPromotion | null }
  }

  const candidates = promotions.filter(
    (promotion) =>
      promotion.active
      && promotion.discountValue > 0
      && quantity >= promotion.targetQuantity,
  )
  if (candidates.length === 0) {
    return { discount: 0, promotion: null }
  }

  const bestPromotion = [...candidates].sort((left, right) => {
    if (right.targetQuantity !== left.targetQuantity) {
      return right.targetQuantity - left.targetQuantity
    }

    if (right.discountValue !== left.discountValue) {
      return right.discountValue - left.discountValue
    }

    return 0
  })[0]

  if (!bestPromotion) {
    return { discount: 0, promotion: null }
  }

  const discount = bestPromotion.discountType === 'percent'
    ? Number(Math.min(subtotalBase, subtotalBase * (bestPromotion.discountValue / 100)).toFixed(2))
    : Number(Math.min(subtotalBase, bestPromotion.discountValue).toFixed(2))

  return {
    discount,
    promotion: bestPromotion,
  }
}

export function resolveCouponByCode(coupons: CampaignCoupon[], rawCode: string | null | undefined) {
  const normalized = `${rawCode ?? ''}`
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24)

  if (!normalized) {
    return null
  }

  return coupons.find((coupon) => coupon.active && coupon.code === normalized) || null
}

export function calculateCampaignPricing(
  quantity: number,
  campaign: PricingCampaignConfig,
  coupon: CampaignCoupon | null = null,
): CampaignPricingBreakdown {
  const safeQuantity = Math.max(0, Math.floor(quantity))
  const matchedPack = campaign.packPrices.find((pack) => pack.active && pack.quantity === safeQuantity) || null
  const subtotalBase = matchedPack
    ? toMoney(matchedPack.price)
    : toMoney(safeQuantity * campaign.pricePerCota)
  const promotionResult = calculatePromotionDiscount(subtotalBase, safeQuantity, campaign.featuredPromotions)
  const promotionDiscount = promotionResult.discount
  const subtotalAfterPromotion = toMoney(Math.max(subtotalBase - promotionDiscount, 0))
  const couponDiscount = calculateCouponDiscount(subtotalAfterPromotion, coupon)
  const total = toMoney(Math.max(subtotalAfterPromotion - couponDiscount, 0))

  return {
    quantity: safeQuantity,
    matchedPack,
    subtotalBase,
    promotionDiscount,
    subtotalAfterPromotion,
    couponDiscount,
    total,
    appliedPromotion: promotionResult.promotion,
  }
}
