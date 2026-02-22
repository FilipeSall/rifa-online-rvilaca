export type CampaignStatus = 'active' | 'scheduled' | 'paused' | 'finished'

export type CampaignSettings = {
  id: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string | null
  endsAt: string | null
}

export type UpsertCampaignSettingsInput = {
  title?: string
  pricePerCota?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
  status?: CampaignStatus
  startsAt?: string | null
  endsAt?: string | null
}

export type UpsertCampaignSettingsOutput = {
  campaignId: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string | null
  endsAt: string | null
}
