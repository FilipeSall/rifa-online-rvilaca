import type { AdminTabId } from '../../const/adminDashboard'

export type AdminDashboardContentProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
  onSignOut: () => void
}

export type ElementSize = {
  width: number
  height: number
}
