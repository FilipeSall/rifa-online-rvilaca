import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  CAMPAIGN_PACK_QUANTITIES,
  TOP_BUYERS_SCHEDULE_TIMEZONE,
  TOP_BUYERS_WEEKDAY_OPTIONS,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_TOTAL_NUMBERS,
} from '../../../const/campaign'
import { MAX_QUANTITY } from '../../../const/purchaseNumbers'
import type {
  CampaignFeaturedPromotion,
  CampaignFeaturedVideoMedia,
  CampaignCoupon,
  CampaignCouponDiscountType,
  CampaignHeroCarouselMedia,
} from '../../../types/campaign'
import { useCampaignForm } from '../hooks/useCampaignForm'
import {
  deleteCampaignFeaturedVideo,
  deleteCampaignHeroCarouselImage,
  uploadCampaignFeaturedVideo,
  uploadCampaignHeroCarouselImage,
} from '../services/campaignMediaStorageService'
import { buildCampaignSettingsInput } from '../services/campaignSettingsFormService'
import { formatCurrency } from '../utils/formatters'
import { getScheduleStatusLabel, resolveCampaignScheduleStatus } from '../../../utils/campaignSchedule'
import { CustomSelect } from '../../ui/CustomSelect'
import { functions } from '../../../lib/firebase'
import {
  normalizeTopBuyersWeeklySchedule,
  resolveFreezeAtMs,
  resolveNextDrawAtMs,
  resolveWeekIdFromDrawAtMs,
} from '../../../utils/topBuyersSchedule'

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

function generateCouponCode() {
  const seed = Math.random().toString(36).slice(2, 8).toUpperCase()
  const suffix = String(Date.now()).slice(-4)
  return `CUPOM-${seed}-${suffix}`
}

function formatCouponValue(coupon: CampaignCoupon) {
  if (coupon.discountType === 'percent') {
    return `${coupon.discountValue.toFixed(2).replace(/\.00$/, '')}%`
  }

  return formatCurrency(coupon.discountValue)
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

function normalizeHeroCarouselOrder(items: CampaignHeroCarouselMedia[]) {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      ...item,
      order: index,
    }))
}

function parseErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) {
      return message
    }
  }

  return fallback
}

function formatBrazilDateTime(valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }).format(new Date(valueMs))
}

function formatBrazilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }).format(parsed)
}

export default function CampaignTab() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    campaign,
    isLoading,
    isSaving,
    title,
    pricePerCotaInput,
    mainPrize,
    secondPrize,
    bonusPrize,
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
    setTitle,
    setPricePerCotaInput,
    setMainPrize,
    setSecondPrize,
    setBonusPrize,
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
    handleSaveCampaignSettings,
    persistCoupons,
    persistMidias,
  } = useCampaignForm()

  const [isCouponCreatorOpen, setIsCouponCreatorOpen] = useState(false)
  const [couponCodeMode, setCouponCodeMode] = useState<'manual' | 'auto'>('auto')
  const [couponCodeInput, setCouponCodeInput] = useState(generateCouponCode())
  const [couponDiscountType, setCouponDiscountType] = useState<CampaignCouponDiscountType>('percent')
  const [couponValueInput, setCouponValueInput] = useState('10')
  const [couponAction, setCouponAction] = useState<{ code: string; type: 'toggle' | 'remove' } | null>(null)
  const [selectedHeroFile, setSelectedHeroFile] = useState<File | null>(null)
  const [heroAltInput, setHeroAltInput] = useState('')
  const [isUploadingHeroMedia, setIsUploadingHeroMedia] = useState(false)
  const [heroMediaActionId, setHeroMediaActionId] = useState<string | null>(null)
  const [selectedFeaturedVideoFile, setSelectedFeaturedVideoFile] = useState<File | null>(null)
  const [isUploadingFeaturedVideo, setIsUploadingFeaturedVideo] = useState(false)
  const [isRemovingFeaturedVideo, setIsRemovingFeaturedVideo] = useState(false)
  const [isRefreshingWeeklyRanking, setIsRefreshingWeeklyRanking] = useState(false)
  const [shouldHighlightScheduleInputs, setShouldHighlightScheduleInputs] = useState(false)
  const refreshWeeklyRankingCallable = useMemo(
    () => httpsCallable<{ allowFallbackToAnyDraw?: boolean, forceRebuild?: boolean }, unknown>(
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
    () => TOP_BUYERS_WEEKDAY_OPTIONS.map((option) => ({
      value: String(option.value),
      label: option.label,
    })),
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
  const featuredVideo = useMemo<CampaignFeaturedVideoMedia | null>(() => {
    const candidate = midias.featuredVideo
    if (!candidate?.url) {
      return null
    }

    return candidate
  }, [midias.featuredVideo])
  const isFeaturedVideoBusy = isUploadingFeaturedVideo || isRemovingFeaturedVideo
  const normalizedCurrentCampaignPayload = useMemo(() => (
    buildCampaignSettingsInput({
      title,
      pricePerCotaInput,
      mainPrize,
      secondPrize,
      bonusPrize,
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
    }).payload
  ), [
    additionalPrizes,
    bonusPrize,
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
    }).payload
  ), [
    campaign.additionalPrizes,
    campaign.bonusPrize,
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
  const scheduleInputClassName = shouldHighlightScheduleInputs
    ? 'rounded-xl border border-neon-pink/70 bg-neon-pink/10 px-4 py-3 animate-pulse shadow-[0_0_0_1px_rgba(255,0,204,0.45),0_0_30px_rgba(255,0,204,0.35)]'
    : 'rounded-xl border border-white/10 bg-black/25 px-4 py-3'
  const isEndOnSameDayAsStart = Boolean(startsAt && endsAt && startsAt === endsAt)
  const minEndTime = isEndOnSameDayAsStart && startsAtTime ? startsAtTime : undefined
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
        ? Number((discountType === 'percent' ? Math.min(rawDiscount, 100) : rawDiscount).toFixed(2))
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
    if (!heroAltInput.trim()) {
      setHeroAltInput(currentPrizeAlt)
    }
  }, [currentPrizeAlt, heroAltInput])

  useEffect(() => {
    if (!topBuyersSkipWeekId || topBuyersSkipWeekId === topBuyersNextDrawWeekId) {
      return
    }

    setTopBuyersSkipWeekId('')
  }, [topBuyersNextDrawWeekId, topBuyersSkipWeekId, setTopBuyersSkipWeekId])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const locationState = location.state && typeof location.state === 'object'
      ? (location.state as Record<string, unknown>)
      : null
    const shouldHighlight = searchParams.get('tab') === 'campanha'
      && locationState?.highlightCampaignDates === true
      && locationState?.highlightSource === 'home-hero-admin-cta'

    if (!shouldHighlight) {
      setShouldHighlightScheduleInputs(false)
      return
    }

    setShouldHighlightScheduleInputs(true)
    const timeout = window.setTimeout(() => {
      setShouldHighlightScheduleInputs(false)
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: {
          ...locationState,
          highlightCampaignDates: false,
        },
      })
    }, 2000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [location.pathname, location.search, location.state, navigate])

  const canAddCoupon = useMemo(() => {
    const normalizedCode = couponCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
    const parsedValue = Number(couponValueInput.replace(',', '.'))
    return normalizedCode.length > 0 && Number.isFinite(parsedValue) && parsedValue > 0
  }, [couponCodeInput, couponValueInput])

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
      const normalizedValue = nextDiscountType === 'percent'
        ? Number(Math.min(base.discountValue, 100).toFixed(2))
        : Number(base.discountValue.toFixed(2))

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
        ? Number((base.discountType === 'percent' ? Math.min(parsed, 100) : parsed).toFixed(2))
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
      const maxTarget = current.reduce((max, item) => Math.max(max, item.targetQuantity || 0), defaultPromotionQuantity)
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

  const handleGenerateCouponCode = () => {
    setCouponCodeInput(generateCouponCode())
  }

  const handleAddCoupon = async () => {
    const normalizedCode = couponCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
    const parsedValue = Number(couponValueInput.replace(',', '.'))

    if (!normalizedCode) {
      return
    }

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return
    }

    const normalizedValue = couponDiscountType === 'percent'
      ? Number(Math.min(parsedValue, 100).toFixed(2))
      : Number(parsedValue.toFixed(2))

    if (normalizedValue <= 0) {
      return
    }

    const nextCoupon: CampaignCoupon = {
      code: normalizedCode,
      discountType: couponDiscountType,
      discountValue: normalizedValue,
      active: true,
      createdAt: new Date().toISOString(),
    }

    const deduped = coupons.filter((item) => item.code !== nextCoupon.code)
    const nextCoupons = [nextCoupon, ...deduped].slice(0, 100)
    const saved = await persistCoupons(nextCoupons)
    if (!saved) {
      return
    }

    setCouponValueInput(couponDiscountType === 'percent' ? '10' : '5')
    if (couponCodeMode === 'auto') {
      handleGenerateCouponCode()
    }
  }

  const handleToggleCoupon = async (code: string) => {
    setCouponAction({ code, type: 'toggle' })
    try {
      const nextCoupons = coupons.map((item) => (
        item.code === code
          ? {
              ...item,
              active: !item.active,
            }
          : item
      ))
      await persistCoupons(nextCoupons)
    } finally {
      setCouponAction(null)
    }
  }

  const handleRemoveCoupon = async (code: string) => {
    setCouponAction({ code, type: 'remove' })
    try {
      const nextCoupons = coupons.filter((item) => item.code !== code)
      await persistCoupons(nextCoupons)
    } finally {
      setCouponAction(null)
    }
  }

  const handleUploadHeroMedia = async () => {
    if (!selectedHeroFile) {
      toast.error('Selecione um arquivo de imagem para continuar.', {
        toastId: 'campaign-media-missing-file',
      })
      return
    }

    if (heroCarouselItems.length >= 12) {
      toast.error('Limite de 12 imagens no carrossel atingido.', {
        toastId: 'campaign-media-max-items',
      })
      return
    }

    setIsUploadingHeroMedia(true)
    let uploadedMedia: CampaignHeroCarouselMedia | null = null

    try {
      uploadedMedia = await uploadCampaignHeroCarouselImage(selectedHeroFile, campaign.id, heroAltInput)
      const nextItems = normalizeHeroCarouselOrder([
        ...heroCarouselItems,
        {
          ...uploadedMedia,
          alt: uploadedMedia.alt || heroAltInput.trim().slice(0, 140),
          order: heroCarouselItems.length,
        },
      ])
      const nextMidias = {
        ...midias,
        heroCarousel: nextItems,
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        if (uploadedMedia.storagePath) {
          try {
            await deleteCampaignHeroCarouselImage(uploadedMedia.storagePath)
          } catch {
            // Ignora erro de limpeza para nao sobrescrever o erro principal de persistencia.
          }
        }
        return
      }

      setMidias(nextMidias)
      setSelectedHeroFile(null)
      setHeroAltInput('')
    } catch (error) {
      toast.error(parseErrorMessage(error, 'Falha ao enviar imagem do carrossel.'), {
        toastId: 'campaign-media-upload-error',
      })
    } finally {
      setIsUploadingHeroMedia(false)
    }
  }

  const handleToggleHeroMedia = async (id: string) => {
    setHeroMediaActionId(id)
    try {
      const nextItems = heroCarouselItems.map((item) => (
        item.id === id
          ? {
              ...item,
              active: !item.active,
            }
          : item
      ))
      const nextMidias = {
        ...midias,
        heroCarousel: normalizeHeroCarouselOrder(nextItems),
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        return
      }

      setMidias(nextMidias)
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleMoveHeroMedia = async (id: string, direction: -1 | 1) => {
    const currentIndex = heroCarouselItems.findIndex((item) => item.id === id)
    if (currentIndex < 0) {
      return
    }

    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= heroCarouselItems.length) {
      return
    }

    setHeroMediaActionId(id)
    try {
      const nextItems = [...heroCarouselItems]
      const [movedItem] = nextItems.splice(currentIndex, 1)
      nextItems.splice(targetIndex, 0, movedItem)
      const nextMidias = {
        ...midias,
        heroCarousel: normalizeHeroCarouselOrder(nextItems),
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        return
      }

      setMidias(nextMidias)
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleEditHeroMediaAlt = async (media: CampaignHeroCarouselMedia) => {
    const prompted = window.prompt('Texto alternativo da imagem', media.alt || '')
    if (prompted === null) {
      return
    }

    const nextAlt = prompted.trim().slice(0, 140)
    if (nextAlt === media.alt) {
      return
    }

    setHeroMediaActionId(media.id)
    try {
      const nextItems = heroCarouselItems.map((item) => (
        item.id === media.id
          ? {
              ...item,
              alt: nextAlt,
            }
          : item
      ))
      const nextMidias = {
        ...midias,
        heroCarousel: normalizeHeroCarouselOrder(nextItems),
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        return
      }

      setMidias(nextMidias)
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleCopyMediaUrl = async (url: string, mediaId: string) => {
    try {
      if (!window.isSecureContext || !navigator.clipboard?.writeText) {
        throw new Error('Copiar link exige contexto seguro (HTTPS ou localhost).')
      }

      await navigator.clipboard.writeText(url)
      toast.success('Link copiado.', {
        toastId: `campaign-media-link-copied-${mediaId}`,
      })
    } catch (error) {
      toast.error(parseErrorMessage(error, 'Nao foi possivel copiar o link.'), {
        toastId: `campaign-media-link-copy-error-${mediaId}`,
      })
    }
  }

  const handleRemoveHeroMedia = async (media: CampaignHeroCarouselMedia) => {
    setHeroMediaActionId(media.id)
    try {
      const nextItems = heroCarouselItems.filter((item) => item.id !== media.id)
      const nextMidias = {
        ...midias,
        heroCarousel: normalizeHeroCarouselOrder(nextItems),
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        return
      }

      setMidias(nextMidias)

      try {
        await deleteCampaignHeroCarouselImage(media.storagePath)
      } catch (error) {
        const restored = await persistMidias(midias)
        if (restored) {
          setMidias(midias)
          toast.error(parseErrorMessage(error, 'Falha ao remover no Storage. O slide foi restaurado.'), {
            toastId: `campaign-media-delete-storage-error-${media.id}`,
          })
          return
        }

        toast.error(
          'Falha ao remover no Storage e nao foi possivel restaurar o slide automaticamente. Recarregue e tente novamente.',
          {
            toastId: `campaign-media-delete-storage-restore-failed-${media.id}`,
          },
        )
        return
      }

      toast.success('Slide removido com sucesso (painel + storage).', {
        toastId: `campaign-media-removed-${media.id}`,
      })
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleUploadFeaturedVideo = async () => {
    if (!selectedFeaturedVideoFile) {
      toast.error('Selecione um arquivo de video para continuar.', {
        toastId: 'campaign-featured-video-missing-file',
      })
      return
    }

    setIsUploadingFeaturedVideo(true)
    const previousFeaturedVideo = featuredVideo
    let uploadedFeaturedVideo: CampaignFeaturedVideoMedia | null = null

    try {
      uploadedFeaturedVideo = await uploadCampaignFeaturedVideo(selectedFeaturedVideoFile, campaign.id)
      const nextMidias = {
        ...midias,
        featuredVideo: uploadedFeaturedVideo,
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        if (uploadedFeaturedVideo.storagePath) {
          try {
            await deleteCampaignFeaturedVideo(uploadedFeaturedVideo.storagePath)
          } catch {
            // Ignora erro de limpeza para nao sobrescrever o erro principal de persistencia.
          }
        }
        return
      }

      setMidias(nextMidias)
      setSelectedFeaturedVideoFile(null)

      if (previousFeaturedVideo?.storagePath) {
        try {
          await deleteCampaignFeaturedVideo(previousFeaturedVideo.storagePath)
        } catch (error) {
          toast.error(parseErrorMessage(error, 'Novo video salvo, mas nao foi possivel remover o video antigo.'), {
            toastId: 'campaign-featured-video-cleanup-warning',
          })
        }
      }

      toast.success('Video em destaque atualizado.', {
        toastId: 'campaign-featured-video-updated',
      })
    } catch (error) {
      toast.error(parseErrorMessage(error, 'Falha ao enviar video em destaque.'), {
        toastId: 'campaign-featured-video-upload-error',
      })
    } finally {
      setIsUploadingFeaturedVideo(false)
    }
  }

  const handleRemoveFeaturedVideo = async () => {
    if (!featuredVideo) {
      return
    }

    setIsRemovingFeaturedVideo(true)
    try {
      const nextMidias = {
        ...midias,
        featuredVideo: null,
      }
      const saved = await persistMidias(nextMidias)
      if (!saved) {
        return
      }

      setMidias(nextMidias)
      setSelectedFeaturedVideoFile(null)

      try {
        await deleteCampaignFeaturedVideo(featuredVideo.storagePath)
      } catch (error) {
        const restored = await persistMidias(midias)
        if (restored) {
          setMidias(midias)
          toast.error(parseErrorMessage(error, 'Falha ao remover no Storage. O video foi restaurado.'), {
            toastId: 'campaign-featured-video-delete-storage-error',
          })
          return
        }

        toast.error(
          'Falha ao remover no Storage e nao foi possivel restaurar o video automaticamente. Recarregue e tente novamente.',
          {
            toastId: 'campaign-featured-video-delete-storage-restore-failed',
          },
        )
        return
      }

      toast.success('Video removido com sucesso (painel + storage).', {
        toastId: 'campaign-featured-video-removed',
      })
    } finally {
      setIsRemovingFeaturedVideo(false)
    }
  }

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

  return (
    <section className="space-y-6 pb-28">
      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-44 w-44 rounded-full bg-neon-pink/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neon-pink">Central da Campanha</p>
            <h3 className="mt-2 font-display text-3xl font-bold text-white">Operacao comercial com controle total</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Configure preco, brackets de tickets, tag mais compradas, desconto progressivo e cupons da campanha.
            </p>
            <div className="mt-4">
              <button
                className="h-10 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 text-[11px] font-bold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={handleRefreshWeeklyRanking}
                disabled={isRefreshingWeeklyRanking || isLoading}
              >
                {isRefreshingWeeklyRanking ? 'Atualizando ranking...' : 'Atualizar ranking semanal (manual)'}
              </button>
              <p className="mt-2 text-xs text-cyan-100/80">
                Forca o recalculo do Top 50 da semana atual (domingo a sexta) e atualiza o cache publico.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-neon-pink/20 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Preço atual</p>
              <p className="mt-1 text-lg font-black text-neon-pink">{formatCurrency(campaign.pricePerCota)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Status</p>
              <p className={`mt-1 break-words text-base font-black leading-tight sm:text-lg ${scheduleStatusColorClassName}`}>
                {getScheduleStatusLabel(scheduleStatus)}
              </p>
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Cupons ativos</p>
              <p className="mt-1 text-lg font-black text-cyan-100">{activeCoupons}</p>
            </div>
            <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200">Total de numeros</p>
              <p className="mt-1 text-lg font-black text-amber-100">{campaign.totalNumbers.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-5 xl:flex xl:h-full xl:flex-col xl:gap-5 xl:space-y-0">
          <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5 xl:flex-1">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,0,204,0.16),transparent_48%)]" />
            <div className="relative z-10 xl:flex xl:h-full xl:flex-col">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-pink">Preview ao vivo</p>
              <h4 className="mt-3 font-display text-2xl font-bold text-white">{title.trim() || DEFAULT_CAMPAIGN_TITLE}</h4>
              <p className="mt-2 text-sm text-gray-300">
                Visual de como a comunicação principal da campanha fica após o salvamento.
              </p>
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-amber-200">Total de numeros</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {(Number(totalNumbersInput.replace(/[^0-9]/g, '')) || DEFAULT_TOTAL_NUMBERS).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-xl border border-neon-pink/25 bg-black/40 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-neon-pink">1º prêmio</p>
                  <p className="mt-1 text-sm font-semibold text-white">{mainPrize.trim() || DEFAULT_MAIN_PRIZE}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">2º prêmio</p>
                  <p className="mt-1 text-sm font-semibold text-white">{secondPrize.trim() || DEFAULT_SECOND_PRIZE}</p>
                </div>
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-300">Prêmio extra</p>
                  <p className="mt-1 text-sm font-semibold text-white">{bonusPrize.trim() || DEFAULT_BONUS_PRIZE}</p>
                </div>
                {additionalPrizes.map((prize, index) => (
                  <div key={index} className="rounded-xl border border-purple-400/20 bg-purple-500/5 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-purple-300">Prêmio adicional {index + 1}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{prize}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-luxury-card p-5">
            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100">3. Regras comerciais</p>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ticket-price">
                    Preco por cota (R$)
                  </label>
                  <input
                    id="campaign-ticket-price"
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-neon-pink outline-none transition-colors focus:border-neon-pink/60"
                    inputMode="decimal"
                    type="text"
                    value={pricePerCotaInput}
                    onChange={(event) => setPricePerCotaInput(event.target.value)}
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 md:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Desconto por venda</p>
                  <p className="mt-1 text-[11px] text-gray-300">
                    Numero de ingressos para obter descontos por venda.
                  </p>
                  <div className="mt-3 space-y-3">
                    {promotionDrafts.length === 0 ? (
                      <p className="text-xs text-gray-400">Nenhuma regra cadastrada. Clique em adicionar para criar.</p>
                    ) : (
                      promotionDrafts.map((promotion, index) => (
                        <div key={`promotion-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                              Regra {index + 1}
                            </p>
                            <button
                              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300 transition hover:text-red-200"
                              type="button"
                              onClick={() => handleRemovePromotion(index)}
                              disabled={promotionDrafts.length <= 1}
                            >
                              Remover
                            </button>
                          </div>
                          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
                            <div className="md:col-span-1">
                              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor={`campaign-discount-min-quantity-${index}`}>
                                Quantidade minima
                              </label>
                              <input
                                id={`campaign-discount-min-quantity-${index}`}
                                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                                inputMode="numeric"
                                type="text"
                                value={String(promotion.targetQuantity)}
                                onChange={(event) => handlePromotionMinimumQuantityChange(index, event.target.value)}
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor={`campaign-discount-type-${index}`}>
                                Tipo de desconto
                              </label>
                              <CustomSelect
                                id={`campaign-discount-type-${index}`}
                                value={promotion.discountType}
                                options={promotionDiscountTypeOptions}
                                onChange={(nextValue) => handlePromotionDiscountTypeChange(index, nextValue === 'fixed' ? 'fixed' : 'percent')}
                              />
                            </div>
                            <div className="md:col-span-1">
                              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor={`campaign-discount-value-${index}`}>
                                {promotion.discountType === 'percent' ? 'Valor do desconto (%)' : 'Valor fixo do desconto (R$)'}
                              </label>
                              <input
                                id={`campaign-discount-value-${index}`}
                                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                                inputMode="decimal"
                                type="text"
                                value={promotion.discountValue.toString().replace('.', ',')}
                                onChange={(event) => handlePromotionDiscountInputChange(index, event.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <button
                      className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-neon-pink/60 hover:text-neon-pink"
                      type="button"
                      onClick={handleAddPromotion}
                    >
                      Adicionar regra de desconto
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-gray-400">
                O desconto progressivo aplica automaticamente quando a compra atingir a quantidade minima configurada. As promocoes nao se acumulam;
                a maior regra elegivel prevalece.
              </p>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">Tabela de 8 brackets e tag mais compradas</p>
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
                    {activePackPrices} ativos
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {packPrices.slice(0, CAMPAIGN_PACK_QUANTITIES.length).map((pack, index) => {
                    const quantity = pack.quantity
                    const currentPrice = Number((quantity * safePricePerCota).toFixed(2))
                    const isMostPurchasedTagForRow = pack.mostPurchasedTag === true

                    return (
                      <div
                        key={`pack-${index}`}
                        className={`relative rounded-lg border p-3 transition-colors ${
                          isMostPurchasedTagForRow
                            ? 'border-amber-300/45 bg-amber-500/10'
                            : 'border-white/10 bg-black/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-[0.13em] text-white">Bracket {index + 1}</p>
                          <button
                            type="button"
                            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                              pack.active
                                ? 'border border-emerald-300/40 bg-emerald-500/15 text-emerald-200'
                                : 'border border-gray-500/40 bg-gray-500/10 text-gray-300'
                            }`}
                            onClick={() => handlePackPriceActiveToggle(index)}
                          >
                            {pack.active ? 'Ativo' : 'Inativo'}
                          </button>
                        </div>
                        <label className="mt-2 block text-[10px] uppercase tracking-[0.13em] text-cyan-100" htmlFor={`campaign-pack-quantity-${index}`}>
                          Numero de cotas
                        </label>
                        <input
                          id={`campaign-pack-quantity-${index}`}
                          className="mt-2 h-9 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none focus:border-cyan-200/70"
                          inputMode="numeric"
                          type="text"
                          value={String(quantity)}
                          onChange={(event) => handlePackQuantityInputChange(index, event.target.value)}
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs font-semibold text-cyan-100">Valor automatico:</span>
                          <span className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white">
                            {formatCurrency(currentPrice)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border px-2 text-[10px] font-black uppercase tracking-[0.11em] transition ${
                            isMostPurchasedTagForRow
                              ? 'border-amber-300/55 bg-amber-300/25 text-amber-100'
                              : 'border-amber-300/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                          } disabled:cursor-not-allowed disabled:opacity-55`}
                          onClick={() => handleToggleMostPurchasedTag(index)}
                          disabled={pack.active === false}
                        >
                          {isMostPurchasedTagForRow ? 'Tag ativa' : 'Tag mais compradas'}
                        </button>
                        {pack.active === false ? (
                          <p className="mt-2 text-[10px] text-gray-500">
                            Ative este pacote para selecionar a tag.
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          </article>
        </div>

        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="grid grid-cols-1 gap-4">
            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-neon-pink">1. Informacoes gerais</p>
              <div className="mt-3 grid grid-cols-1 gap-4">
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-title">
                    Nome da campanha
                  </label>
                  <input
                    id="campaign-title"
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className={scheduleInputClassName}>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at">
                      Data de inicio
                    </label>
                    <input
                      id="campaign-starts-at"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                      type="date"
                      max={endsAt || undefined}
                      value={startsAt}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setStartsAt(nextValue)
                        if (!nextValue) {
                          setStartsAtTime('')
                          return
                        }

                        if (!startsAtTime) {
                          setStartsAtTime('00:00')
                        }
                      }}
                    />
                  </div>
                  <div className={scheduleInputClassName}>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at-time">
                      Hora de inicio
                    </label>
                    <input
                      id="campaign-starts-at-time"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!startsAt}
                      step={60}
                      type="time"
                      value={startsAtTime}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setStartsAtTime(nextValue)
                        if (
                          nextValue
                          && isEndOnSameDayAsStart
                          && endsAtTime
                          && endsAtTime < nextValue
                        ) {
                          setEndsAtTime(nextValue)
                        }
                      }}
                    />
                  </div>
                  <div className={scheduleInputClassName}>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at">
                      Data de fim
                    </label>
                    <input
                      id="campaign-ends-at"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                      type="date"
                      min={startsAt || undefined}
                      value={endsAt}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setEndsAt(nextValue)
                        if (!nextValue) {
                          setEndsAtTime('')
                          return
                        }

                        if (!endsAtTime) {
                          setEndsAtTime('23:59')
                        }

                        if (
                          nextValue
                          && startsAt
                          && nextValue === startsAt
                          && startsAtTime
                          && endsAtTime
                          && endsAtTime < startsAtTime
                        ) {
                          setEndsAtTime(startsAtTime)
                        }
                      }}
                    />
                  </div>
                  <div className={scheduleInputClassName}>
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at-time">
                      Hora de fim
                    </label>
                    <input
                      id="campaign-ends-at-time"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!endsAt}
                      min={minEndTime}
                      step={60}
                      type="time"
                      value={endsAtTime}
                      onChange={(event) => setEndsAtTime(event.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  O status e definido automaticamente pelo periodo configurado:
                  antes do inicio = agendada, durante o periodo = ativa, apos o fim = encerrada.
                </p>

                <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100">Agendamento do Sorteio Top (Semanal)</p>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-top-buyers-weekday">
                        Dia da semana
                      </label>
                      <CustomSelect
                        id="campaign-top-buyers-weekday"
                        value={String(topBuyersScheduleDraft.dayOfWeek)}
                        options={topBuyersWeekdaySelectOptions}
                        onChange={(nextValue) => {
                          const parsed = Number(nextValue)
                          setTopBuyersDrawDayOfWeek(Number.isInteger(parsed) ? parsed : 5)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-top-buyers-time">
                        Hora do sorteio
                      </label>
                      <input
                        id="campaign-top-buyers-time"
                        className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
                        step={60}
                        type="time"
                        value={topBuyersScheduleDraft.drawTime}
                        onChange={(event) => setTopBuyersDrawTime(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-cyan-200/30 bg-black/30 px-3 py-3">
                    <label className="flex items-start gap-3 text-xs text-cyan-50/90" htmlFor="campaign-top-buyers-skip-week">
                      <input
                        id="campaign-top-buyers-skip-week"
                        className="mt-0.5 h-4 w-4 rounded border border-cyan-200/60 bg-black/40 text-neon-pink focus:ring-2 focus:ring-cyan-200/60"
                        type="checkbox"
                        checked={isSkippingTopBuyersWeek}
                        onChange={(event) => {
                          setTopBuyersSkipWeekId(event.target.checked ? topBuyersNextDrawWeekId : '')
                        }}
                      />
                      <span>
                        <span className="font-semibold text-cyan-50">Pular o sorteio desta semana</span>
                        <span className="mt-1 block text-[11px] text-cyan-100/70">
                          Semana do sorteio: <span className="font-semibold">{formatBrazilDate(topBuyersNextDrawWeekId)}</span>. O ranking continua sendo atualizado,
                          mas o sorteio semanal nao podera ser publicado.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-cyan-100/85">
                    <p>Fuso oficial: <span className="font-semibold">{TOP_BUYERS_SCHEDULE_TIMEZONE}</span></p>
                    <p>Próximo sorteio: <span className="font-semibold">{formatBrazilDateTime(topBuyersNextDrawAtMs)}</span></p>
                    <p>Congelamento do ranking: <span className="font-semibold">{formatBrazilDateTime(topBuyersNextFreezeAtMs)}</span> (no horário do sorteio)</p>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-support-whatsapp">
                    WhatsApp da equipe (suporte/premiacao)
                  </label>
                  <input
                    id="campaign-support-whatsapp"
                    className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
                    type="text"
                    value={supportWhatsappNumber}
                    onChange={(event) => setSupportWhatsappNumber(applyPhoneMask(event.target.value))}
                    placeholder="+55(62)98507-4477"
                  />
                </div>

                <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-whatsapp-contact-message">
                    Mensagem automática WhatsApp (ao clicar no botão)
                  </label>
                  <textarea
                    id="campaign-whatsapp-contact-message"
                    className="mt-2 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 py-2 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
                    value={whatsappContactMessage}
                    onChange={(event) => setWhatsappContactMessage(event.target.value)}
                    placeholder="Olá! Tenho interesse em comprar números da rifa..."
                    rows={3}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-amber-300/25 bg-amber-500/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200">2. Premiacao</p>
              <div className="mt-3 space-y-4">
                <div className="rounded-xl border border-amber-300/25 bg-black/30 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-amber-100" htmlFor="campaign-total-numbers">
                    Total de numeros da campanha
                  </label>
                  <input
                    id="campaign-total-numbers"
                    className="mt-2 h-11 w-full rounded-md border border-amber-300/30 bg-black/35 px-3 text-sm font-semibold text-amber-50 outline-none transition-colors focus:border-amber-200/80"
                    type="text"
                    value={totalNumbersInput}
                    onChange={(event) => setTotalNumbersInput(event.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Ex: 3450000"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-main-prize">
                      1º premio
                    </label>
                    <input
                      id="campaign-main-prize"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                      type="text"
                      value={mainPrize}
                      onChange={(event) => setMainPrize(event.target.value)}
                    />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-second-prize">
                      2º premio
                    </label>
                    <input
                      id="campaign-second-prize"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                      type="text"
                      value={secondPrize}
                      onChange={(event) => setSecondPrize(event.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-emerald-300" htmlFor="campaign-bonus-prize">
                    Premio extra
                  </label>
                  <input
                    id="campaign-bonus-prize"
                    className="mt-2 h-11 w-full rounded-md border border-emerald-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-300/60"
                    type="text"
                    value={bonusPrize}
                    onChange={(event) => setBonusPrize(event.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-purple-400/20 bg-purple-500/5 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-purple-300">
                      Premios adicionais <span className="normal-case tracking-normal text-purple-400/60">(opcional)</span>
                    </p>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-purple-300/30 bg-purple-500/15 px-2.5 text-[11px] font-bold text-purple-200 transition hover:bg-purple-500/25"
                      onClick={() => setAdditionalPrizes([...additionalPrizes, ''])}
                    >
                      + Adicionar
                    </button>
                  </div>
                  {additionalPrizes.length === 0 ? (
                    <p className="mt-2 text-xs text-purple-400/50">Nenhum premio adicional cadastrado.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {additionalPrizes.map((prize, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            className="h-10 w-full rounded-md border border-purple-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-purple-300/60"
                            type="text"
                            value={prize}
                            placeholder="Ex: iPhone 15 Pro, Viagem..."
                            onChange={(event) => {
                              const next = [...additionalPrizes]
                              next[index] = event.target.value
                              setAdditionalPrizes(next)
                            }}
                          />
                          <button
                            type="button"
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-red-400/30 bg-red-500/10 text-base font-bold text-red-300 transition hover:bg-red-500/20"
                            onClick={() => setAdditionalPrizes(additionalPrizes.filter((_, i) => i !== index))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

          </div>

        </article>
      </div>

      <article className="rounded-3xl border border-emerald-300/20 bg-emerald-500/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200">4. Midias</p>
            <p className="mt-1 text-xs text-emerald-100/80">
              Gerencie imagens do carrossel (maximo 12) e 1 video em destaque para o botao flutuante.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-emerald-300/25 bg-black/25 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-200">Slides ativos</p>
              <p className="mt-1 text-sm font-black text-white">{activeHeroSlides}</p>
            </div>
            <div className="rounded-lg border border-cyan-300/25 bg-black/25 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-200">Video destaque</p>
              <p className="mt-1 text-sm font-black text-white">{featuredVideo?.active ? 'Ativo' : 'Inativo'}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-cyan-300/20 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-100">Video de destaque</p>
              <p className="mt-1 text-xs text-cyan-100/70">Apenas 1 video ativo por vez.</p>
            </div>
            {featuredVideo ? (
              <span className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
                Publicado
              </span>
            ) : (
              <span className="rounded-full border border-gray-400/30 bg-gray-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-300">
                Sem video
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-cyan-100" htmlFor="campaign-featured-video-file">
                Arquivo de video
              </label>
              <input
                id="campaign-featured-video-file"
                accept="video/*"
                className="mt-2 block h-11 w-full cursor-pointer rounded-md border border-cyan-200/30 bg-black/40 px-3 py-2 text-xs text-cyan-50 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-cyan-300/25 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-cyan-100"
                type="file"
                onChange={(event) => setSelectedFeaturedVideoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                className="inline-flex h-11 items-center rounded-lg bg-cyan-300 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleUploadFeaturedVideo}
                disabled={isFeaturedVideoBusy || !selectedFeaturedVideoFile}
              >
                {isUploadingFeaturedVideo ? 'Enviando...' : featuredVideo ? 'Substituir video' : 'Publicar video'}
              </button>
              <button
                className="inline-flex h-11 items-center rounded-lg border border-red-400/35 bg-red-500/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleRemoveFeaturedVideo}
                disabled={isFeaturedVideoBusy || !featuredVideo}
              >
                {isRemovingFeaturedVideo ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>

          {selectedFeaturedVideoFile ? (
            <p className="mt-2 text-[11px] text-cyan-100/80">
              Arquivo selecionado: <span className="font-semibold text-cyan-50">{selectedFeaturedVideoFile.name}</span>
            </p>
          ) : null}

          {featuredVideo ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center">
                <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/70">
                  <video
                    className="h-full w-full object-cover"
                    controls
                    preload="metadata"
                    src={featuredVideo.url}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">Video atual exibido no botao flutuante</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Criado em {new Date(featuredVideo.createdAt).toLocaleString('pt-BR')}
                  </p>
                  <p className="mt-2 truncate text-[11px] text-gray-500" title={featuredVideo.url}>
                    {featuredVideo.url}
                  </p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-white/15 bg-black/40 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-200 transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => handleCopyMediaUrl(featuredVideo.url, featuredVideo.id)}
                    disabled={isFeaturedVideoBusy}
                  >
                    Copiar link
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-black/25 p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr_auto]">
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-emerald-100" htmlFor="campaign-hero-file">
                Arquivo de imagem
              </label>
              <input
                id="campaign-hero-file"
                accept="image/*"
                className="mt-2 block h-11 w-full cursor-pointer rounded-md border border-emerald-200/30 bg-black/40 px-3 py-2 text-xs text-emerald-50 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-emerald-300/25 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-emerald-100"
                type="file"
                onChange={(event) => setSelectedHeroFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.15em] text-emerald-100" htmlFor="campaign-hero-alt">
                Texto alternativo (opcional)
              </label>
              <input
                id="campaign-hero-alt"
                className="mt-2 h-11 w-full rounded-md border border-emerald-200/30 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-200/75"
                type="text"
                value={heroAltInput}
                onChange={(event) => setHeroAltInput(event.target.value)}
                placeholder="Ex: BMW R1200 GS em destaque"
              />
            </div>
            <div className="flex items-end">
              <button
                className="inline-flex h-11 items-center rounded-lg bg-emerald-300 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleUploadHeroMedia}
                disabled={
                  isUploadingHeroMedia
                  || heroCarouselItems.length >= 12
                  || !selectedHeroFile
                  || heroMediaActionId !== null
                }
              >
                {isUploadingHeroMedia ? 'Enviando...' : 'Adicionar slide'}
              </button>
            </div>
          </div>

          {selectedHeroFile ? (
            <p className="mt-2 text-[11px] text-emerald-100/80">
              Arquivo selecionado: <span className="font-semibold text-emerald-50">{selectedHeroFile.name}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          {heroCarouselItems.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-gray-300">
              Nenhuma imagem cadastrada. A home continua usando as imagens padrao ate voce adicionar slides.
            </p>
          ) : null}

          {heroCarouselItems.map((media, index) => {
            const isProcessing = heroMediaActionId === media.id || isUploadingHeroMedia

            return (
              <div key={media.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/60">
                    <img
                      alt={media.alt || `Slide ${index + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      src={media.url}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">
                        Ordem {index + 1}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                          media.active
                            ? 'border border-emerald-300/35 bg-emerald-500/15 text-emerald-200'
                            : 'border border-gray-500/40 bg-gray-500/10 text-gray-300'
                        }`}
                      >
                        {media.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-300">
                      Alt:{' '}
                      <span
                        className="inline-block max-w-full truncate align-bottom font-semibold text-white"
                        title={media.alt || 'Sem descricao'}
                      >
                        {media.alt || 'Sem descricao'}
                      </span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[11px] text-gray-500" title={media.url}>
                        {media.url}
                      </p>
                      <button
                        type="button"
                        className="inline-flex h-7 items-center rounded-md border border-white/15 bg-black/40 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-200 transition hover:bg-black/60"
                        onClick={() => handleCopyMediaUrl(media.url, media.id)}
                        disabled={isProcessing}
                      >
                        Copiar link
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-200 disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => handleMoveHeroMedia(media.id, -1)}
                      disabled={isProcessing || index === 0}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-200 disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => handleMoveHeroMedia(media.id, 1)}
                      disabled={isProcessing || index === heroCarouselItems.length - 1}
                    >
                      Descer
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md border border-amber-300/30 bg-amber-500/10 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100 disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => handleEditHeroMediaAlt(media)}
                      disabled={isProcessing}
                    >
                      Editar alt
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => handleToggleHeroMedia(media.id)}
                      disabled={isProcessing}
                    >
                      {media.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md border border-red-400/35 bg-red-500/10 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-200 disabled:cursor-not-allowed disabled:opacity-55"
                      onClick={() => handleRemoveHeroMedia(media)}
                      disabled={isProcessing}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </article>

      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(34,211,238,0.18),transparent_38%)]" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Cupons da campanha</p>
              <h4 className="mt-1 text-xl font-bold text-white">Descontos com controle fino</h4>
            </div>
            <button
              className="inline-flex h-10 items-center rounded-lg border border-cyan-200/35 bg-cyan-500/15 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/25"
              type="button"
              onClick={() => setIsCouponCreatorOpen((current) => !current)}
            >
              {isCouponCreatorOpen ? 'Fechar criador' : 'Novo cupom'}
            </button>
          </div>

          {isCouponCreatorOpen ? (
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-cyan-200/25 bg-black/25 p-4 lg:grid-cols-12">
              <div className="space-y-2 lg:col-span-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Tipo de desconto</p>
                <div className="inline-flex rounded-lg border border-white/10 bg-black/35 p-1">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponDiscountType === 'percent' ? 'bg-cyan-300 text-black' : 'text-gray-300'}`}
                    onClick={() => setCouponDiscountType('percent')}
                  >
                    Percentual
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponDiscountType === 'fixed' ? 'bg-cyan-300 text-black' : 'text-gray-300'}`}
                    onClick={() => setCouponDiscountType('fixed')}
                  >
                    Valor fixo
                  </button>
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Codigo</p>
                <div className="inline-flex rounded-lg border border-white/10 bg-black/35 p-1">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponCodeMode === 'auto' ? 'bg-neon-pink text-black' : 'text-gray-300'}`}
                    onClick={() => {
                      setCouponCodeMode('auto')
                      if (!couponCodeInput.trim()) {
                        setCouponCodeInput(generateCouponCode())
                      }
                    }}
                  >
                    Automatico
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponCodeMode === 'manual' ? 'bg-neon-pink text-black' : 'text-gray-300'}`}
                    onClick={() => setCouponCodeMode('manual')}
                  >
                    Manual
                  </button>
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400" htmlFor="coupon-discount-value">
                  Valor do desconto
                </label>
                <div className="relative">
                  {couponDiscountType === 'fixed' ? (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-cyan-100/90">
                      R$
                    </span>
                  ) : null}
                  <input
                    id="coupon-discount-value"
                    className={`h-11 w-full rounded-md border border-white/10 bg-black/40 text-sm font-semibold text-white outline-none focus:border-cyan-200/60 ${
                      couponDiscountType === 'fixed' ? 'pl-11 pr-3' : 'pl-3 pr-10'
                    }`}
                    inputMode="decimal"
                    type="text"
                    value={couponValueInput}
                    onChange={(event) => setCouponValueInput(event.target.value)}
                    placeholder={couponDiscountType === 'percent' ? 'Ex: 10' : 'Ex: 5,00'}
                  />
                  {couponDiscountType === 'percent' ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-cyan-100/90">
                      %
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400" htmlFor="coupon-code-input">
                  Codigo do cupom
                </label>
                <div className="flex gap-2">
                  <input
                    id="coupon-code-input"
                    className="h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold uppercase tracking-widest text-white outline-none focus:border-neon-pink/60"
                    type="text"
                    value={couponCodeInput}
                    onChange={(event) => setCouponCodeInput(event.target.value)}
                    readOnly={couponCodeMode === 'auto'}
                  />
                  {couponCodeMode === 'auto' ? (
                    <button
                      type="button"
                      className="h-11 rounded-md border border-neon-pink/30 bg-neon-pink/10 px-3 text-xs font-bold uppercase tracking-wide text-neon-pink"
                      onClick={handleGenerateCouponCode}
                    >
                      Gerar
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="lg:col-span-12">
                <button
                  className="inline-flex h-11 items-center rounded-lg bg-cyan-300 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  type="button"
                  onClick={handleAddCoupon}
                  disabled={!canAddCoupon}
                >
                  Adicionar cupom
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {coupons.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400 lg:col-span-2">
                Nenhum cupom cadastrado para esta campanha.
              </p>
            ) : null}

            {coupons.map((coupon) => (
              <div key={coupon.code} className="rounded-xl border border-white/10 bg-black/30 px-4 py-4">
                {(() => {
                  const isToggleLoading = couponAction?.code === coupon.code && couponAction.type === 'toggle'
                  const isRemoveLoading = couponAction?.code === coupon.code && couponAction.type === 'remove'

                  return (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Codigo</p>
                          <p className="mt-1 font-mono text-sm font-bold tracking-wider text-white">{coupon.code}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${coupon.active ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-200' : 'border border-gray-500/40 bg-gray-600/15 text-gray-300'}`}>
                          {coupon.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-gray-300">
                        Desconto: <span className="font-black text-cyan-100">{formatCouponValue(coupon)}</span>
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleToggleCoupon(coupon.code)}
                          disabled={couponAction !== null}
                        >
                          {isToggleLoading ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                          ) : null}
                          {isToggleLoading ? 'Processando...' : coupon.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-red-400/35 bg-red-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleRemoveCoupon(coupon.code)}
                          disabled={couponAction !== null}
                        >
                          {isRemoveLoading ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                          ) : null}
                          {isRemoveLoading ? 'Removendo...' : 'Remover'}
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      </article>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/70 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.13em] ${
            hasCampaignChanges ? 'text-amber-200' : 'text-emerald-200'
          }`}>
            {hasCampaignChanges ? 'Alteracoes pendentes para salvar.' : 'Nenhuma alteracao pendente.'}
          </p>
          <button
            className="inline-flex h-11 items-center rounded-lg bg-neon-pink px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            disabled={isLoading || isSaving || !hasCampaignChanges}
            onClick={handleSaveCampaignSettings}
          >
            {saveButtonLabel}
          </button>
        </div>
      </div>
    </section>
  )
}
