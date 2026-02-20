import { NAV_ITEMS } from '../../const/userDashboard'
import type { Section } from '../../types/userDashboard'

type DashboardSidebarProps = {
  activeSection: Section
  onSectionChange: (section: Section) => void
  onSignOut: () => void
}

export default function DashboardSidebar({ activeSection, onSectionChange, onSignOut }: DashboardSidebarProps) {
  return (
    <aside className="sticky top-20 hidden min-h-[calc(100vh-80px)] w-64 flex-col border-r border-luxury-border bg-luxury-card lg:flex">
      <div className="flex flex-col gap-1 p-5">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">Menu Principal</p>
        {NAV_ITEMS.map(({ icon, label, section }) => (
          <button
            key={label}
            type="button"
            onClick={() => section && onSectionChange(section)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
              section === activeSection
                ? 'border border-gold/20 bg-gold/10 text-gold'
                : 'text-text-muted hover:bg-white/5 hover:text-white'
            } ${!section ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto border-t border-luxury-border p-5">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-400 transition-colors hover:bg-red-500/10"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span className="text-sm font-medium">Sair da Conta</span>
        </button>
      </div>
    </aside>
  )
}
