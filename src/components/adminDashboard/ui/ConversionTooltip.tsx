import type { TooltipContentProps } from 'recharts'

export default function ConversionTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const entry = payload[0]
  const stage = String(entry.payload?.stage ?? entry.name ?? 'Etapa')
  const value = Number(entry.value ?? 0)

  return (
    <div className="rounded-xl border border-gold/35 bg-[rgba(20,20,20,0.96)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-gold">{stage}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}%</p>
    </div>
  )
}
