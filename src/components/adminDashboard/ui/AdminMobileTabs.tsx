import { ADMIN_TABS, type AdminTabId } from '../../../const/adminDashboard'

type AdminMobileTabsProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
}

export default function AdminMobileTabs({ activeTab, onTabChange }: AdminMobileTabsProps) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-luxury-card p-1 lg:hidden">
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.id}
          className={`flex-1 rounded-lg py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
            activeTab === tab.id ? 'bg-gold text-black' : 'text-gray-400'
          }`}
          type="button"
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
