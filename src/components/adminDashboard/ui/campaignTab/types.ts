import type { Dispatch, SetStateAction } from 'react'
import type {
  CampaignAdditionalPrize,
  CampaignCoupon,
  CampaignCouponDiscountType,
  CampaignFeaturedPromotion,
  CampaignFeaturedVideoMedia,
  CampaignHeroCarouselMedia,
  CampaignPackPrice,
  CampaignSettings,
} from '../../../../types/campaign'

export type PromotionDiscountTypeOption = {
  value: CampaignCouponDiscountType
  label: string
}

export type WeekdaySelectOption = {
  value: string
  label: string
}

export type CampaignTabHeaderProps = {
  campaign: CampaignSettings
  scheduleStatusLabel: string
  scheduleStatusColorClassName: string
  activeCoupons: number
  isRefreshingWeeklyRanking: boolean
  isLoading: boolean
  onRefreshWeeklyRanking: () => void
}

export type CampaignPreviewCardProps = {
  title: string
  totalNumbersInput: string
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  bonusPrizeQuantityInput: string
  additionalPrizes: CampaignAdditionalPrize[]
}

export type CommercialRulesController = {
  pricePerCotaInput: string
  setPricePerCotaInput: (value: string) => void
  promotionDrafts: CampaignFeaturedPromotion[]
  promotionDiscountTypeOptions: readonly PromotionDiscountTypeOption[]
  packPrices: CampaignPackPrice[]
  activePackPrices: number
  safePricePerCota: number
  handlePackQuantityInputChange: (packIndex: number, rawValue: string) => void
  handlePackPriceActiveToggle: (packIndex: number) => void
  handleToggleMostPurchasedTag: (packIndex: number) => void
  handlePromotionMinimumQuantityChange: (index: number, rawValue: string) => void
  handlePromotionDiscountTypeChange: (index: number, nextDiscountType: CampaignCouponDiscountType) => void
  handlePromotionDiscountInputChange: (index: number, rawValue: string) => void
  handleAddPromotion: () => void
  handleRemovePromotion: (index: number) => void
}

export type CommercialRulesSectionProps = {
  controller: CommercialRulesController
}

export type GeneralSettingsController = {
  title: string
  setTitle: (value: string) => void
  startsAt: string
  setStartsAt: (value: string) => void
  startsAtTime: string
  setStartsAtTime: (value: string) => void
  endsAt: string
  setEndsAt: (value: string) => void
  endsAtTime: string
  setEndsAtTime: (value: string) => void
  minEndTime?: string
  isEndOnSameDayAsStart: boolean
  supportWhatsappNumber: string
  setSupportWhatsappNumber: (value: string) => void
  whatsappContactMessage: string
  setWhatsappContactMessage: (value: string) => void
  applyPhoneMask: (value: string) => string
  topBuyersRankingLimitInput: string
  setTopBuyersRankingLimitInput: (value: string) => void
  topBuyersScheduleDraft: {
    dayOfWeek: number
    drawTime: string
  }
  topBuyersWeekdaySelectOptions: WeekdaySelectOption[]
  setTopBuyersDrawDayOfWeek: (value: number) => void
  setTopBuyersDrawTime: (value: string) => void
  topBuyersNextDrawWeekId: string
  isSkippingTopBuyersWeek: boolean
  setTopBuyersSkipWeekId: (value: string) => void
  topBuyersNextDrawAtMs: number
  topBuyersNextFreezeAtMs: number
}

export type GeneralSettingsSectionProps = {
  controller: GeneralSettingsController
}

export type PrizesController = {
  totalNumbersInput: string
  setTotalNumbersInput: (value: string) => void
  mainPrize: string
  setMainPrize: (value: string) => void
  secondPrize: string
  setSecondPrize: (value: string) => void
  bonusPrize: string
  setBonusPrize: (value: string) => void
  bonusPrizeQuantityInput: string
  setBonusPrizeQuantityInput: (value: string) => void
  additionalPrizes: CampaignAdditionalPrize[]
  setAdditionalPrizes: Dispatch<SetStateAction<CampaignAdditionalPrize[]>>
}

export type PrizesSectionProps = {
  controller: PrizesController
}

export type MediaController = {
  featuredVideo: CampaignFeaturedVideoMedia | null
  activeHeroSlides: number
  selectedFeaturedVideoFile: File | null
  setSelectedFeaturedVideoFile: Dispatch<SetStateAction<File | null>>
  isUploadingFeaturedVideo: boolean
  isRemovingFeaturedVideo: boolean
  isFeaturedVideoBusy: boolean
  handleUploadFeaturedVideo: () => Promise<void>
  handleRemoveFeaturedVideo: () => Promise<void>
  handleCopyFeaturedVideoUrl: (url: string, mediaId: string) => Promise<void>
  selectedHeroFile: File | null
  setSelectedHeroFile: Dispatch<SetStateAction<File | null>>
  heroAltInput: string
  setHeroAltInput: (value: string) => void
  isUploadingHeroMedia: boolean
  heroMediaActionId: string | null
  isHeroAtLimit: boolean
  heroCarouselItems: CampaignHeroCarouselMedia[]
  handleUploadHeroMedia: () => Promise<void>
  handleMoveHeroMedia: (id: string, direction: -1 | 1) => Promise<void>
  handleEditHeroMediaAlt: (media: CampaignHeroCarouselMedia) => Promise<void>
  handleToggleHeroMedia: (id: string) => Promise<void>
  handleCopyMediaUrl: (url: string, mediaId: string) => Promise<void>
  handleRemoveHeroMedia: (media: CampaignHeroCarouselMedia) => Promise<void>
}

export type MediaSectionProps = {
  controller: MediaController
}

export type CouponController = {
  coupons: CampaignCoupon[]
  isCouponCreatorOpen: boolean
  setIsCouponCreatorOpen: Dispatch<SetStateAction<boolean>>
  couponCodeMode: 'manual' | 'auto'
  setCouponCodeMode: (value: 'manual' | 'auto') => void
  couponCodeInput: string
  setCouponCodeInput: (value: string) => void
  couponDiscountType: CampaignCouponDiscountType
  setCouponDiscountType: Dispatch<SetStateAction<CampaignCouponDiscountType>>
  couponValueInput: string
  setCouponValueInput: (value: string) => void
  couponAction: { code: string; type: 'toggle' | 'remove' } | null
  canAddCoupon: boolean
  handleGenerateCouponCode: () => void
  handleAddCoupon: () => Promise<void>
  handleToggleCoupon: (code: string) => Promise<void>
  handleRemoveCoupon: (code: string) => Promise<void>
}

export type CouponSectionProps = {
  controller: CouponController
}

export type CampaignSaveFooterProps = {
  hasCampaignChanges: boolean
  isLoading: boolean
  isSaving: boolean
  saveButtonLabel: string
  onSaveCampaignSettings: () => Promise<void>
}
