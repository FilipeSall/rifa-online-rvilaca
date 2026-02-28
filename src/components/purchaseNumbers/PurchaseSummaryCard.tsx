import type { CouponFeedback } from '../../types/purchaseNumbers'
import type { SelectionMode } from '../../types/purchaseNumbers'
import { formatCurrency } from '../../utils/purchaseNumbers'
import { formatTicketNumbers } from '../../utils/ticketNumber'

type PurchaseSummaryCardProps = {
  selectedCount: number
  minQuantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  totalAmount: number
  appliedCoupon: string | null
  couponCode: string
  couponFeedback: CouponFeedback | null
  couponHint: string
  canProceed: boolean
  isReserving: boolean
  isAutoSelecting: boolean
  selectionMode: SelectionMode
  shouldHighlightSelectedNumbers: boolean
  selectedNumbers: number[]
  isSticky?: boolean
  onCouponCodeChange: (value: string) => void
  onApplyCoupon: () => void
  onSwitchToManual: () => void
  onProceed: () => void
}

export default function PurchaseSummaryCard({
  selectedCount,
  minQuantity,
  unitPrice,
  subtotal,
  discountAmount,
  totalAmount,
  appliedCoupon,
  couponCode,
  couponFeedback,
  couponHint,
  canProceed,
  isReserving,
  isAutoSelecting,
  selectionMode,
  shouldHighlightSelectedNumbers,
  selectedNumbers,
  isSticky = true,
  onCouponCodeChange,
  onApplyCoupon,
  onSwitchToManual,
  onProceed,
}: PurchaseSummaryCardProps) {
  const formattedSelectedNumbers = formatTicketNumbers(selectedNumbers)
  const isAutomaticSelection = selectionMode === 'automatico'

  return (
    <div className={`${isSticky ? 'sticky top-24 ' : ''}rounded-2xl border border-neon-pink/25 bg-luxury-card p-6 shadow-2xl`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-neon-pink">3. Carrinho</p>
      <h2 className="mt-3 text-xl font-bold text-white">Resumo da compra</h2>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between text-gray-300">
          <span>Quantidade selecionada</span>
          <span className="font-bold text-white">{selectedCount}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Preco por cota</span>
          <span className="font-bold text-white">{formatCurrency(unitPrice)}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Subtotal</span>
          <span className="font-bold text-white">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Desconto ({appliedCoupon ?? 'sem cupom'})</span>
          <span className="font-bold text-emerald-300">- {formatCurrency(discountAmount)}</span>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-luxury-bg p-4">
        <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="coupon-code">
          Cupom de desconto
        </label>
        <div className="mt-2 flex gap-2 max-[419px]:flex-col">
          <input
            id="coupon-code"
            className="h-10 flex-1 rounded border border-white/15 bg-luxury-card px-3 text-sm text-white outline-none focus:border-neon-pink max-[419px]:h-12 max-[419px]:w-full"
            type="text"
            placeholder="Ex: PIX10"
            value={couponCode}
            onChange={(event) => onCouponCodeChange(event.target.value)}
          />
          <button
            className="h-10 rounded bg-neon-pink px-4 text-xs font-black uppercase tracking-widest text-black hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed max-[419px]:w-full"
            type="button"
            onClick={onApplyCoupon}
            disabled={!couponCode.trim() || selectedCount === 0}
          >
            Aplicar
          </button>
        </div>
        {couponFeedback ? (
          <p className={`mt-2 text-xs ${couponFeedback.tone === 'success' ? 'text-emerald-300' : 'text-gray-400'}`}>
            {couponFeedback.message}
          </p>
        ) : null}
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.18em] text-gray-500">Valor total</span>
          <span className="text-2xl font-black text-neon-pink">{formatCurrency(totalAmount)}</span>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Menor bracket ativo: {minQuantity} numeros. Numeros confirmados apos pagamento aprovado.
        </p>
      </div>

      <button
        className="mt-5 h-12 w-full rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-4 text-sm font-black uppercase tracking-widest text-black transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        disabled={!canProceed || isReserving || isAutoSelecting}
        onClick={onProceed}
      >
        {isReserving
          ? 'Processando compra...'
          : isAutoSelecting
            ? 'Selecionando numeros...'
            : 'Comprar agora'}
      </button>

      <p className="mt-3 text-[11px] text-gray-500">
        Ao continuar, voce concorda com o regulamento e com as regras de sorteio auditavel.
      </p>

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isAutomaticSelection ? 'text-neon-pink md:text-gray-500' : 'text-gray-500'}`}>
            Numeros selecionados
          </p>
          {isAutomaticSelection ? (
            <button
              className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-neon-pink transition-colors hover:text-primary-hover md:hidden"
              type="button"
              onClick={onSwitchToManual}
            >
              Modo manual
            </button>
          ) : null}
        </div>
        {isAutomaticSelection ? (
          <p className="mt-2 text-[11px] leading-relaxed text-gray-300 md:hidden">
            Os numeros foram selecionados automaticamente. Prefere escolher manualmente?{' '}
            <button
              className="font-semibold text-neon-pink underline underline-offset-2 transition-colors hover:text-primary-hover"
              type="button"
              onClick={onSwitchToManual}
            >
              Clique aqui
            </button>
            .
          </p>
        ) : null}
        <p
          className={`mt-2 break-all text-sm text-gray-300 ${
            shouldHighlightSelectedNumbers ? 'selected-numbers-limit-flash' : ''
          }`}
        >
          {formattedSelectedNumbers.slice(0, 20).join(', ') || 'Nenhum numero selecionado.'}
          {selectedNumbers.length > 20 ? ` ... +${selectedNumbers.length - 20}` : ''}
        </p>
      </div>

    </div>
  )
}
