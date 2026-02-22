import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import {
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_TICKET_PRICE,
} from '../../../const/campaign'
import { useCampaignSettings } from '../../../hooks/useCampaignSettings'
import type { CampaignStatus } from '../../../types/campaign'
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
  const [status, setStatus] = useState<CampaignStatus>(DEFAULT_CAMPAIGN_STATUS)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const hasEnsuredCampaignRef = useRef(false)

  useEffect(() => {
    setTitle(campaign.title)
    setPricePerCotaInput(campaign.pricePerCota.toFixed(2))
    setMainPrize(campaign.mainPrize)
    setSecondPrize(campaign.secondPrize)
    setBonusPrize(campaign.bonusPrize)
    setStatus(campaign.status)
    setStartsAt(campaign.startsAt ?? '')
    setEndsAt(campaign.endsAt ?? '')
  }, [
    campaign.bonusPrize,
    campaign.mainPrize,
    campaign.pricePerCota,
    campaign.secondPrize,
    campaign.status,
    campaign.startsAt,
    campaign.endsAt,
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
      status,
      startsAt,
      endsAt,
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
  }, [bonusPrize, endsAt, mainPrize, pricePerCotaInput, saveCampaignSettings, secondPrize, startsAt, status, title])

  return {
    campaign,
    isLoading,
    isSaving,
    title,
    pricePerCotaInput,
    mainPrize,
    secondPrize,
    bonusPrize,
    status,
    startsAt,
    endsAt,
    setTitle,
    setPricePerCotaInput,
    setMainPrize,
    setSecondPrize,
    setBonusPrize,
    setStatus,
    setStartsAt,
    setEndsAt,
    handleSaveCampaignSettings,
  }
}
