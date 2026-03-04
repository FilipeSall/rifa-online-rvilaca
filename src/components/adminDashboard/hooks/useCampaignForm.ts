import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import {
  DEFAULT_ADDITIONAL_PRIZES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_BONUS_PRIZE_QUANTITY,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_SUPPORT_WHATSAPP_NUMBER,
  DEFAULT_TICKET_PRICE,
  DEFAULT_TOP_BUYERS_DRAW_DAY_OF_WEEK,
  DEFAULT_TOP_BUYERS_DRAW_TIME,
  DEFAULT_TOP_BUYERS_RANKING_LIMIT,
  DEFAULT_TOTAL_NUMBERS,
  buildDefaultCampaignPackPrices,
} from '../../../const/campaign'
import { useCampaignSettings } from '../../../hooks/useCampaignSettings'
import type {
  CampaignAdditionalPrize,
  CampaignCoupon,
  CampaignFeaturedPromotion,
  CampaignMidias,
  CampaignPackPrice,
} from '../../../types/campaign'
import { buildCampaignSettingsInput } from '../services/campaignSettingsFormService'

export function useCampaignForm() {
  const {
    campaign,
    exists,
    isLoading,
    isSaving,
    ensureCampaignExists,
    saveCampaignSettings,
  } = useCampaignSettings()
  const [title, setTitle] = useState(DEFAULT_CAMPAIGN_TITLE)
  const [pricePerCotaInput, setPricePerCotaInput] = useState(DEFAULT_TICKET_PRICE.toFixed(2))
  const [mainPrize, setMainPrize] = useState(DEFAULT_MAIN_PRIZE)
  const [secondPrize, setSecondPrize] = useState(DEFAULT_SECOND_PRIZE)
  const [bonusPrize, setBonusPrize] = useState(DEFAULT_BONUS_PRIZE)
  const [bonusPrizeQuantityInput, setBonusPrizeQuantityInput] = useState(String(DEFAULT_BONUS_PRIZE_QUANTITY))
  const [totalNumbersInput, setTotalNumbersInput] = useState(String(DEFAULT_TOTAL_NUMBERS))
  const [additionalPrizes, setAdditionalPrizes] = useState<CampaignAdditionalPrize[]>(DEFAULT_ADDITIONAL_PRIZES)
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState(DEFAULT_SUPPORT_WHATSAPP_NUMBER)
  const [whatsappContactMessage, setWhatsappContactMessage] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [startsAtTime, setStartsAtTime] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [endsAtTime, setEndsAtTime] = useState('')
  const [packPrices, setPackPrices] = useState<CampaignPackPrice[]>(buildDefaultCampaignPackPrices(DEFAULT_TICKET_PRICE))
  const [featuredPromotions, setFeaturedPromotions] = useState<CampaignFeaturedPromotion[]>([])
  const [coupons, setCoupons] = useState<CampaignCoupon[]>([])
  const [midias, setMidias] = useState<CampaignMidias>({ heroCarousel: [], featuredVideo: null })
  const [topBuyersDrawDayOfWeek, setTopBuyersDrawDayOfWeek] = useState<number>(DEFAULT_TOP_BUYERS_DRAW_DAY_OF_WEEK)
  const [topBuyersDrawTime, setTopBuyersDrawTime] = useState<string>(DEFAULT_TOP_BUYERS_DRAW_TIME)
  const [topBuyersSkipWeekId, setTopBuyersSkipWeekId] = useState<string>('')
  const [topBuyersRankingLimitInput, setTopBuyersRankingLimitInput] = useState<string>(String(DEFAULT_TOP_BUYERS_RANKING_LIMIT))
  const hasEnsuredCampaignRef = useRef(false)

  useEffect(() => {
    setTitle(campaign.title)
    setPricePerCotaInput(campaign.pricePerCota.toFixed(2))
    setMainPrize(campaign.mainPrize)
    setSecondPrize(campaign.secondPrize)
    setBonusPrize(campaign.bonusPrize)
    setBonusPrizeQuantityInput(String(campaign.bonusPrizeQuantity))
    setTotalNumbersInput(String(campaign.totalNumbers))
    setAdditionalPrizes(campaign.additionalPrizes)
    setSupportWhatsappNumber(campaign.supportWhatsappNumber)
    setWhatsappContactMessage(campaign.whatsappContactMessage ?? '')
    setStartsAt(campaign.startsAt ?? '')
    setStartsAtTime(campaign.startsAtTime ?? '')
    setEndsAt(campaign.endsAt ?? '')
    setEndsAtTime(campaign.endsAtTime ?? '')
    setPackPrices(campaign.packPrices)
    setFeaturedPromotions(campaign.featuredPromotions)
    setCoupons(campaign.coupons)
    setMidias(campaign.midias)
    setTopBuyersDrawDayOfWeek(campaign.topBuyersWeeklySchedule.dayOfWeek)
    setTopBuyersDrawTime(campaign.topBuyersWeeklySchedule.drawTime)
    setTopBuyersSkipWeekId(campaign.topBuyersWeeklySchedule.skipWeekId ?? '')
    setTopBuyersRankingLimitInput(String(campaign.topBuyersRankingLimit))
  }, [
    campaign.additionalPrizes,
    campaign.bonusPrize,
    campaign.bonusPrizeQuantity,
    campaign.coupons,
    campaign.midias,
    campaign.mainPrize,
    campaign.pricePerCota,
    campaign.secondPrize,
    campaign.totalNumbers,
    campaign.supportWhatsappNumber,
    campaign.whatsappContactMessage,
    campaign.startsAt,
    campaign.startsAtTime,
    campaign.endsAt,
    campaign.endsAtTime,
    campaign.packPrices,
    campaign.featuredPromotions,
    campaign.topBuyersWeeklySchedule.dayOfWeek,
    campaign.topBuyersWeeklySchedule.drawTime,
    campaign.topBuyersWeeklySchedule.skipWeekId,
    campaign.topBuyersRankingLimit,
    campaign.title,
  ])

  useEffect(() => {
    if (isLoading || exists || hasEnsuredCampaignRef.current) {
      return
    }

    hasEnsuredCampaignRef.current = true
    ensureCampaignExists().catch(() => {
      toast.error('Nao foi possivel criar a campanha no banco de dados.', {
        toastId: 'campaign-seed-error',
      })
    })
  }, [ensureCampaignExists, exists, isLoading])

  const handleSaveCampaignSettings = useCallback(async () => {
    const { payload, errorMessage, errorToastId } = buildCampaignSettingsInput({
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
    })

    if (errorMessage || !payload) {
      toast.error(errorMessage ?? 'Nao foi possivel validar os dados da campanha.', {
        toastId: errorToastId ?? 'campaign-validation-error',
      })
      return
    }

    try {
      await saveCampaignSettings(payload)
      toast.success('Campanha e premiacao atualizadas no banco e sincronizadas com o site.', {
        toastId: 'campaign-settings-saved',
      })
    } catch {
      toast.error('Falha ao salvar campanha. Verifique permissao de admin e tente novamente.', {
        toastId: 'campaign-settings-save-error',
      })
    }
  }, [
    additionalPrizes,
    bonusPrize,
    bonusPrizeQuantityInput,
    coupons,
    endsAt,
    mainPrize,
    pricePerCotaInput,
    saveCampaignSettings,
    secondPrize,
    totalNumbersInput,
    supportWhatsappNumber,
    whatsappContactMessage,
    startsAt,
    startsAtTime,
    title,
    endsAtTime,
    packPrices,
    featuredPromotions,
    midias,
    topBuyersDrawDayOfWeek,
    topBuyersDrawTime,
    topBuyersSkipWeekId,
    topBuyersRankingLimitInput,
  ])

  const persistCoupons = useCallback(
    async (nextCoupons: CampaignCoupon[]) => {
      const { payload, errorMessage, errorToastId } = buildCampaignSettingsInput({
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
        coupons: nextCoupons,
        midias,
        topBuyersDrawDayOfWeek,
        topBuyersDrawTime,
        topBuyersSkipWeekId,
        topBuyersRankingLimitInput,
      })

      if (errorMessage || !payload) {
        toast.error(errorMessage ?? 'Nao foi possivel validar os cupons da campanha.', {
          toastId: errorToastId ?? 'campaign-coupons-validation-error',
        })
        return false
      }

      try {
        await saveCampaignSettings(payload)
        toast.success('Cupons salvos com sucesso.', {
          toastId: 'campaign-coupons-saved',
        })
        return true
      } catch {
        toast.error('Falha ao salvar cupons. Tente novamente.', {
          toastId: 'campaign-coupons-save-error',
        })
        return false
      }
    },
    [
      additionalPrizes,
      bonusPrize,
      bonusPrizeQuantityInput,
      endsAt,
      mainPrize,
      pricePerCotaInput,
      saveCampaignSettings,
      secondPrize,
      totalNumbersInput,
      supportWhatsappNumber,
      whatsappContactMessage,
      startsAt,
      startsAtTime,
      title,
      endsAtTime,
      packPrices,
      featuredPromotions,
      midias,
      topBuyersDrawDayOfWeek,
      topBuyersDrawTime,
      topBuyersSkipWeekId,
      topBuyersRankingLimitInput,
    ],
  )

  const persistMidias = useCallback(
    async (nextMidias: CampaignMidias) => {
      const { payload, errorMessage, errorToastId } = buildCampaignSettingsInput({
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
        midias: nextMidias,
        topBuyersDrawDayOfWeek,
        topBuyersDrawTime,
        topBuyersSkipWeekId,
        topBuyersRankingLimitInput,
      })

      if (errorMessage || !payload) {
        toast.error(errorMessage ?? 'Nao foi possivel validar as midias da campanha.', {
          toastId: errorToastId ?? 'campaign-midias-validation-error',
        })
        return false
      }

      try {
        await saveCampaignSettings(payload)
        toast.success('Midias salvas com sucesso.', {
          toastId: 'campaign-midias-saved',
        })
        return true
      } catch {
        toast.error('Falha ao salvar midias. Tente novamente.', {
          toastId: 'campaign-midias-save-error',
        })
        return false
      }
    },
    [
      additionalPrizes,
      bonusPrize,
      bonusPrizeQuantityInput,
      coupons,
      endsAt,
      mainPrize,
      pricePerCotaInput,
      saveCampaignSettings,
      secondPrize,
      totalNumbersInput,
      supportWhatsappNumber,
      whatsappContactMessage,
      startsAt,
      startsAtTime,
      title,
      endsAtTime,
      packPrices,
      featuredPromotions,
      topBuyersDrawDayOfWeek,
      topBuyersDrawTime,
      topBuyersSkipWeekId,
      topBuyersRankingLimitInput,
    ],
  )

  return {
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
    setCoupons,
    setMidias,
    topBuyersDrawDayOfWeek,
    topBuyersDrawTime,
    topBuyersSkipWeekId,
    topBuyersRankingLimitInput,
    setTopBuyersDrawDayOfWeek,
    setTopBuyersDrawTime,
    setTopBuyersSkipWeekId,
    setTopBuyersRankingLimitInput,
    handleSaveCampaignSettings,
    persistCoupons,
    persistMidias,
  }
}
