import { formatCurrency } from '../../utils/purchaseNumbers'

export type PackPricingByQuantity = Record<number, {
  subtotalBase: number
  subtotalAfterPromotion: number
  promotionDiscount: number
}>

type QuantitySelectionCardProps = {
  quantity: number
  packQuantities: number[]
  mostPurchasedPackQuantities: number[]
  discountPackQuantities: number[]
  packPricingByQuantity: PackPricingByQuantity
  minQuantity: number
  maxSelectable: number
  onSetQuantity: (value: number) => void
}

export default function QuantitySelectionCard({
  quantity,
  packQuantities,
  mostPurchasedPackQuantities,
  discountPackQuantities,
  packPricingByQuantity,
  minQuantity,
  maxSelectable,
  onSetQuantity,
}: QuantitySelectionCardProps) {
  const suggestedPacks = Array.from(new Set(
    packQuantities.filter((pack) => pack >= minQuantity && pack <= maxSelectable),
  )).sort((left, right) => left - right)
  const effectivePacks = suggestedPacks.slice(0, 8)
  return (
    <article className="relative overflow-visible rounded-2xl border border-white/15 bg-[linear-gradient(140deg,rgba(20,12,34,0.9),rgba(7,13,29,0.9))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.48)] ring-1 ring-white/5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-neon-pink/20 blur-3xl" />
        <div className="absolute -left-14 -bottom-16 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.12),transparent_35%)]" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Selecao rapida</p>
            <h2 className="mt-1 text-xl font-black text-white">Defina quantos numeros deseja comprar</h2>
          </div>
          <span className="inline-flex items-center rounded-full border border-white/30 bg-[#241338] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-300">
            {effectivePacks.length} opcoes
          </span>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4 md:gap-y-7">
          {effectivePacks.map((pack) => {
            const isMostPurchasedPack = mostPurchasedPackQuantities.includes(pack)
            const isDiscountPack = discountPackQuantities.includes(pack)
            const shouldShowBadge = isMostPurchasedPack || isDiscountPack
            const packPricing = packPricingByQuantity[pack]
            const hasPricing = Boolean(packPricing)
            const hasPromotionDiscount = (packPricing?.promotionDiscount ?? 0) > 0

            return (
              <div key={pack} className="group relative">
                {shouldShowBadge ? (
                  <span className={`pointer-events-none absolute left-1/2 top-0 z-10 inline-flex w-[75%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border px-2.5 py-0.5 text-center text-[8px] font-black uppercase tracking-[0.09em] text-black ${
                    isMostPurchasedPack
                      ? 'border-amber-300 bg-[linear-gradient(120deg,rgb(252,211,77),rgb(245,158,11))] shadow-[0_8px_18px_rgba(245,158,11,0.35)]'
                      : 'border-emerald-200 bg-[linear-gradient(120deg,rgb(110,231,183),rgb(16,185,129))] shadow-[0_8px_18px_rgba(16,185,129,0.22)]'
                  }`}>
                    {isMostPurchasedPack ? (
                      <span className="text-[8px] leading-none">Mais vendidos</span>
                    ) : (
                      <span className="text-[8px] leading-none">Desconto</span>
                    )}
                  </span>
                ) : null}
                <button
                  className={`relative w-full overflow-hidden rounded-xl border px-4 py-3.5 text-left transition-all duration-300 ${
                    quantity === pack
                      ? 'border-neon-pink/90 bg-[linear-gradient(140deg,rgba(255,0,204,0.16),rgba(6,14,28,0.98))] text-neon-pink shadow-[0_0_0_1px_rgba(255,0,204,0.35),0_14px_28px_rgba(255,0,204,0.2)]'
                      : 'border-white/15 bg-[linear-gradient(160deg,rgba(15,23,42,0.9),rgba(8,13,24,0.95))] text-white hover:-translate-y-0.5 hover:border-cyan-300/45 hover:shadow-[0_14px_30px_rgba(34,211,238,0.14)]'
                  }`}
                  type="button"
                  onClick={() => onSetQuantity(pack)}
                >
                  {shouldShowBadge ? (
                    <span className={`pointer-events-none absolute left-0 top-0 h-[2px] w-full ${
                      isMostPurchasedPack
                        ? 'bg-gradient-to-r from-amber-300 to-yellow-400'
                        : 'bg-gradient-to-r from-emerald-400 to-emerald-300'
                    }`} />
                  ) : null}
                  {quantity === pack ? (
                    <span className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-neon-pink shadow-[0_0_14px_rgba(255,0,204,0.85)]" />
                  ) : null}
                  <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.1),transparent_45%)]" />
                  <div className="relative z-10">
                    {hasPricing ? (
                      <>
                        {hasPromotionDiscount ? (
                          <p className={`text-[11px] font-semibold tracking-tight line-through decoration-1 ${quantity === pack ? 'text-neon-pink/70' : 'text-gray-500'}`}>
                            {formatCurrency(packPricing.subtotalBase)}
                          </p>
                        ) : null}
                        <p className="text-xl font-black tracking-tight">{formatCurrency(packPricing.subtotalAfterPromotion)}</p>
                        <p className={`mt-0.5 text-[10px] tracking-[0.12em] ${quantity === pack ? 'text-neon-pink/85' : 'text-gray-400'}`}>
                          {pack} numeros
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-black tracking-tight">+{pack}</p>
                        <p className={`mt-0.5 text-[10px] uppercase tracking-[0.18em] ${quantity === pack ? 'text-neon-pink/85' : 'text-gray-400'}`}>
                          Numeros
                        </p>
                      </>
                    )}
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(8,13,24,0.7),rgba(15,23,42,0.7))] p-4 md:flex-row md:items-center md:justify-between">
          <label className="text-xs uppercase tracking-[0.18em] text-gray-400" htmlFor="quantity-input">
            Ajuste personalizado
          </label>
          <div className="flex items-center gap-2">
            <button
              className="h-10 w-10 rounded-lg border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-40"
              type="button"
              onClick={() => onSetQuantity(quantity - 1)}
              disabled={quantity <= minQuantity}
            >
              -
            </button>
            <input
              id="quantity-input"
              className="h-10 w-24 rounded-lg border border-white/15 bg-black/25 text-center font-bold text-white outline-none transition focus:border-neon-pink"
              min={minQuantity}
              max={maxSelectable}
              type="number"
              value={quantity}
              onChange={(event) => onSetQuantity(Number(event.target.value || minQuantity))}
            />
            <button
              className="h-10 w-10 rounded-lg border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-40"
              type="button"
              onClick={() => onSetQuantity(quantity + 1)}
              disabled={quantity >= maxSelectable}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
