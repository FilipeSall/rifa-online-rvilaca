import type { NumberSlot, SelectionMode } from '../../types/purchaseNumbers'

type NumberSelectionCardProps = {
  numberPool: NumberSlot[]
  selectionMode: SelectionMode
  quantity: number
  selectedNumbers: number[]
  selectedCount: number
  onSelectionModeChange: (mode: SelectionMode) => void
  onToggleNumber: (slot: NumberSlot) => void
}

function getSlotStyle(status: NumberSlot['status']) {
  if (status === 'pago') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-200'
  }

  if (status === 'reservado') {
    return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
  }

  return 'border-white/10 bg-luxury-bg text-white hover:border-gold/40'
}

export default function NumberSelectionCard({
  numberPool,
  selectionMode,
  quantity,
  selectedNumbers,
  selectedCount,
  onSelectionModeChange,
  onToggleNumber,
}: NumberSelectionCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-luxury-card/70 p-6">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">2. Selecao de numeros</p>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-bold text-white">Escolha modo manual ou automatico</h2>
        <div className="inline-flex rounded-lg border border-white/10 bg-luxury-bg p-1">
          <button
            className={`rounded px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              selectionMode === 'automatico' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
            }`}
            type="button"
            onClick={() => onSelectionModeChange('automatico')}
          >
            Automatico
          </button>
          <button
            className={`rounded px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              selectionMode === 'manual' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
            }`}
            type="button"
            onClick={() => onSelectionModeChange('manual')}
          >
            Manual
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-[11px] uppercase tracking-widest">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-300" /> Disponivel
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-200">
          <span className="h-2 w-2 rounded-full bg-amber-300" /> Reservado
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-rose-200">
          <span className="h-2 w-2 rounded-full bg-rose-300" /> Pago
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-gold">
          <span className="h-2 w-2 rounded-full bg-gold" /> Selecionado
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {numberPool.map((slot) => {
          const isSelected = selectedNumbers.includes(slot.number)
          const isBlocked =
            slot.status !== 'disponivel' || (selectionMode === 'manual' && !isSelected && selectedCount >= quantity)

          return (
            <button
              key={slot.number}
              className={`h-11 rounded border text-xs font-bold tracking-wide transition-all ${
                isSelected ? 'border-gold bg-gold/20 text-gold shadow-glow-gold' : getSlotStyle(slot.status)
              } ${isBlocked ? 'cursor-not-allowed opacity-65' : ''}`}
              type="button"
              onClick={() => onToggleNumber(slot)}
              disabled={selectionMode !== 'manual' || isBlocked}
            >
              {slot.number}
            </button>
          )
        })}
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-luxury-bg p-4 text-sm text-gray-300">
        {selectionMode === 'automatico' ? (
          <p>
            Selecao automatica ativa: o sistema escolheu <span className="font-bold text-gold">{selectedCount}</span>{' '}
            numeros disponiveis para voce.
          </p>
        ) : (
          <p>
            Modo manual ativo: escolha ate <span className="font-bold text-gold">{quantity}</span> numeros
            disponiveis.
          </p>
        )}
      </div>
    </article>
  )
}
