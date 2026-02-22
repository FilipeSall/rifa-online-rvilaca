import { PURCHASE_PACKS } from '../../const/purchaseNumbers'

type QuantitySelectionCardProps = {
  quantity: number
  minQuantity: number
  maxSelectable: number
  onSetQuantity: (value: number) => void
}

export default function QuantitySelectionCard({
  quantity,
  minQuantity,
  maxSelectable,
  onSetQuantity,
}: QuantitySelectionCardProps) {
  const effectivePacks = [minQuantity, ...PURCHASE_PACKS.filter((p) => p > minQuantity)].slice(0, 4)

  return (
    <article className="rounded-2xl border border-white/10 bg-luxury-card/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">1. Quantidade de cotas</p>
          <h2 className="mt-2 text-xl font-bold text-white">Defina quantos numeros deseja comprar</h2>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {effectivePacks.map((pack) => (
          <button
            key={pack}
            className={`rounded-lg border px-4 py-4 text-left transition-all ${
              quantity === pack
                ? 'border-gold bg-gold/10 text-gold shadow-glow-gold'
                : 'border-white/10 bg-luxury-bg text-white hover:border-gold/50'
            }`}
            type="button"
            onClick={() => onSetQuantity(pack)}
          >
            <p className="text-lg font-black">+{pack}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Numeros</p>
          </button>
        ))}
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
            className="h-10 w-24 rounded border border-white/15 bg-luxury-card text-center font-bold text-white outline-none focus:border-gold"
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
