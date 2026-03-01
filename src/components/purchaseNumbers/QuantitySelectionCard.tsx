import type { CampaignFeaturedPromotion } from '../../types/campaign'

type QuantitySelectionCardProps = {
  quantity: number
  packQuantities: number[]
  featuredPromotion: CampaignFeaturedPromotion | null
  mostPurchasedPackQuantities: number[]
  discountPackQuantities: number[]
  minQuantity: number
  maxSelectable: number
  onSetQuantity: (value: number) => void
}

export default function QuantitySelectionCard({
  quantity,
  packQuantities,
  featuredPromotion,
  mostPurchasedPackQuantities,
  discountPackQuantities,
  minQuantity,
  maxSelectable,
  onSetQuantity,
}: QuantitySelectionCardProps) {
  const suggestedPacks = Array.from(new Set(
    packQuantities.filter((pack) => pack >= minQuantity && pack <= maxSelectable),
  )).sort((left, right) => left - right)
  const effectivePacks = suggestedPacks.slice(0, 8)
  const hasProgressiveDiscount = Boolean(
    featuredPromotion
    && featuredPromotion.active
    && featuredPromotion.discountValue > 0,
  )

  return (
    <article className="rounded-2xl border border-white/10 bg-luxury-card/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">1. Quantidade de cotas</p>
          <h2 className="mt-2 text-xl font-bold text-white">Defina quantos numeros deseja comprar</h2>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4">
        {effectivePacks.map((pack) => {
          const isMostPurchasedPack = mostPurchasedPackQuantities.includes(pack)
          const isDiscountPack = discountPackQuantities.includes(pack)
            || (hasProgressiveDiscount && featuredPromotion !== null && pack >= featuredPromotion.targetQuantity)
          const shouldShowBadge = isMostPurchasedPack || isDiscountPack

          return (
            <div key={pack} className="relative">
              {shouldShowBadge ? (
                <span className={`pointer-events-none absolute -top-2 left-1/2 z-10 inline-flex w-[70%] -translate-x-1/2 items-center justify-center rounded-md border px-2.5 py-0.5 text-center text-[8px] font-black uppercase tracking-[0.09em] text-black ${
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
                className={`relative w-full overflow-hidden rounded-lg border px-4 py-4 text-left transition-all ${
                  quantity === pack
                    ? 'border-neon-pink bg-neon-pink/10 text-neon-pink'
                    : 'border-white/10 bg-luxury-bg text-white hover:border-neon-pink/50'
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
                <p className="text-lg font-black">+{pack}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Numeros</p>
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-4 rounded-lg border border-white/10 bg-luxury-bg p-4 md:flex-row md:items-center md:justify-between">
        <label className="text-xs uppercase tracking-[0.18em] text-gray-400" htmlFor="quantity-input">
          Ajuste personalizado
        </label>
        <div className="flex items-center gap-2">
          <button
            className="h-10 w-10 rounded bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
            type="button"
            onClick={() => onSetQuantity(quantity - 1)}
            disabled={quantity <= minQuantity}
          >
            -
          </button>
          <input
            id="quantity-input"
            className="h-10 w-24 rounded border border-white/15 bg-luxury-card text-center font-bold text-white outline-none focus:border-neon-pink"
            min={minQuantity}
            max={maxSelectable}
            type="number"
            value={quantity}
            onChange={(event) => onSetQuantity(Number(event.target.value || minQuantity))}
          />
          <button
            className="h-10 w-10 rounded bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
            type="button"
            onClick={() => onSetQuantity(quantity + 1)}
            disabled={quantity >= maxSelectable}
          >
            +
          </button>
        </div>
      </div>
    </article>
  )
}
