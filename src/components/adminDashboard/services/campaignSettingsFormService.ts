import {
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
} from '../../../const/campaign'
import type { CampaignStatus, UpsertCampaignSettingsInput } from '../../../types/campaign'

export type CampaignFormState = {
  title: string
  pricePerCotaInput: string
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string
  endsAt: string
}

type CampaignValidationResult = {
  errorToastId: string | null
  errorMessage: string | null
  payload: UpsertCampaignSettingsInput | null
}

export function buildCampaignSettingsInput(formState: CampaignFormState): CampaignValidationResult {
  const normalizedTitle = formState.title.trim() || DEFAULT_CAMPAIGN_TITLE
  const normalizedMainPrize = formState.mainPrize.trim() || DEFAULT_MAIN_PRIZE
  const normalizedSecondPrize = formState.secondPrize.trim() || DEFAULT_SECOND_PRIZE
  const normalizedBonusPrize = formState.bonusPrize.trim() || DEFAULT_BONUS_PRIZE
  const normalizedPriceText = formState.pricePerCotaInput.replace(',', '.').trim()
  const normalizedPrice = Number(normalizedPriceText)

  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
    return {
      errorToastId: 'campaign-invalid-price',
      errorMessage: 'Informe um valor valido para a cota.',
      payload: null,
    }
  }

  if (formState.startsAt && formState.endsAt && formState.startsAt > formState.endsAt) {
    return {
      errorToastId: 'campaign-invalid-date-range',
      errorMessage: 'A data de inicio nao pode ser maior que a data de fim.',
      payload: null,
    }
  }

  return {
    errorToastId: null,
    errorMessage: null,
    payload: {
      title: normalizedTitle,
      pricePerCota: Number(normalizedPrice.toFixed(2)),
      mainPrize: normalizedMainPrize,
      secondPrize: normalizedSecondPrize,
      bonusPrize: normalizedBonusPrize,
      status: formState.status,
      startsAt: formState.startsAt.trim() ? formState.startsAt : null,
      endsAt: formState.endsAt.trim() ? formState.endsAt : null,
    },
  }
}
