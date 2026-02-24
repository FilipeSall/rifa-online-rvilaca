import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import {
  DEFAULT_ADDITIONAL_PRIZES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_MIN_PURCHASE_QUANTITY,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_SUPPORT_WHATSAPP_NUMBER,
  DEFAULT_TICKET_PRICE,
  DEFAULT_TOTAL_NUMBERS,
} from '../../../const/campaign'
import { useCampaignSettings } from '../../../hooks/useCampaignSettings'
import type { CampaignCoupon, CampaignMidias } from '../../../types/campaign'
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
  const [minPurchaseQuantityInput, setMinPurchaseQuantityInput] = useState(String(DEFAULT_MIN_PURCHASE_QUANTITY))
  const [mainPrize, setMainPrize] = useState(DEFAULT_MAIN_PRIZE)
  const [secondPrize, setSecondPrize] = useState(DEFAULT_SECOND_PRIZE)
  const [bonusPrize, setBonusPrize] = useState(DEFAULT_BONUS_PRIZE)
  const [totalNumbersInput, setTotalNumbersInput] = useState(String(DEFAULT_TOTAL_NUMBERS))
  const [additionalPrizes, setAdditionalPrizes] = useState<string[]>(DEFAULT_ADDITIONAL_PRIZES)
  const [supportWhatsappNumber, setSupportWhatsappNumber] = useState(DEFAULT_SUPPORT_WHATSAPP_NUMBER)
  const [whatsappContactMessage, setWhatsappContactMessage] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [startsAtTime, setStartsAtTime] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [endsAtTime, setEndsAtTime] = useState('')
  const [coupons, setCoupons] = useState<CampaignCoupon[]>([])
  const [midias, setMidias] = useState<CampaignMidias>({ heroCarousel: [], featuredVideo: null })
  const hasEnsuredCampaignRef = useRef(false)

  useEffect(() => {
    setTitle(campaign.title)
    setPricePerCotaInput(campaign.pricePerCota.toFixed(2))
    setMinPurchaseQuantityInput(String(campaign.minPurchaseQuantity))
    setMainPrize(campaign.mainPrize)
    setSecondPrize(campaign.secondPrize)
    setBonusPrize(campaign.bonusPrize)
    setTotalNumbersInput(String(campaign.totalNumbers))
    setAdditionalPrizes(campaign.additionalPrizes)
    setSupportWhatsappNumber(campaign.supportWhatsappNumber)
    setWhatsappContactMessage(campaign.whatsappContactMessage ?? '')
    setStartsAt(campaign.startsAt ?? '')
    setStartsAtTime(campaign.startsAtTime ?? '')
    setEndsAt(campaign.endsAt ?? '')
    setEndsAtTime(campaign.endsAtTime ?? '')
    setCoupons(campaign.coupons)
    setMidias(campaign.midias)
  }, [
    campaign.additionalPrizes,
    campaign.bonusPrize,
    campaign.coupons,
    campaign.midias,
    campaign.mainPrize,
    campaign.minPurchaseQuantity,
    campaign.pricePerCota,
    campaign.secondPrize,
    campaign.totalNumbers,
    campaign.supportWhatsappNumber,
    campaign.whatsappContactMessage,
    campaign.startsAt,
    campaign.startsAtTime,
    campaign.endsAt,
    campaign.endsAtTime,
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
      minPurchaseQuantityInput,
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
      coupons,
      midias,
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
    coupons,
    endsAt,
    mainPrize,
    minPurchaseQuantityInput,
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
    midias,
  ])

  const persistCoupons = useCallback(
    async (nextCoupons: CampaignCoupon[]) => {
      const { payload, errorMessage, errorToastId } = buildCampaignSettingsInput({
        title,
        pricePerCotaInput,
        minPurchaseQuantityInput,
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
        coupons: nextCoupons,
        midias,
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
      endsAt,
      mainPrize,
      minPurchaseQuantityInput,
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
      midias,
    ],
  )

  const persistMidias = useCallback(
    async (nextMidias: CampaignMidias) => {
      const { payload, errorMessage, errorToastId } = buildCampaignSettingsInput({
        title,
        pricePerCotaInput,
        minPurchaseQuantityInput,
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
        coupons,
        midias: nextMidias,
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
      coupons,
      endsAt,
      mainPrize,
      minPurchaseQuantityInput,
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
    ],
  )

  return {
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
    whatsappContactMessage,
    startsAt,
    startsAtTime,
    endsAt,
    endsAtTime,
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
    setWhatsappContactMessage,
    setStartsAt,
    setStartsAtTime,
    setEndsAt,
    setEndsAtTime,
    setCoupons,
    setMidias,
    handleSaveCampaignSettings,
    persistCoupons,
    persistMidias,
  }
}
