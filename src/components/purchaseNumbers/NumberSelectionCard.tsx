import { useEffect, useMemo, useState } from 'react'
import type { NumberSlot, SelectionMode } from '../../types/purchaseNumbers'

type NumberSelectionCardProps = {
  numberPool: NumberSlot[]
  selectionMode: SelectionMode
  quantity: number
  selectedNumbers: number[]
  selectedCount: number
  rangeStart: number
  rangeEnd: number
  totalNumbers: number
  pageStart: number | null
  pageEnd: number | null
  smallestAvailableNumber: number | null
  hasPreviousPage: boolean
  hasNextPage: boolean
  currentPage: number
  totalPages: number
  isPageLoading: boolean
  isManualAdding: boolean
  onSelectionModeChange: (mode: SelectionMode) => void
  onToggleNumber: (slot: NumberSlot) => void
  onLoadPreviousPage: () => void
  onLoadNextPage: () => void
  onClearSelectedNumbers: () => void
  onGoToPage: (pageNumber: number) => void
  onAddManualNumber: (number: number) => void
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
  rangeStart,
  rangeEnd,
  totalNumbers,
  pageStart,
  pageEnd,
  smallestAvailableNumber,
  hasPreviousPage,
  hasNextPage,
  currentPage,
  totalPages,
  isPageLoading,
  isManualAdding,
  onSelectionModeChange,
  onToggleNumber,
  onLoadPreviousPage,
  onLoadNextPage,
  onClearSelectedNumbers,
  onGoToPage,
  onAddManualNumber,
}: NumberSelectionCardProps) {
  const [pageInput, setPageInput] = useState(String(currentPage))
  const [manualNumberInput, setManualNumberInput] = useState('')

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  const displayedRange = useMemo(
    () => `${(pageStart ?? 0).toLocaleString('pt-BR')} - ${(pageEnd ?? 0).toLocaleString('pt-BR')}`,
    [pageEnd, pageStart],
  )

  const handleSubmitPage = () => {
    const parsed = Number(pageInput)
    if (!Number.isInteger(parsed)) {
      return
    }

    onGoToPage(parsed)
  }

  const handleSubmitManualNumber = () => {
    const parsed = Number(manualNumberInput)
    if (!Number.isInteger(parsed)) {
      return
    }

    void onAddManualNumber(parsed)
    setManualNumberInput('')
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-luxury-card/70 p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative z-10">
        <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">2. Selecao de numeros</p>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-xl font-bold text-white">Escolha seus numeros com controle total</h2>
          <div className="inline-flex rounded-xl border border-white/10 bg-luxury-bg p-1">
            <button
              className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                selectionMode === 'automatico' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}
              type="button"
              onClick={() => onSelectionModeChange('automatico')}
            >
              Automatico
            </button>
            <button
              className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                selectionMode === 'manual' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}
              type="button"
              onClick={() => onSelectionModeChange('manual')}
            >
              Manual
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Faixa da pagina</p>
            <p className="mt-1 text-sm font-bold text-white">{displayedRange}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Pagina atual</p>
            <p className="mt-1 text-sm font-bold text-white">
              {currentPage.toLocaleString('pt-BR')} / {totalPages.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Universo da campanha</p>
            <p className="mt-1 text-sm font-bold text-white">{totalNumbers.toLocaleString('pt-BR')} numeros</p>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">Menor disponivel</p>
            <p className="mt-1 text-sm font-bold text-emerald-200">
              {smallestAvailableNumber !== null ? smallestAvailableNumber.toLocaleString('pt-BR') : '--'}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-black/35 via-black/20 to-black/35 p-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Navegacao</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={onLoadPreviousPage}
                disabled={!hasPreviousPage || isPageLoading}
              >
                Pagina anterior
              </button>
              <button
                className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={onLoadNextPage}
                disabled={!hasNextPage || isPageLoading}
              >
                Proxima pagina
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Ir para pagina</p>
            <div className="flex gap-2">
              <input
                className="h-10 w-24 rounded-lg border border-white/15 bg-black/25 px-3 text-sm font-semibold text-white outline-none transition focus:border-gold"
                inputMode="numeric"
                type="text"
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
              />
              <button
                className="h-10 rounded-lg border border-gold/30 bg-gold/10 px-4 text-[11px] font-bold uppercase tracking-wider text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={handleSubmitPage}
                disabled={isPageLoading}
              >
                Ir
              </button>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Selecao manual rapida</p>
            <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-3 text-sm font-semibold text-white outline-none transition focus:border-gold"
                inputMode="numeric"
                placeholder={`Numero (${rangeStart} a ${rangeEnd})`}
                type="text"
                value={manualNumberInput}
                onChange={(event) => setManualNumberInput(event.target.value.replace(/[^0-9]/g, ''))}
              />
              <button
                className="h-10 w-full shrink-0 whitespace-nowrap rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-4 text-[11px] font-bold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                type="button"
                onClick={handleSubmitManualNumber}
                disabled={selectionMode !== 'manual' || isManualAdding || isPageLoading}
              >
                {isManualAdding ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-widest">
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
          <button
            className="ml-auto h-9 rounded-lg border border-red-300/30 bg-red-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={onClearSelectedNumbers}
            disabled={selectedCount === 0 || isPageLoading}
          >
            Limpar selecionados ({selectedCount})
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {isPageLoading ? (
            <p className="col-span-full rounded-lg border border-white/10 bg-luxury-bg p-4 text-sm text-gray-300">
              Carregando pagina de numeros...
            </p>
          ) : null}
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
                disabled={isPageLoading || selectionMode !== 'manual' || isBlocked}
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
              disponiveis. Voce pode limpar a lista e adicionar numeros por pagina ou por busca rapida.
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
