import { ADMIN_TABS, type AdminTabId } from '../../../const/adminDashboard'

type AdminSidebarProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
  onSignOut: () => void
}

export default function AdminSidebar({ activeTab, onTabChange, onSignOut }: AdminSidebarProps) {
  return (
    <aside className="sticky top-20 hidden h-[calc(100vh-80px)] w-72 flex-col border-r border-white/10 bg-luxury-card/80 backdrop-blur-md lg:flex">
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-neon-pink">Painel administrativo</p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                activeTab === tab.id
                  ? 'border-neon-pink/35 bg-neon-pink/15 text-neon-pink shadow-[0_2px_8px_rgba(255,0,204,0.14)]'
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
      </div>

      <div className="space-y-4 border-t border-white/10 p-5">
        <div className="rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Status da operacao</p>
          <p className="mt-2 text-sm font-semibold text-white">Webhook PIX ativo</p>
          <p className="mt-1 text-xs text-emerald-300">Conexao estavel</p>
        </div>

        <button
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-rose-200 hover:bg-rose-500/20"
          type="button"
          onClick={onSignOut}
        >
          Sair da conta
        </button>
      </div>
    </aside>
  )
}
