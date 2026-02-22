import { ADMIN_TABS, type AdminTabId } from '../../../const/adminDashboard'

type AdminSidebarProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
  onSignOut: () => void
}

export default function AdminSidebar({ activeTab, onTabChange, onSignOut }: AdminSidebarProps) {
  return (
    <aside className="sticky top-20 hidden min-h-[calc(100vh-80px)] w-72 flex-col border-r border-white/10 bg-luxury-card/80 p-5 backdrop-blur-md lg:flex">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-gold">Painel administrativo</p>
      <div className="space-y-1">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
              activeTab === tab.id
                ? 'border-gold/35 bg-gold/15 text-gold shadow-glow-gold'
                : 'border-transparent text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white'
            }`}
            type="button"
            onClick={() => onTabChange(tab.id)}
          >
            <span className="material-symbols-outlined">{tab.icon}</span>
            <span className="text-sm font-semibold uppercase tracking-[0.1em]">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-black/25 p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Status da operacao</p>
        <p className="mt-2 text-sm font-semibold text-white">Webhook PIX ativo</p>
        <p className="mt-1 text-xs text-emerald-300">Conexao estavel</p>
      </div>

      <button
        className="mt-auto inline-flex h-11 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-rose-200 hover:bg-rose-500/20"
        type="button"
        onClick={onSignOut}
      >
        Sair da conta
      </button>
    </aside>
  )
}
