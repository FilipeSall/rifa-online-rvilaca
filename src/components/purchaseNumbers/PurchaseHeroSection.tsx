import { MIN_QUANTITY } from '../../const/purchaseNumbers'
import { formatCurrency } from '../../utils/purchaseNumbers'

type PurchaseHeroSectionProps = {
  unitPrice: number
}

export default function PurchaseHeroSection({ unitPrice }: PurchaseHeroSectionProps) {
  return (
    <section className="hero-bg border-b border-white/5">
      <div className="container mx-auto px-4 py-14 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
              Pagina de compra de numeros
            </span>
            <h1 className="mt-5 text-3xl font-luxury font-bold leading-tight lg:text-5xl">
              Escolha suas cotas e
              <span className="text-gold"> garanta sua chance</span> no sorteio.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-gray-300 lg:text-base">
              Fluxo otimizado para finalizar em menos de 60 segundos: selecione a quantidade, reserve por 10 minutos
              e pague com PIX automatico.
            </p>
          </div>

          <div className="grid w-full max-w-sm grid-cols-2 gap-3 lg:gap-4">
            <div className="rounded-xl border border-white/10 bg-luxury-card p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Valor da cota</p>
              <p className="mt-2 text-2xl font-black text-gold">{formatCurrency(unitPrice)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-luxury-card p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Compra minima</p>
              <p className="mt-2 text-2xl font-black text-white">{MIN_QUANTITY}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Status do pagamento</p>
              <p className="mt-2 text-sm font-semibold text-emerald-100">
                Numeros so pertencem ao comprador apos confirmacao PIX.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
