import { CAMPAIGN_STATUS_OPTIONS } from '../../../const/campaign'
import type { CampaignStatus } from '../../../types/campaign'

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function getCampaignStatusLabel(status: CampaignStatus) {
  return CAMPAIGN_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Ativa'
}
