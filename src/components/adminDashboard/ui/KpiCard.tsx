import { useEffect, useRef, useState } from 'react'
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
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setVisible(true), 400)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {visible && (
        <div className="pointer-events-none absolute bottom-full left-0 right-0 z-50 mb-2 animate-fade-in-up">
          <div className="rounded-xl border border-white/15 bg-[rgba(15,12,41,0.97)] px-3.5 py-2.5 shadow-lg">
            <p className="text-[10px] uppercase tracking-[0.14em] text-neon-pink">{card.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-300">{card.tooltip}</p>
          </div>
        </div>
      )}
      <article
        className="group relative overflow-hidden rounded-2xl border border-white/10 bg-luxury-card p-5 transition-all duration-500 hover:-translate-y-1 hover:border-neon-pink/20 hover:shadow-[0_4px_24px_-6px_rgba(255,0,204,0.18)]"
        style={{ animationDelay: `${index * 40}ms` }}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.tone} opacity-80`} />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">{card.label}</p>
            <p className="mt-3 text-3xl font-black text-white">{card.value(animatedValue)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-neon-pink flex-shrink-0">
            <span className="material-symbols-outlined">{card.icon}</span>
          </div>
        </div>
      </article>
    </div>
  )
}
