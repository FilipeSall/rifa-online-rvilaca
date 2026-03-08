import { useCampaignSettingsContext } from '../context/CampaignSettingsProvider'

export function useScopedCampaignSettings() {
  const campaignSettingsFromContext = useCampaignSettingsContext()

  if (!campaignSettingsFromContext) {
    throw new Error('useScopedCampaignSettings must be used within CampaignSettingsProvider.')
  }

  return campaignSettingsFromContext
}
