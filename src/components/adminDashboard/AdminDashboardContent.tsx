import type { AdminDashboardContentProps } from './types'
import AdminMobileTabs from './ui/AdminMobileTabs'
import AdminSidebar from './ui/AdminSidebar'
import CampaignTab from './ui/CampaignTab'
import DashboardTab from './ui/DashboardTab'
import TopBuyersDrawTab from './ui/TopBuyersDrawTab'

export default function AdminDashboardContent({ activeTab, onTabChange, onSignOut }: AdminDashboardContentProps) {
  return (
    <div className="flex min-h-[calc(100vh-80px)] bg-luxury-bg">
      <AdminSidebar activeTab={activeTab} onTabChange={onTabChange} onSignOut={onSignOut} />

      <main className="flex-1 p-4 md:p-8">
        <AdminMobileTabs activeTab={activeTab} onTabChange={onTabChange} />

        <div className="mt-6">
          {activeTab === 'dashboard' ? <DashboardTab /> : null}
          {activeTab === 'campanha' ? <CampaignTab /> : null}
          {activeTab === 'sorteio-top' ? <TopBuyersDrawTab /> : null}
        </div>
      </main>
    </div>
  )
}
