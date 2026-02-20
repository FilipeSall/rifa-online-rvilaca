import { useHeroSection } from '../../hooks/useHeroSection'

export default function HeroSection() {
  const { animatedSoldPercentage, countdownItems, handleOpenBuyModal } = useHeroSection()

  return (
    <section className="relative pt-12 pb-20 lg:pt-24 lg:pb-32 overflow-hidden hero-bg">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-gold/5 to-transparent pointer-events-none" />
      <div className="container relative z-10 mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 flex flex-col gap-6 order-2 lg:order-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-gold/10 border border-gold/30 px-3 py-1 text-[10px] font-bold text-gold uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse mr-2" /> Edição Limitada
              </span>
            </div>

            <h1 className="text-4xl lg:text-6xl font-luxury font-black leading-tight text-white">
              GANHE UMA <span className="text-gold-gradient block">BMW R 1200 GS</span> E MUITO MAIS!
            </h1>

            <p className="text-lg text-gray-400 font-light leading-relaxed max-w-xl">
              Participe da rifa mais exclusiva do Brasil. Transparência total via Loteria Federal, auditoria em
              tempo real e entrega garantida.
            </p>

            <div className="bg-luxury-card/50 backdrop-blur border border-white/10 p-6 rounded-xl max-w-lg mt-4">
              <div className="flex justify-between items-end mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cotas Vendidas</span>
                <span className="text-2xl font-bold text-gold font-mono">{animatedSoldPercentage}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden relative">
                <div
                  className="h-full bg-gold relative z-10 shadow-[0_0_10px_rgba(245,168,0,0.5)]"
                  style={{ width: `${animatedSoldPercentage}%` }}
                >
                  <div
                    className="absolute inset-0 bg-white/20 animate-shimmer"
                    style={{
                      backgroundImage:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 text-right uppercase tracking-wider">
                Finalizando em breve
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4 max-w-md mt-2">
              {countdownItems.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <span className="block text-2xl font-bold text-white font-mono">{value}</span>
                  <span className="text-[10px] uppercase text-gray-500 tracking-wider">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <button
                className="inline-flex h-14 items-center justify-center rounded bg-gold px-8 text-sm font-black text-black transition-all hover:bg-gold-hover hover:scale-[1.02] shadow-glow-gold uppercase tracking-widest"
                type="button"
                onClick={handleOpenBuyModal}
              >
                Comprar Números
              </button>
              <a
                className="inline-flex h-14 items-center justify-center rounded border border-white/20 px-8 text-sm font-bold text-white transition-all hover:bg-white/5 uppercase tracking-widest"
                href="#como-funciona"
              >
                Ver Detalhes
              </a>
            </div>
          </div>

          <div className="lg:col-span-6 relative order-1 lg:order-2">
            <div className="absolute inset-0 bg-gold/20 blur-[100px] rounded-full opacity-20" />
            <div className="relative z-10 aspect-square w-full">
              <img
                alt="Black BMW R1200 GS motorcycle"
                className="w-full h-full object-contain drop-shadow-2xl"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDaQF11hNB5K8OrSxcTvxNOx5hgNg1ADcoHxYzDLBIsbbeH_5iAWjd-AboztLottNaaNPlPIG8UHvAY3crWR6zGTWK4JgzYQlU1JEadKFDe4wimQeFcTl4nboPuYNSoQTsiCiz7CpWKyN_0iqn0DGk3AZdWYkzXlhPtcL7sV1mbKzzCTpG52RRuJq1dIaFlCWEsVWKWA2g1tkKXaBW_yIdfhx3OzWszMoNNcpteERd6bjDmzkNMWQKl5nsaiOmrgyfxwyWII69GMJ6g"
              />
            </div>
            <div className="absolute bottom-4 right-0 md:right-10 bg-luxury-card border border-gold/30 p-4 rounded-lg shadow-xl max-w-[200px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-gold">verified</span>
                <span className="text-xs font-bold text-white">IPVA 2024 PAGO</span>
              </div>
              <p className="text-[10px] text-gray-400">Documentação e transferência por nossa conta.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
