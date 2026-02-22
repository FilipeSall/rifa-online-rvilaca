export type CampaignSettings = {
  id: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
}

export type UpsertCampaignSettingsInput = {
  title?: string
  pricePerCota?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
}

export type UpsertCampaignSettingsOutput = {
  campaignId: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
}
