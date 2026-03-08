import { createContext, useContext, type ReactNode } from 'react'
import { useCampaignSettings } from '../hooks/useCampaignSettings'

type CampaignSettingsContextValue = ReturnType<typeof useCampaignSettings>

const CampaignSettingsContext = createContext<CampaignSettingsContextValue | null>(null)

export function CampaignSettingsProvider({ children }: { children: ReactNode }) {
  const campaignSettings = useCampaignSettings()

  return (
    <CampaignSettingsContext.Provider value={campaignSettings}>
      {children}
    </CampaignSettingsContext.Provider>
  )
}

export function useCampaignSettingsContext() {
  return useContext(CampaignSettingsContext)
}
