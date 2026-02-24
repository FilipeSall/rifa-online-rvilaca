import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import {
  CAMPAIGN_STATUS_OPTIONS,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_TOTAL_NUMBERS,
} from '../../../const/campaign'
import type {
  CampaignFeaturedVideoMedia,
  CampaignCoupon,
  CampaignCouponDiscountType,
  CampaignHeroCarouselMedia,
  CampaignStatus,
} from '../../../types/campaign'
import { CustomSelect } from '../../ui/CustomSelect'
import { useCampaignForm } from '../hooks/useCampaignForm'
import {
  deleteCampaignFeaturedVideo,
  deleteCampaignHeroCarouselImage,
  uploadCampaignFeaturedVideo,
  uploadCampaignHeroCarouselImage,
} from '../services/campaignMediaStorageService'
import { buildCampaignSettingsInput } from '../services/campaignSettingsFormService'
import { formatCurrency, getCampaignStatusLabel } from '../utils/formatters'

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length === 0) return ''
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

export default function CampaignTab() {
  const {
    campaign,
    isLoading,
    isSaving,
    title,
    pricePerCotaInput,
    minPurchaseQuantityInput,
    mainPrize,
    secondPrize,
    bonusPrize,
    totalNumbersInput,
    additionalPrizes,
    supportWhatsappNumber,
    status,
    startsAt,
    endsAt,
    coupons,
    midias,
    setTitle,
    setPricePerCotaInput,
    setMinPurchaseQuantityInput,
    setMainPrize,
    setSecondPrize,
    setBonusPrize,
    setTotalNumbersInput,
    setAdditionalPrizes,
    setSupportWhatsappNumber,
    setStatus,
    setStartsAt,
    setEndsAt,
    setMidias,
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

  const activeCoupons = useMemo(() => coupons.filter((item) => item.active).length, [coupons])
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
      minPurchaseQuantityInput,
      mainPrize,
      secondPrize,
      bonusPrize,
      totalNumbersInput,
      additionalPrizes,
      supportWhatsappNumber,
      status,
      startsAt,
      endsAt,
      coupons,
      midias,
    }).payload
  ), [
    additionalPrizes,
    bonusPrize,
    coupons,
    endsAt,
    mainPrize,
    midias,
    minPurchaseQuantityInput,
    pricePerCotaInput,
    secondPrize,
    startsAt,
    status,
    supportWhatsappNumber,
    title,
    totalNumbersInput,
  ])
  const normalizedBaseCampaignPayload = useMemo(() => (
    buildCampaignSettingsInput({
      title: campaign.title,
      pricePerCotaInput: campaign.pricePerCota.toFixed(2),
      minPurchaseQuantityInput: String(campaign.minPurchaseQuantity),
      mainPrize: campaign.mainPrize,
      secondPrize: campaign.secondPrize,
      bonusPrize: campaign.bonusPrize,
      totalNumbersInput: String(campaign.totalNumbers),
      additionalPrizes: campaign.additionalPrizes,
      supportWhatsappNumber: campaign.supportWhatsappNumber,
      status: campaign.status,
      startsAt: campaign.startsAt ?? '',
      endsAt: campaign.endsAt ?? '',
      coupons: campaign.coupons,
      midias: campaign.midias,
    }).payload
  ), [
    campaign.additionalPrizes,
    campaign.bonusPrize,
    campaign.coupons,
    campaign.endsAt,
    campaign.mainPrize,
    campaign.midias,
    campaign.minPurchaseQuantity,
    campaign.pricePerCota,
    campaign.secondPrize,
    campaign.startsAt,
    campaign.status,
    campaign.supportWhatsappNumber,
    campaign.title,
    campaign.totalNumbers,
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

  useEffect(() => {
    if (!heroAltInput.trim()) {
      setHeroAltInput(currentPrizeAlt)
    }
  }, [currentPrizeAlt, heroAltInput])

  const canAddCoupon = useMemo(() => {
    const normalizedCode = couponCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
    const parsedValue = Number(couponValueInput.replace(',', '.'))
    return normalizedCode.length > 0 && Number.isFinite(parsedValue) && parsedValue > 0
  }, [couponCodeInput, couponValueInput])

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

  return (
    <section className="space-y-6 pb-28">
      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-44 w-44 rounded-full bg-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Central da Campanha</p>
            <h3 className="mt-2 font-luxury text-3xl font-bold text-white">Operacao comercial com controle total</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Configure preço, compra mínima e cupons da campanha em tempo real.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-gold/20 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Preço atual</p>
              <p className="mt-1 text-lg font-black text-gold">{formatCurrency(campaign.pricePerCota)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Status</p>
              <p className="mt-1 text-lg font-black text-emerald-300">{getCampaignStatusLabel(status)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Compra mínima</p>
              <p className="mt-1 text-lg font-black text-white">{campaign.minPurchaseQuantity}</p>
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Cupons ativos</p>
              <p className="mt-1 text-lg font-black text-cyan-100">{activeCoupons}</p>
            </div>
            <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 lg:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200">Total de numeros</p>
              <p className="mt-1 text-lg font-black text-amber-100">{campaign.totalNumbers.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-5 xl:flex xl:h-full xl:flex-col xl:gap-5 xl:space-y-0">
          <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5 xl:flex-1">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,168,0,0.16),transparent_48%)]" />
            <div className="relative z-10 xl:flex xl:h-full xl:flex-col">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Preview ao vivo</p>
              <h4 className="mt-3 font-luxury text-2xl font-bold text-white">{title.trim() || DEFAULT_CAMPAIGN_TITLE}</h4>
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
                <div className="rounded-xl border border-gold/25 bg-black/40 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-gold">1º prêmio</p>
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
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ticket-price">
                    Preco por cota (R$)
                  </label>
                  <input
                    id="campaign-ticket-price"
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-gold outline-none transition-colors focus:border-gold/60"
                    inputMode="decimal"
                    type="text"
                    value={pricePerCotaInput}
                    onChange={(event) => setPricePerCotaInput(event.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-min-purchase">
                    Compra minima (cotas)
                  </label>
                  <input
                    id="campaign-min-purchase"
                    className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
                    inputMode="numeric"
                    type="text"
                    value={minPurchaseQuantityInput}
                    onChange={(event) => setMinPurchaseQuantityInput(event.target.value.replace(/[^0-9]/g, ''))}
                  />
                </div>
              </div>
            </section>
          </article>
        </div>

        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="grid grid-cols-1 gap-4">
            <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">1. Informacoes gerais</p>
              <div className="mt-3 grid grid-cols-1 gap-4">
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-title">
                    Nome da campanha
                  </label>
                  <input
                    id="campaign-title"
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-status">
                      Status da campanha
                    </label>
                    <CustomSelect
                      id="campaign-status"
                      value={status}
                      onChange={(v) => setStatus(v as CampaignStatus)}
                      options={CAMPAIGN_STATUS_OPTIONS}
                    />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at">
                      Inicio
                    </label>
                    <input
                      id="campaign-starts-at"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                      type="date"
                      value={startsAt}
                      onChange={(event) => setStartsAt(event.target.value)}
                    />
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                    <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at">
                      Fim
                    </label>
                    <input
                      id="campaign-ends-at"
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                      type="date"
                      value={endsAt}
                      onChange={(event) => setEndsAt(event.target.value)}
                    />
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
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
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
                      className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
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
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponCodeMode === 'auto' ? 'bg-gold text-black' : 'text-gray-300'}`}
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
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponCodeMode === 'manual' ? 'bg-gold text-black' : 'text-gray-300'}`}
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
                    className="h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold uppercase tracking-widest text-white outline-none focus:border-gold/60"
                    type="text"
                    value={couponCodeInput}
                    onChange={(event) => setCouponCodeInput(event.target.value)}
                    readOnly={couponCodeMode === 'auto'}
                  />
                  {couponCodeMode === 'auto' ? (
                    <button
                      type="button"
                      className="h-11 rounded-md border border-gold/30 bg-gold/10 px-3 text-xs font-bold uppercase tracking-wide text-gold"
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
            className="inline-flex h-11 items-center rounded-lg bg-gold px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-70"
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
