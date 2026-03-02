import { formatInteger } from '../utils/formatters'
import type { TooltipContentProps } from 'recharts'

export default function ConversionTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const entry = payload[0]
  const stage = String(entry.payload?.stage ?? entry.name ?? 'Etapa')
  const description = String(entry.payload?.description ?? '')
  const count = Number(entry.value ?? 0)
  const pct = String(entry.payload?.pct ?? '0%')
  const fill = String(entry.payload?.fill ?? '#ff00cc')

  return (
    <div className="rounded-xl border border-white/20 bg-[rgba(15,12,41,0.97)] px-3.5 py-2.5 shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: fill }} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">{stage}</p>
      </div>
      <p className="text-xl font-black text-white">{formatInteger(count)} <span className="text-sm font-normal text-gray-400">pedidos</span></p>
      <p className="text-xs text-gray-500 mt-0.5">{description} · {pct}</p>
    </div>
  )
}
