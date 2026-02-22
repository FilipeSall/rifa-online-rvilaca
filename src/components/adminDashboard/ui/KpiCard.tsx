import { useCountUp } from '../hooks/useCountUp'
import type { DashboardKpis, KpiCardConfig } from '../utils/kpiCards'

type KpiCardProps = {
  card: KpiCardConfig
  kpis: DashboardKpis
  index: number
}

export default function KpiCard({ card, kpis, index }: KpiCardProps) {
  const targetValue = Number(kpis[card.metricKey] ?? 0)
  const animatedValue = useCountUp(targetValue)

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-luxury-card p-5 transition-all duration-500 hover:-translate-y-1 hover:border-gold/35 hover:shadow-glow-gold"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.tone} opacity-80`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">{card.label}</p>
          <p className="mt-3 text-3xl font-black text-white">{card.value(animatedValue)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-gold">
          <span className="material-symbols-outlined">{card.icon}</span>
        </div>
      </div>
    </article>
  )
}
