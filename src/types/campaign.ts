export type CampaignStatus = 'active' | 'scheduled' | 'paused' | 'finished'
export type CampaignCouponDiscountType = 'percent' | 'fixed'

export type CampaignCoupon = {
  code: string
  discountType: CampaignCouponDiscountType
  discountValue: number
  active: boolean
  createdAt: string
}

export type CampaignPackPrice = {
  quantity: number
  price: number
  active: boolean
}

export type CampaignFeaturedPromotion = {
  active: boolean
  targetQuantity: number
  discountType: CampaignCouponDiscountType
  discountValue: number
  label: string
}

export type CampaignHeroCarouselMedia = {
  id: string
  url: string
  storagePath: string | null
  alt: string
  order: number
  active: boolean
  createdAt: string
}

export type CampaignFeaturedVideoMedia = {
  id: string
  url: string
  storagePath: string | null
  active: boolean
  createdAt: string
}

export type CampaignMidias = {
  heroCarousel: CampaignHeroCarouselMedia[]
  featuredVideo: CampaignFeaturedVideoMedia | null
}

export type CampaignSettings = {
  id: string
  title: string
  pricePerCota: number
  minPurchaseQuantity: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  totalNumbers: number
  additionalPrizes: string[]
  supportWhatsappNumber: string
  whatsappContactMessage?: string
  status: CampaignStatus
  startsAt: string | null
  startsAtTime: string | null
  endsAt: string | null
  endsAtTime: string | null
  packPrices: CampaignPackPrice[]
  featuredPromotion: CampaignFeaturedPromotion | null
  coupons: CampaignCoupon[]
  midias: CampaignMidias
}

export type UpsertCampaignSettingsInput = {
  title?: string
  pricePerCota?: number
  minPurchaseQuantity?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
  totalNumbers?: number
  additionalPrizes?: string[]
  supportWhatsappNumber?: string
  whatsappContactMessage?: string
  status?: CampaignStatus
  startsAt?: string | null
  startsAtTime?: string | null
  endsAt?: string | null
  endsAtTime?: string | null
  packPrices?: CampaignPackPrice[]
  featuredPromotion?: CampaignFeaturedPromotion | null
  coupons?: CampaignCoupon[]
  midias?: CampaignMidias
}

export type UpsertCampaignSettingsOutput = {
  campaignId: string
  title: string
  pricePerCota: number
  minPurchaseQuantity: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  totalNumbers: number
  additionalPrizes: string[]
  supportWhatsappNumber: string
  whatsappContactMessage?: string
  status: CampaignStatus
  startsAt: string | null
  startsAtTime: string | null
  endsAt: string | null
  endsAtTime: string | null
  packPrices: CampaignPackPrice[]
  featuredPromotion: CampaignFeaturedPromotion | null
  coupons: CampaignCoupon[]
  midias: CampaignMidias
}
