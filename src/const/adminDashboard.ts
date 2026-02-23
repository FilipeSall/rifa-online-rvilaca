export type AdminTabId = 'dashboard' | 'campanha' | 'sorteio-top' | 'sorteio-geral'

export type AdminTab = {
  id: AdminTabId
  label: string
  icon: string
}

export const ADMIN_TABS: AdminTab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'campanha', label: 'Campanha', icon: 'campaign' },
  { id: 'sorteio-top', label: 'Sorteio TOP', icon: 'workspace_premium' },
  { id: 'sorteio-geral', label: 'Sorteio Principal', icon: 'emoji_events' },
]
