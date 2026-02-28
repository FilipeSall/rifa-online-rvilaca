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
            <span className="inline-flex items-center rounded-full border border-neon-pink/40 bg-neon-pink/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-neon-pink">
              Pagina de compra de numeros
            </span>
            <h1 className="mt-5 text-3xl font-luxury font-bold leading-tight lg:text-5xl">
              Escolha suas cotas e
              <span className="text-neon-pink"> garanta sua chance</span> no sorteio.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-gray-300 lg:text-base">
              Fluxo otimizado para finalizar em menos de 60 segundos: selecione a quantidade, reserve por 5 minutos
              e pague com PIX automatico.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 lg:flex-1 lg:gap-4">
            <div className="rounded-xl border border-white/10 bg-luxury-card p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Valor da cota</p>
              <p className="mt-2 text-2xl font-black text-neon-cyan">{formatCurrency(unitPrice)}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
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
