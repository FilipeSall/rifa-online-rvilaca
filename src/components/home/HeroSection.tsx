import { useCallback, useState } from 'react'
import { useHeroSection } from '../../hooks/useHeroSection'
import { CAMPAIGN_SOLD_COTAS, CAMPAIGN_TOTAL_COTAS } from '../../const/home'
import slideOne from '../../assets/IMG_9379.webp'
import slideTwo from '../../assets/IMG_9400.webp'
import slideThree from '../../assets/IMG_9390.webp'
import Skeleton from 'react-loading-skeleton'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay } from 'swiper/modules'
import 'swiper/css'
import 'react-loading-skeleton/dist/skeleton.css'

const HERO_CAROUSEL_IMAGES = [slideOne, slideTwo, slideThree]

export default function HeroSection() {
  const { animatedSoldPercentage, countdownItems, handleOpenBuyModal } = useHeroSection()
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const soldCotasFormatted = CAMPAIGN_SOLD_COTAS.toLocaleString('pt-BR')
  const totalCotasFormatted = CAMPAIGN_TOTAL_COTAS.toLocaleString('pt-BR')
  const handleImageLoaded = useCallback((imageSrc: string) => {
    setLoadedImages((currentState) => {
      if (currentState[imageSrc]) {
        return currentState
      }

      return {
        ...currentState,
        [imageSrc]: true,
      }
    })
  }, [])

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
            <h1 className="text-5xl lg:text-6xl font-luxury font-black leading-tight text-white">
              Sorteio{' '}
              <span className="text-gold">BMW R1200</span>
              <span className="block">
                <span className="text-gold">GS</span>
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base text-gray-300 font-light leading-relaxed max-w-xl">
              Além da <span className="text-gold font-semibold">BMW R1200 GS</span>, você também
              concorre a <span className="text-gold font-semibold">uma Honda CG Start 160</span> e{' '}
              <span className="text-gold font-semibold">20 PIX de R$ 1.000</span>. Sorteio com
              transparência total: apuração pela Loteria Federal e validação por algoritmo auditável.
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
              <p className="text-[11px] text-gray-300 mt-2 text-center">
                {soldCotasFormatted} de {totalCotasFormatted} cotas já vendidas
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
            <div className="relative z-10 w-full max-w-[680px] mx-auto aspect-square hero-carousel-frame">
              <Swiper
                modules={[Autoplay]}
                autoplay={{
                  delay: 5000,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: true,
                }}
                className="hero-carousel-swiper"
                loop
                slidesPerView={1}
                speed={700}
              >
                {HERO_CAROUSEL_IMAGES.map((imageSrc, index) => (
                  <SwiperSlide key={imageSrc} className="relative h-full">
                    {!loadedImages[imageSrc] ? (
                      <div className="absolute inset-0 z-10">
                        <Skeleton
                          baseColor="rgba(17, 24, 39, 0.95)"
                          className="block h-full w-full"
                          highlightColor="rgba(55, 65, 81, 0.75)"
                        />
                      </div>
                    ) : null}
                    <img
                      alt={`BMW R1200 GS slide ${index + 1}`}
                      className={`h-full w-full object-cover transition-opacity duration-500 ${
                        loadedImages[imageSrc] ? 'opacity-100' : 'opacity-0'
                      }`}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      onError={() => handleImageLoaded(imageSrc)}
                      onLoad={() => handleImageLoaded(imageSrc)}
                      src={imageSrc}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>

              {/* Stars + moto name overlay — bottom of the image */}
              <div className="absolute z-20 bottom-0 left-0 right-0 px-6 pb-4 flex flex-col gap-2 pointer-events-none">
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
    </section>
  )
}
