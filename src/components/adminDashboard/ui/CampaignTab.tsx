import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'react-toastify'
import {
  CAMPAIGN_PACK_QUANTITIES,
  DEFAULT_MAIN_PRIZE,
} from '../../../const/campaign'
import { MAX_QUANTITY } from '../../../const/purchaseNumbers'
import type {
  CampaignFeaturedPromotion,
  CampaignCouponDiscountType,
} from '../../../types/campaign'
import { useCampaignForm } from '../hooks/useCampaignForm'
import { useCouponManager } from '../hooks/useCouponManager'
import { useFeaturedVideoManager } from '../hooks/useFeaturedVideoManager'
import { useHeroMediaManager } from '../hooks/useHeroMediaManager'
import { buildCampaignSettingsInput } from '../services/campaignSettingsFormService'
import { getScheduleStatusLabel, resolveCampaignScheduleStatus } from '../../../utils/campaignSchedule'
import { functions } from '../../../lib/firebase'
import {
  normalizeTopBuyersWeeklySchedule,
  resolveFreezeAtMs,
  resolveNextDrawAtMs,
  resolveWeekIdFromDrawAtMs,
} from '../../../utils/topBuyersSchedule'
import {
  normalizeCouponDiscountValue,
} from './campaignTab/domain/couponDomain'
import { resolveFeaturedVideo } from './campaignTab/domain/featuredVideoDomain'
import { normalizeHeroCarouselOrder } from './campaignTab/domain/heroMediaDomain'
import {
  isEndOnSameDayAsStart,
  resolveMinEndTime,
  shouldClearSkipWeekId,
} from './campaignTab/domain/scheduleDomain'
import CampaignPreviewCard from './campaignTab/CampaignPreviewCard'
import CampaignSaveFooter from './campaignTab/CampaignSaveFooter'
import CampaignTabHeader from './campaignTab/CampaignTabHeader'
import CommercialRulesSection from './campaignTab/CommercialRulesSection'
import CouponSection from './campaignTab/CouponSection'
import GeneralSettingsSection from './campaignTab/GeneralSettingsSection'
import MediaSection from './campaignTab/MediaSection'
import PrizesSection from './campaignTab/PrizesSection'
import { parseErrorMessage } from './campaignTab/utils/errorUtils'

type RefreshWeeklyTopBuyersRankingCacheOutput = {
  updatedAtMs?: number
  weekId?: string
  sourceDrawDate?: string | null
  items?: unknown[]
}

type CallableEnvelope<T> = T | { result?: T }

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length === 0) return '+55'
  if (digits.length <= 2) return `+${digits}`
  if (digits.length <= 4) return `+${digits.slice(0, 2)}(${digits.slice(2)}`
  if (digits.length <= 9) return `+${digits.slice(0, 2)}(${digits.slice(2, 4)})${digits.slice(4)}`
  if (digits.length <= 13) return `+${digits.slice(0, 2)}(${digits.slice(2, 4)})${digits.slice(4, 9)}-${digits.slice(9)}`
  return `+${digits.slice(0, 2)}(${digits.slice(2, 4)})${digits.slice(4, 9)}-${digits.slice(9, 13)}`
}

function createDefaultFeaturedPromotion(targetQuantity: number): CampaignFeaturedPromotion {
  return {
    active: true,
    targetQuantity,
    discountType: 'percent',
    discountValue: 0,
    label: 'Mais compradas',
  }
}

export default function CampaignTab() {
  const {
    campaign,
    isLoading,
    isSaving,
    title,
    pricePerCotaInput,
    mainPrize,
    secondPrize,
    bonusPrize,
    bonusPrizeQuantityInput,
    totalNumbersInput,
    additionalPrizes,
    supportWhatsappNumber,
    whatsappContactMessage,
    startsAt,
    startsAtTime,
    endsAt,
    endsAtTime,
    packPrices,
    featuredPromotions,
    coupons,
    midias,
    topBuyersDrawDayOfWeek,
    topBuyersDrawTime,
    topBuyersSkipWeekId,
    topBuyersRankingLimitInput,
    setTitle,
    setPricePerCotaInput,
    setMainPrize,
    setSecondPrize,
    setBonusPrize,
    setBonusPrizeQuantityInput,
    setTotalNumbersInput,
    setAdditionalPrizes,
    setSupportWhatsappNumber,
    setWhatsappContactMessage,
    setStartsAt,
    setStartsAtTime,
    setEndsAt,
    setEndsAtTime,
    setPackPrices,
    setFeaturedPromotions,
    setMidias,
    setTopBuyersDrawDayOfWeek,
    setTopBuyersDrawTime,
    setTopBuyersSkipWeekId,
    setTopBuyersRankingLimitInput,
    handleSaveCampaignSettings,
    persistCoupons,
    persistMidias,
  } = useCampaignForm()

  const [isRefreshingWeeklyRanking, setIsRefreshingWeeklyRanking] = useState(false)

  const refreshWeeklyRankingCallable = useMemo(
    () => httpsCallable<{ forceRebuild?: boolean }, unknown>(
      functions,
      'refreshWeeklyTopBuyersRankingCache',
    ),
    [],
  )

  const activeCoupons = useMemo(() => coupons.filter((item) => item.active).length, [coupons])
  const activePackPrices = useMemo(() => packPrices.filter((item) => item.active).length, [packPrices])
  const promotionDiscountTypeOptions = useMemo(
    () => [
      { value: 'percent', label: 'Percentual (%)' },
      { value: 'fixed', label: 'Valor fixo (R$)' },
    ] as const,
    [],
  )
  const topBuyersWeekdaySelectOptions = useMemo(
    () => [
      { value: '0', label: 'Domingo' },
      { value: '1', label: 'Segunda-feira' },
      { value: '2', label: 'Terça-feira' },
      { value: '3', label: 'Quarta-feira' },
      { value: '4', label: 'Quinta-feira' },
      { value: '5', label: 'Sexta-feira' },
      { value: '6', label: 'Sábado' },
    ],
    [],
  )
  const heroCarouselItems = useMemo(
    () => normalizeHeroCarouselOrder(midias.heroCarousel),
    [midias.heroCarousel],
  )
  const currentPrizeAlt = useMemo(
    () => (mainPrize.trim() || DEFAULT_MAIN_PRIZE).slice(0, 140),
    [mainPrize],
  )
  const activeHeroSlides = useMemo(
    () => heroCarouselItems.filter((item) => item.active).length,
    [heroCarouselItems],
  )
  const featuredVideo = useMemo(
    () => resolveFeaturedVideo(midias.featuredVideo),
    [midias.featuredVideo],
  )
  const normalizedCurrentCampaignPayload = useMemo(() => (
    buildCampaignSettingsInput({
      title,
      pricePerCotaInput,
      mainPrize,
      secondPrize,
      bonusPrize,
      bonusPrizeQuantityInput,
      totalNumbersInput,
      additionalPrizes,
      supportWhatsappNumber,
      whatsappContactMessage,
      startsAt,
      startsAtTime,
      endsAt,
      endsAtTime,
      packPrices,
      featuredPromotions,
      coupons,
      midias,
      topBuyersDrawDayOfWeek,
      topBuyersDrawTime,
      topBuyersSkipWeekId,
      topBuyersRankingLimitInput,
    }).payload
  ), [
    additionalPrizes,
    bonusPrize,
    bonusPrizeQuantityInput,
    coupons,
    endsAt,
    mainPrize,
    midias,
    pricePerCotaInput,
    secondPrize,
    startsAt,
    startsAtTime,
    packPrices,
    featuredPromotions,
    supportWhatsappNumber,
    topBuyersDrawDayOfWeek,
    topBuyersDrawTime,
    topBuyersSkipWeekId,
    topBuyersRankingLimitInput,
    whatsappContactMessage,
    title,
    totalNumbersInput,
    endsAtTime,
  ])
  const normalizedBaseCampaignPayload = useMemo(() => (
    buildCampaignSettingsInput({
      title: campaign.title,
      pricePerCotaInput: campaign.pricePerCota.toFixed(2),
      mainPrize: campaign.mainPrize,
      secondPrize: campaign.secondPrize,
      bonusPrize: campaign.bonusPrize,
      bonusPrizeQuantityInput: String(campaign.bonusPrizeQuantity),
      totalNumbersInput: String(campaign.totalNumbers),
      additionalPrizes: campaign.additionalPrizes,
      supportWhatsappNumber: campaign.supportWhatsappNumber,
      whatsappContactMessage: campaign.whatsappContactMessage ?? '',
      startsAt: campaign.startsAt ?? '',
      startsAtTime: campaign.startsAtTime ?? '',
      endsAt: campaign.endsAt ?? '',
      endsAtTime: campaign.endsAtTime ?? '',
      packPrices: campaign.packPrices,
      featuredPromotions: campaign.featuredPromotions,
      coupons: campaign.coupons,
      midias: campaign.midias,
      topBuyersDrawDayOfWeek: campaign.topBuyersWeeklySchedule.dayOfWeek,
      topBuyersDrawTime: campaign.topBuyersWeeklySchedule.drawTime,
      topBuyersSkipWeekId: campaign.topBuyersWeeklySchedule.skipWeekId ?? '',
      topBuyersRankingLimitInput: String(campaign.topBuyersRankingLimit),
    }).payload
  ), [
    campaign.additionalPrizes,
    campaign.bonusPrize,
    campaign.bonusPrizeQuantity,
    campaign.coupons,
    campaign.endsAt,
    campaign.mainPrize,
    campaign.midias,
    campaign.packPrices,
    campaign.featuredPromotions,
    campaign.pricePerCota,
    campaign.secondPrize,
    campaign.startsAt,
    campaign.startsAtTime,
    campaign.supportWhatsappNumber,
    campaign.topBuyersWeeklySchedule.dayOfWeek,
    campaign.topBuyersWeeklySchedule.drawTime,
    campaign.topBuyersWeeklySchedule.skipWeekId,
    campaign.topBuyersRankingLimit,
    campaign.whatsappContactMessage,
    campaign.title,
    campaign.totalNumbers,
    campaign.endsAtTime,
  ])
  const hasCampaignChanges = useMemo(() => {
    if (!normalizedCurrentCampaignPayload || !normalizedBaseCampaignPayload) {
      return true
    }

    return JSON.stringify(normalizedCurrentCampaignPayload) !== JSON.stringify(normalizedBaseCampaignPayload)
  }, [normalizedBaseCampaignPayload, normalizedCurrentCampaignPayload])
  const saveButtonLabel = isSaving
    ? 'Salvando...'
    : hasCampaignChanges
      ? 'Salvar campanha'
      : 'Sem alteracoes'
  const scheduleStatus = useMemo(
    () =>
      resolveCampaignScheduleStatus({
        startsAt: startsAt || null,
        startsAtTime: startsAtTime || null,
        endsAt: endsAt || null,
        endsAtTime: endsAtTime || null,
      }),
    [endsAt, endsAtTime, startsAt, startsAtTime],
  )
  const scheduleStatusColorClassName = scheduleStatus === 'finished'
    ? 'text-red-300'
    : scheduleStatus === 'scheduled'
      ? 'text-amber-200'
      : 'text-emerald-300'
  const isEndSameDay = isEndOnSameDayAsStart(startsAt, endsAt)
  const minEndTime = resolveMinEndTime({
    startsAt,
    endsAt,
    startsAtTime,
  })
  const safePricePerCota = useMemo(() => {
    const parsed = Number(pricePerCotaInput.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : campaign.pricePerCota
  }, [campaign.pricePerCota, pricePerCotaInput])
  const defaultPromotionQuantity = CAMPAIGN_PACK_QUANTITIES[2] ?? CAMPAIGN_PACK_QUANTITIES[0]
  const promotionDrafts = useMemo(() => (
    featuredPromotions.map((promotion) => {
      const targetQuantity = Number.isInteger(promotion.targetQuantity) && promotion.targetQuantity > 0
        ? Math.min(promotion.targetQuantity, MAX_QUANTITY)
        : defaultPromotionQuantity
      const discountType: CampaignCouponDiscountType = promotion.discountType === 'fixed' ? 'fixed' : 'percent'
      const rawDiscount = Number(promotion.discountValue)
      const discountValue = Number.isFinite(rawDiscount) && rawDiscount >= 0
        ? normalizeCouponDiscountValue(discountType, rawDiscount)
        : 0

      return {
        ...promotion,
        active: promotion.active !== false,
        targetQuantity,
        discountType,
        discountValue,
        label: 'Mais compradas',
      }
    })
  ), [defaultPromotionQuantity, featuredPromotions])
  const topBuyersScheduleDraft = useMemo(
    () => normalizeTopBuyersWeeklySchedule({
      dayOfWeek: topBuyersDrawDayOfWeek,
      drawTime: topBuyersDrawTime,
    }),
    [topBuyersDrawDayOfWeek, topBuyersDrawTime],
  )
  const topBuyersNextDrawAtMs = useMemo(
    () => resolveNextDrawAtMs(topBuyersScheduleDraft),
    [topBuyersScheduleDraft],
  )
  const topBuyersNextFreezeAtMs = useMemo(
    () => resolveFreezeAtMs(topBuyersNextDrawAtMs),
    [topBuyersNextDrawAtMs],
  )
  const topBuyersNextDrawWeekId = useMemo(
    () => resolveWeekIdFromDrawAtMs(topBuyersNextDrawAtMs, topBuyersScheduleDraft),
    [topBuyersNextDrawAtMs, topBuyersScheduleDraft],
  )
  const isSkippingTopBuyersWeek = useMemo(
    () => Boolean(topBuyersSkipWeekId && topBuyersSkipWeekId === topBuyersNextDrawWeekId),
    [topBuyersNextDrawWeekId, topBuyersSkipWeekId],
  )

  useEffect(() => {
    if (!shouldClearSkipWeekId(topBuyersSkipWeekId, topBuyersNextDrawWeekId)) {
      return
    }

    setTopBuyersSkipWeekId('')
  }, [setTopBuyersSkipWeekId, topBuyersNextDrawWeekId, topBuyersSkipWeekId])

  const handlePackQuantityInputChange = (packIndex: number, rawValue: string) => {
    const parsed = Number(rawValue.replace(/[^0-9]/g, ''))

    setPackPrices((current) => current.map((item, index) => (
      index === packIndex
        ? {
            ...item,
            quantity: Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_QUANTITY) : item.quantity,
          }
        : item
    )))
  }

  const handlePackPriceActiveToggle = (packIndex: number) => {
    setPackPrices((current) => current.map((item, index) => (
      index === packIndex
        ? {
            ...item,
            active: !item.active,
          }
        : item
    )))
  }

  const handleToggleMostPurchasedTag = (packIndex: number) => {
    setPackPrices((current) => {
      const selectedPack = current[packIndex]
      const isActive = selectedPack?.mostPurchasedTag !== true

      if (!isActive) {
        return current.map((item, index) => (
          index === packIndex
            ? {
                ...item,
                mostPurchasedTag: false,
              }
            : item
        ))
      }

      return current.map((item, index) => ({
        ...item,
        mostPurchasedTag: index === packIndex,
      }))
    })
  }

  const handlePromotionMinimumQuantityChange = (index: number, rawValue: string) => {
    const parsed = Number(rawValue.replace(/[^0-9]/g, ''))

    setFeaturedPromotions((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item
      }

      const base = item || createDefaultFeaturedPromotion(defaultPromotionQuantity)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return {
          ...base,
          active: true,
          label: 'Mais compradas',
        }
      }

      return {
        ...base,
        active: true,
        targetQuantity: Math.min(parsed, MAX_QUANTITY),
        label: 'Mais compradas',
      }
    }))
  }

  const handlePromotionDiscountTypeChange = (index: number, nextDiscountType: CampaignCouponDiscountType) => {
    setFeaturedPromotions((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item
      }

      const base = item || createDefaultFeaturedPromotion(defaultPromotionQuantity)
      const normalizedValue = normalizeCouponDiscountValue(nextDiscountType, base.discountValue)

      return {
        ...base,
        active: true,
        discountType: nextDiscountType,
        discountValue: normalizedValue,
        label: 'Mais compradas',
      }
    }))
  }

  const handlePromotionDiscountInputChange = (index: number, rawValue: string) => {
    const parsed = Number(rawValue.replace(',', '.'))

    setFeaturedPromotions((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item
      }

      const base = item || createDefaultFeaturedPromotion(defaultPromotionQuantity)
      const normalizedValue = Number.isFinite(parsed) && parsed >= 0
        ? normalizeCouponDiscountValue(base.discountType, parsed)
        : 0
      return {
        ...base,
        active: true,
        discountValue: normalizedValue,
        label: 'Mais compradas',
      }
    }))
  }

  const handleAddPromotion = () => {
    setFeaturedPromotions((current) => {
      const maxTarget = current.reduce<number>(
        (max, item) => Math.max(max, item.targetQuantity || 0),
        Number(defaultPromotionQuantity),
      )
      return [
        ...current,
        {
          active: true,
          targetQuantity: Math.min(maxTarget + 100, MAX_QUANTITY),
          discountType: 'percent',
          discountValue: 5,
          label: 'Mais compradas',
        },
      ]
    })
  }

  const handleRemovePromotion = (index: number) => {
    setFeaturedPromotions((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const couponController = useCouponManager({
    coupons,
    persistCoupons,
  })

  const heroMediaController = useHeroMediaManager({
    campaignId: campaign.id,
    midias,
    setMidias,
    heroCarouselItems,
    currentPrizeAlt,
    persistMidias,
  })

  const featuredVideoController = useFeaturedVideoManager({
    campaignId: campaign.id,
    midias,
    setMidias,
    featuredVideo,
    persistMidias,
  })

  const handleRefreshWeeklyRanking = async () => {
    setIsRefreshingWeeklyRanking(true)

    try {
      const response = await refreshWeeklyRankingCallable({
        forceRebuild: true,
      })
      const payloadEnvelope = response.data as CallableEnvelope<RefreshWeeklyTopBuyersRankingCacheOutput>
      const payload = payloadEnvelope && typeof payloadEnvelope === 'object' && 'result' in payloadEnvelope
        ? ((payloadEnvelope as { result?: RefreshWeeklyTopBuyersRankingCacheOutput }).result || {})
        : (payloadEnvelope as RefreshWeeklyTopBuyersRankingCacheOutput)
      const weekId = typeof payload.weekId === 'string' ? payload.weekId : '-'
      const sourceDrawDate = typeof payload.sourceDrawDate === 'string' ? payload.sourceDrawDate : null
      const itemsCount = Array.isArray(payload.items) ? payload.items.length : 0
      const sourceLabel = sourceDrawDate ? ` | draw: ${sourceDrawDate}` : ''

      toast.success(`Ranking semanal atualizado (${itemsCount} posições) | semana: ${weekId}${sourceLabel}`, {
        toastId: 'campaign-refresh-weekly-ranking-success',
      })
    } catch (error) {
      toast.error(parseErrorMessage(error, 'Falha ao atualizar ranking semanal manualmente.'), {
        toastId: 'campaign-refresh-weekly-ranking-error',
      })
    } finally {
      setIsRefreshingWeeklyRanking(false)
    }
  }

  const commercialRulesController = {
    pricePerCotaInput,
    setPricePerCotaInput,
    promotionDrafts,
    promotionDiscountTypeOptions,
    packPrices,
    activePackPrices,
    safePricePerCota,
    handlePackQuantityInputChange,
    handlePackPriceActiveToggle,
    handleToggleMostPurchasedTag,
    handlePromotionMinimumQuantityChange,
    handlePromotionDiscountTypeChange,
    handlePromotionDiscountInputChange,
    handleAddPromotion,
    handleRemovePromotion,
  }

  const generalSettingsController = {
    title,
    setTitle,
    startsAt,
    setStartsAt,
    startsAtTime,
    setStartsAtTime,
    endsAt,
    setEndsAt,
    endsAtTime,
    setEndsAtTime,
    minEndTime,
    isEndOnSameDayAsStart: isEndSameDay,
    supportWhatsappNumber,
    setSupportWhatsappNumber,
    whatsappContactMessage,
    setWhatsappContactMessage,
    applyPhoneMask,
    topBuyersRankingLimitInput,
    setTopBuyersRankingLimitInput,
    topBuyersScheduleDraft,
    topBuyersWeekdaySelectOptions,
    setTopBuyersDrawDayOfWeek,
    setTopBuyersDrawTime,
    topBuyersNextDrawWeekId,
    isSkippingTopBuyersWeek,
    setTopBuyersSkipWeekId,
    topBuyersNextDrawAtMs,
    topBuyersNextFreezeAtMs,
  }

  const prizesController = {
    totalNumbersInput,
    setTotalNumbersInput,
    mainPrize,
    setMainPrize,
    secondPrize,
    setSecondPrize,
    bonusPrize,
    setBonusPrize,
    bonusPrizeQuantityInput,
    setBonusPrizeQuantityInput,
    additionalPrizes,
    setAdditionalPrizes,
  }

  const mediaController = {
    featuredVideo,
    activeHeroSlides,
    selectedFeaturedVideoFile: featuredVideoController.selectedFeaturedVideoFile,
    setSelectedFeaturedVideoFile: featuredVideoController.setSelectedFeaturedVideoFile,
    isUploadingFeaturedVideo: featuredVideoController.isUploadingFeaturedVideo,
    isRemovingFeaturedVideo: featuredVideoController.isRemovingFeaturedVideo,
    isFeaturedVideoBusy: featuredVideoController.isFeaturedVideoBusy,
    handleUploadFeaturedVideo: featuredVideoController.handleUploadFeaturedVideo,
    handleRemoveFeaturedVideo: featuredVideoController.handleRemoveFeaturedVideo,
    handleCopyFeaturedVideoUrl: featuredVideoController.handleCopyMediaUrl,
    selectedHeroFile: heroMediaController.selectedHeroFile,
    setSelectedHeroFile: heroMediaController.setSelectedHeroFile,
    heroAltInput: heroMediaController.heroAltInput,
    setHeroAltInput: heroMediaController.setHeroAltInput,
    isUploadingHeroMedia: heroMediaController.isUploadingHeroMedia,
    heroMediaActionId: heroMediaController.heroMediaActionId,
    isHeroAtLimit: heroMediaController.isHeroAtLimit,
    heroCarouselItems,
    handleUploadHeroMedia: heroMediaController.handleUploadHeroMedia,
    handleMoveHeroMedia: heroMediaController.handleMoveHeroMedia,
    handleEditHeroMediaAlt: heroMediaController.handleEditHeroMediaAlt,
    handleToggleHeroMedia: heroMediaController.handleToggleHeroMedia,
    handleCopyMediaUrl: heroMediaController.handleCopyMediaUrl,
    handleRemoveHeroMedia: heroMediaController.handleRemoveHeroMedia,
  }

  return (
    <section className="space-y-6 pb-28" data-testid="campaign-tab-root">
      <CampaignTabHeader
        campaign={campaign}
        scheduleStatusLabel={getScheduleStatusLabel(scheduleStatus)}
        scheduleStatusColorClassName={scheduleStatusColorClassName}
        activeCoupons={activeCoupons}
        isRefreshingWeeklyRanking={isRefreshingWeeklyRanking}
        isLoading={isLoading}
        onRefreshWeeklyRanking={handleRefreshWeeklyRanking}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-5 xl:flex xl:h-full xl:flex-col xl:gap-5 xl:space-y-0">
          <CampaignPreviewCard
            title={title}
            totalNumbersInput={totalNumbersInput}
            mainPrize={mainPrize}
            secondPrize={secondPrize}
            bonusPrize={bonusPrize}
            bonusPrizeQuantityInput={bonusPrizeQuantityInput}
            additionalPrizes={additionalPrizes}
          />
          <CommercialRulesSection controller={commercialRulesController} />
        </div>

        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="grid grid-cols-1 gap-4">
            <GeneralSettingsSection controller={generalSettingsController} />
            <PrizesSection controller={prizesController} />
          </div>
        </article>
      </div>

      <MediaSection controller={mediaController} />
      <CouponSection controller={couponController} />
      <CampaignSaveFooter
        hasCampaignChanges={hasCampaignChanges}
        isLoading={isLoading}
        isSaving={isSaving}
        saveButtonLabel={saveButtonLabel}
        onSaveCampaignSettings={handleSaveCampaignSettings}
      />
    </section>
  )
}
