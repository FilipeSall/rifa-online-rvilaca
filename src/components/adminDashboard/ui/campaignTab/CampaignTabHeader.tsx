import { formatCurrency } from '../../utils/formatters'
import type { CampaignTabHeaderProps } from './types'

export default function CampaignTabHeader({
  campaign,
  scheduleStatusLabel,
  scheduleStatusColorClassName,
  activeCoupons,
  isRefreshingWeeklyRanking,
  isLoading,
  onRefreshWeeklyRanking,
}: CampaignTabHeaderProps) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
      <div className="pointer-events-none absolute -left-12 top-0 h-44 w-44 rounded-full bg-neon-pink/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neon-pink">Central da Campanha</p>
          <h3 className="mt-2 font-display text-3xl font-bold text-white">Operacao comercial com controle total</h3>
          <p className="mt-3 max-w-2xl text-sm text-gray-300">
            Configure preco, brackets de tickets, tag mais compradas, desconto progressivo e cupons da campanha.
          </p>
          <div className="mt-4">
            <button
              className="h-10 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 text-[11px] font-bold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              onClick={onRefreshWeeklyRanking}
              disabled={isRefreshingWeeklyRanking || isLoading}
              data-testid="campaign-refresh-weekly-ranking"
            >
              {isRefreshingWeeklyRanking ? 'Atualizando ranking...' : 'Atualizar ranking semanal (manual)'}
            </button>
            <p className="mt-2 text-xs text-cyan-100/80">
              Forca o recalculo imediato do ranking Top Buyers do ciclo atual e atualiza o cache publico.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-neon-pink/20 bg-black/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Preço atual</p>
            <p className="mt-1 text-lg font-black text-neon-pink">{formatCurrency(campaign.pricePerCota)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Status</p>
            <p className={`mt-1 break-words text-base font-black leading-tight sm:text-lg ${scheduleStatusColorClassName}`}>
              {scheduleStatusLabel}
            </p>
          </div>
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Cupons ativos</p>
            <p className="mt-1 text-lg font-black text-cyan-100">{activeCoupons}</p>
          </div>
          <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200">Total de numeros</p>
            <p className="mt-1 text-lg font-black text-amber-100">{campaign.totalNumbers.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
