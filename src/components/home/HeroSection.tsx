import { useHeroSection } from '../../hooks/useHeroSection'

export default function HeroSection() {
  const { animatedSoldPercentage, countdownItems, handleOpenBuyModal } = useHeroSection()

  return (
    <section className="relative pt-12 pb-20 lg:pt-24 lg:pb-32 overflow-hidden hero-bg">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-gold/5 to-transparent pointer-events-none" />
      <div className="container relative z-10 mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 flex flex-col gap-6 order-2 lg:order-1">
            {/* Badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/40 px-3 py-1 text-[10px] font-bold text-red-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-2" /> Edição Limitada
              </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl lg:text-5xl font-luxury font-black leading-tight text-white">
              Sorteio{' '}
              <span className="text-gold">BMW R1200</span>
              <span className="block">
                <span className="text-gold">GS</span>{' '}
                <span className="text-white">+ Honda CG 160</span>
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base text-gray-300 font-light leading-relaxed max-w-xl">
              Além das motos, você concorre a{' '}
              <span className="text-gold font-semibold">R$ 20.000 em PIX</span>. A sua chance de
              mudar de vida por um valor simbólico!
            </p>

            {/* Progress bar */}
            <div className="bg-luxury-card/50 backdrop-blur border border-white/10 p-5 rounded-xl max-w-lg mt-2">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-orange-400">🔥 Alta demanda agora!</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-red-500 font-mono">{animatedSoldPercentage}% VENDIDO</span>
                  <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                    Acabando!
                  </span>
                </div>
              </div>
              <div className="h-3 w-full rounded-full bg-gray-800 overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 relative z-10 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                  style={{ width: `${animatedSoldPercentage}%` }}
                >
                  <div
                    className="absolute inset-0 bg-white/20 animate-shimmer rounded-full"
                    style={{
                      backgroundImage:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-orange-400/80 mt-2 text-center uppercase tracking-wider font-semibold">
                ⚠ Restam poucos números da sorte!
              </p>
            </div>

            {/* Countdown */}
            <div className="grid grid-cols-4 gap-4 max-w-md mt-2">
              {countdownItems.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <span className="block text-2xl font-black text-white font-mono">{value}</span>
                  <span className="text-[10px] uppercase text-gray-500 tracking-wider">{label}</span>
                </div>
              ))}
            </div>

            {/* CTA button + secure payment */}
            <div className="mt-2 flex flex-col gap-3 max-w-lg">
              <button
                className="inline-flex w-full h-16 items-center justify-center rounded-xl bg-green-500 px-8 text-base font-black text-white transition-all hover:bg-green-400 hover:scale-[1.02] shadow-[0_0_30px_rgba(34,197,94,0.4)] uppercase tracking-widest gap-3"
                type="button"
                onClick={handleOpenBuyModal}
              >
                <span className="material-symbols-outlined text-2xl">confirmation_number</span>
                Comprar Números Agora
              </button>
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <span className="material-symbols-outlined text-green-500 text-base">verified_user</span>
                <span className="text-xs">Compra 100% segura e processada instantaneamente.</span>
              </div>
            </div>
          </div>

          {/* Moto image */}
          <div className="lg:col-span-6 relative order-1 lg:order-2">
            <div className="absolute inset-0 bg-gold/20 blur-[100px] rounded-full opacity-20" />
            <div className="relative z-10 aspect-square w-full">
              {/* Main BMW image with overlay */}
              <div className="relative w-full h-full">
                <img
                  alt="BMW R1200 GS Triple Black motorcycle"
                  className="w-full h-full object-contain drop-shadow-2xl"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDaQF11hNB5K8OrSxcTvxNOx5hgNg1ADcoHxYzDLBIsbbeH_5iAWjd-AboztLottNaaNPlPIG8UHvAY3crWR6zGTWK4JgzYQlU1JEadKFDe4wimQeFcTl4nboPuYNSoQTsiCiz7CpWKyN_0iqn0DGk3AZdWYkzXlhPtcL7sV1mbKzzCTpG52RRuJq1dIaFlCWEsVWKWA2g1tkKXaBW_yIdfhx3OzWszMoNNcpteERd6bjDmzkNMWQKl5nsaiOmrgyfxwyWII69GMJ6g"
                />

                {/* Stars + moto name overlay — bottom of the image */}
                <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 flex flex-col gap-2">
                  {/* Stars */}
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className="w-7 h-7 text-yellow-400 drop-shadow-lg"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  {/* Moto name */}
                  <div>
                    <p
                      className="text-white font-black text-4xl lg:text-5xl leading-none drop-shadow-lg"
                      style={{ textShadow: '0 3px 16px rgba(0,0,0,1)' }}
                    >
                      BMW R1200 GS
                    </p>
                    <p
                      className="text-gold text-base font-bold tracking-[0.2em] uppercase mt-1"
                      style={{ textShadow: '0 2px 12px rgba(0,0,0,1)' }}
                    >
                      Triple Black
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
