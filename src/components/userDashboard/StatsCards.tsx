type StatsCardsProps = {
  paidCount: number
  nextDrawDateLabel: string
}

export default function StatsCards({ paidCount, nextDrawDateLabel }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
        <div className="rounded-lg bg-gold/10 p-2.5 text-gold">
          <span className="material-symbols-outlined">confirmation_number</span>
        </div>
        <div>
          <p className="text-xs text-text-muted">Numeros Ativos</p>
          <p className="text-2xl font-bold text-white">{paidCount}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
        <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400">
          <span className="material-symbols-outlined">emoji_events</span>
        </div>
        <div>
          <p className="text-xs text-text-muted">Sorteios Ganhos</p>
          <p className="text-2xl font-bold text-white">0</p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
        <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
          <span className="material-symbols-outlined">calendar_month</span>
        </div>
        <div>
          <p className="text-xs text-text-muted">Proximo Sorteio</p>
          <p className="text-lg font-bold text-white">{nextDrawDateLabel}</p>
        </div>
      </div>
    </div>
  )
}
