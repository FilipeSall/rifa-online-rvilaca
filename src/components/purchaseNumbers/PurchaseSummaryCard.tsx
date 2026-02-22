import { Link } from 'react-router-dom'
import { MIN_QUANTITY } from '../../const/purchaseNumbers'
import type { CouponFeedback } from '../../types/purchaseNumbers'
import { formatCurrency, formatTimer } from '../../utils/purchaseNumbers'

type PurchaseSummaryCardProps = {
  selectedCount: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  totalAmount: number
  appliedCoupon: string | null
  couponCode: string
  couponFeedback: CouponFeedback | null
  couponHint: string
  reservationSeconds: number | null
  hasExpiredReservation: boolean
  canProceed: boolean
  isReserving: boolean
  selectedNumbers: number[]
  onCouponCodeChange: (value: string) => void
  onApplyCoupon: () => void
  onProceed: () => void
}

export default function PurchaseSummaryCard({
  selectedCount,
  unitPrice,
  subtotal,
  discountAmount,
  totalAmount,
  appliedCoupon,
  couponCode,
  couponFeedback,
  couponHint,
  reservationSeconds,
  hasExpiredReservation,
  canProceed,
  isReserving,
  selectedNumbers,
  onCouponCodeChange,
  onApplyCoupon,
  onProceed,
}: PurchaseSummaryCardProps) {
  return (
    <div className="sticky top-24 rounded-2xl border border-gold/25 bg-luxury-card p-6 shadow-2xl">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">3. Carrinho</p>
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
        <div className="mt-2 flex gap-2">
          <input
            id="coupon-code"
            className="h-10 flex-1 rounded border border-white/15 bg-luxury-card px-3 text-sm text-white outline-none focus:border-gold"
            type="text"
            placeholder="Ex: PIX10"
            value={couponCode}
            onChange={(event) => onCouponCodeChange(event.target.value)}
          />
          <button
            className="h-10 rounded bg-gold px-4 text-xs font-black uppercase tracking-widest text-black hover:bg-gold-hover"
            type="button"
            onClick={onApplyCoupon}
          >
            Aplicar
          </button>
        </div>
        <p className={`mt-2 text-xs ${couponFeedback?.tone === 'success' ? 'text-emerald-300' : 'text-gray-400'}`}>
          {couponFeedback?.message ?? couponHint}
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.18em] text-gray-500">Valor total</span>
          <span className="text-2xl font-black text-gold">{formatCurrency(totalAmount)}</span>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Compra minima de {MIN_QUANTITY} cotas. Numeros confirmados apos pagamento aprovado.
        </p>
      </div>

      {reservationSeconds !== null ? (
        <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-500/10 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200">Reserva ativa</p>
          <p className="mt-2 text-xl font-black text-white">{formatTimer(reservationSeconds)}</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Seus numeros ficam bloqueados por tempo limitado ate finalizar o PIX.
          </p>
        </div>
      ) : null}

      {hasExpiredReservation ? (
        <div className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 p-3 text-xs text-red-100">
          Sua reserva expirou. Reserve novamente para garantir os numeros.
        </div>
      ) : null}

      <button
        className="mt-5 h-12 w-full rounded-xl bg-green-500 px-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        disabled={!canProceed || isReserving}
        onClick={onProceed}
      >
        {isReserving ? 'Reservando...' : reservationSeconds === null ? 'Reservar por 10 min' : 'Ir para pagamento PIX'}
      </button>

      <p className="mt-3 text-[11px] text-gray-500">
        Ao continuar, voce concorda com o regulamento e com as regras de sorteio auditavel.
      </p>

      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Numeros selecionados</p>
        <p className="mt-2 break-all text-sm text-gray-300">
          {selectedNumbers.slice(0, 20).join(', ') || 'Nenhum numero selecionado.'}
          {selectedNumbers.length > 20 ? ` ... +${selectedNumbers.length - 20}` : ''}
        </p>
      </div>

      <Link
        className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold hover:text-gold-light"
        to="/"
      >
        <span className="material-symbols-outlined text-sm">arrow_back</span>
        Voltar para home
      </Link>
    </div>
  )
}
