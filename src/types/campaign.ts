export type CampaignStatus = 'active' | 'scheduled' | 'paused' | 'finished'
export type CampaignCouponDiscountType = 'percent' | 'fixed'

export type CampaignCoupon = {
  code: string
  discountType: CampaignCouponDiscountType
  discountValue: number
  active: boolean
  createdAt: string
}

export type CampaignSettings = {
  id: string
  title: string
  pricePerCota: number
  minPurchaseQuantity: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string | null
  endsAt: string | null
  coupons: CampaignCoupon[]
}

export type UpsertCampaignSettingsInput = {
  title?: string
  pricePerCota?: number
  minPurchaseQuantity?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
  status?: CampaignStatus
  startsAt?: string | null
  endsAt?: string | null
  coupons?: CampaignCoupon[]
}

export type UpsertCampaignSettingsOutput = {
  campaignId: string
  title: string
  pricePerCota: number
  minPurchaseQuantity: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string | null
  endsAt: string | null
  coupons: CampaignCoupon[]
}
