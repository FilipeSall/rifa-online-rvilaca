import { useCallback, useMemo, useState } from 'react'
import { useHeroSection } from '../../hooks/useHeroSection'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { DEFAULT_BONUS_PRIZE, DEFAULT_CAMPAIGN_TITLE, DEFAULT_MAIN_PRIZE, DEFAULT_SECOND_PRIZE } from '../../const/campaign'
import { usePublicSalesSnapshot } from '../../hooks/usePublicSalesSnapshot'
import { useAuthStore } from '../../stores/authStore'
import Skeleton from 'react-loading-skeleton'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import 'react-loading-skeleton/dist/skeleton.css'

function getDemandMessaging(soldPercentage: number, isCampaignNotStarted: boolean) {
  if (isCampaignNotStarted) {
    return {
      badge: 'Campanha em preparacao',
      chip: 'Lançamento em breve',
      helper: 'Em breve iremos comecar uma campanha. Fique atento para garantir seus numeros na abertura oficial.',
    }
  }

  if (soldPercentage >= 85) {
    return {
      badge: 'Reta final de cotas',
      chip: 'Fechamento próximo',
      helper: 'Fase final da campanha: disponibilidade cada vez mais limitada.',
    }
  }

  if (soldPercentage >= 65) {
    return {
      badge: 'Movimento intenso de compras',
      chip: 'Disponibilidade reduzindo',
      helper: 'A seleção ainda está aberta, mas com menos opções a cada atualização.',
    }
  }

  if (soldPercentage >= 40) {
    return {
      badge: 'Alta procura nesta edição',
      chip: 'Lote em destaque',
      helper: 'A campanha entrou no trecho de maior tração de vendas.',
    }
  }

  if (soldPercentage >= 15) {
    return {
      badge: 'Procura em crescimento',
      chip: 'Ritmo consistente',
      helper: 'As cotas seguem avançando com estabilidade ao longo do dia.',
    }
  }

  return {
    badge: 'Lote aberto para participação',
    chip: 'Início de campanha',
    helper: 'Momento favorável para escolher números com mais liberdade.',
  }
}

export default function HeroSection() {
  const {
    soldNumbers: soldNumbersRaw,
    totalNumbers: totalNumbersRaw,
    soldPercentage,
  } = usePublicSalesSnapshot()
  const {
    animatedSoldPercentage,
    countdownItems,
    countdownDisplayState,
    handleOpenBuyModal,
    handleOpenCampaignSettings,
  } = useHeroSection(
    soldPercentage,
  )
  const { campaign } = useCampaignSettings()
  const userRole = useAuthStore((state) => state.userRole)
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const campaignTitle = campaign.title || DEFAULT_CAMPAIGN_TITLE
  const mainPrize = campaign.mainPrize || DEFAULT_MAIN_PRIZE
  const secondPrize = campaign.secondPrize || DEFAULT_SECOND_PRIZE
  const bonusPrize = campaign.bonusPrize || DEFAULT_BONUS_PRIZE
  const campaignTitleParts = campaignTitle.trim().split(/\s+/).filter(Boolean)
  const campaignTitlePrefix =
    campaignTitleParts.length > 2 ? campaignTitleParts.slice(0, -2).join(' ') : campaignTitleParts.join(' ')
  const campaignTitleHighlight = campaignTitleParts.length > 2 ? campaignTitleParts.slice(-2).join(' ') : ''
  const soldNumbers = soldNumbersRaw
  const totalNumbers = Number.isInteger(campaign.totalNumbers) && campaign.totalNumbers > 0
    ? campaign.totalNumbers
    : totalNumbersRaw
  const soldCotasFormatted = soldNumbers.toLocaleString('pt-BR')
  const totalCotasFormatted = totalNumbers.toLocaleString('pt-BR')
  const isCampaignNotStarted = countdownDisplayState.mode === 'start' || campaign.status === 'scheduled'
  const demandMessaging = getDemandMessaging(soldPercentage, isCampaignNotStarted)
  const shouldShowAdminCampaignHint = userRole === 'admin'
    && countdownDisplayState.mode === 'hidden'
    && !campaign.startsAt
    && !campaign.endsAt
  const heroCarouselImages = useMemo(() => {
    return campaign.midias.heroCarousel
      .filter((item) => item.active && !!item.url)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        src: item.url,
        alt: item.alt || `Slide da campanha ${index + 1}`,
      }))
  }, [campaign.midias.heroCarousel])

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
            <h1 className="w-full text-5xl lg:text-6xl font-luxury font-black leading-tight text-white">
              {campaignTitleHighlight ? (
                <>
                  {campaignTitlePrefix} <span className="text-gold">{campaignTitleHighlight}</span>
                </>
              ) : (
                campaignTitlePrefix
              )}
            </h1>

            {/* Subtitle */}
            <p className="w-full max-w-none text-base font-light leading-relaxed text-gray-300">
              Além de <span className="text-gold font-semibold">{mainPrize}</span>, você também concorre a{' '}
              <span className="text-gold font-semibold">{secondPrize}</span> e{' '}
              <span className="text-gold font-semibold">{bonusPrize}</span>. Sorteio com transparência total:
              apuração pela Loteria Federal e validação por algoritmo auditável.
            </p>

            {/* Progress bar */}
            <div className="hero-sales-card mt-2 w-full lg:max-w-lg">
              <span className="hero-edge-badge hero-edge-badge-left">🔥 {demandMessaging.badge}</span>
              <span className="hero-edge-badge hero-edge-badge-right">{demandMessaging.chip}</span>
              <div className="hero-sales-header">
                <span className="hero-demand-percentage">{animatedSoldPercentage}% vendido</span>
              </div>
              <div className="hero-progress-track">
                <div
                  className="hero-progress-fill"
                  style={{ width: `${animatedSoldPercentage}%` }}
                >
                  <span className="hero-progress-spark" aria-hidden="true" />
                  <span className="hero-progress-sheen" aria-hidden="true" />
                </div>
              </div>
              <p className="hero-demand-helper">
                {demandMessaging.helper}
              </p>
              <p className="hero-demand-footnote">
                {soldCotasFormatted} de {totalCotasFormatted} cotas já vendidas
              </p>
            </div>

            {/* Countdown */}
            <div className="mt-2 w-full lg:max-w-lg">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold">{countdownDisplayState.title}</p>
              <p className="mt-1 text-xs text-gray-400">{countdownDisplayState.helper}</p>
              {countdownDisplayState.mode !== 'hidden' ? (
                <div className="mt-3 grid grid-cols-4 gap-4">
                  {countdownItems.map(({ value, label }) => (
                    <div key={label} className="hero-countdown-card text-center">
                      <span className="hero-countdown-value">{value}</span>
                      <span className="hero-countdown-label">{label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {shouldShowAdminCampaignHint ? (
                <div className="mt-4 rounded-xl border border-cyan-300/35 bg-cyan-500/10 p-4">
                  <p className="text-xs font-semibold text-cyan-100">
                    Admin: defina inicio e fim da campanha para liberar o contador e a comunicacao para os usuarios.
                  </p>
                  <button
                    className="mt-3 inline-flex h-10 items-center rounded-lg border border-cyan-200/60 bg-cyan-300 px-4 text-[11px] font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95"
                    type="button"
                    onClick={handleOpenCampaignSettings}
                  >
                    Configurar campanha no dashboard
                  </button>
                </div>
              ) : null}
            </div>

            {/* CTA button + secure payment */}
            <div className="mt-2 flex w-full flex-col gap-3 lg:max-w-lg">
              <button
                className="inline-flex w-full h-16 items-center justify-center rounded-xl bg-gold px-8 text-base font-black text-black transition-all hover:bg-yellow-400 hover:scale-[1.02] shadow-[0_0_30px_rgba(245,168,0,0.4)] uppercase tracking-widest gap-3"
                type="button"
                onClick={handleOpenBuyModal}
              >
                <span className="material-symbols-outlined text-2xl">confirmation_number</span>
                Comprar Números Agora
              </button>
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <span className="material-symbols-outlined text-gold text-base">verified_user</span>
                <span className="text-xs">Compra 100% segura e processada instantaneamente.</span>
              </div>
            </div>
          </div>

          {/* Moto image */}
          <div className="lg:col-span-6 relative order-1 lg:order-2">
            <div className="absolute inset-0 bg-gold/20 blur-[100px] rounded-full opacity-20" />
            <div className="relative z-10 w-full max-w-[680px] mx-auto aspect-square hero-carousel-frame">
              {heroCarouselImages.length > 0 ? (
                <Swiper
                  modules={[Autoplay, Pagination]}
                  autoplay={heroCarouselImages.length > 1 ? {
                    delay: 5000,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                  } : false}
                  className="hero-carousel-swiper"
                  loop={heroCarouselImages.length > 1}
                  pagination={{
                    clickable: true,
                  }}
                  slidesPerView={1}
                  speed={700}
                >
                  {heroCarouselImages.map((image, index) => (
                    <SwiperSlide key={`${image.src}-${index}`} className="relative h-full">
                      <div className="hero-carousel-slide-overlay" aria-hidden="true" />
                      {!loadedImages[image.src] ? (
                        <div className="absolute inset-0 z-10">
                          <Skeleton
                            baseColor="rgba(17, 24, 39, 0.95)"
                            className="block h-full w-full"
                            highlightColor="rgba(55, 65, 81, 0.75)"
                          />
                        </div>
                      ) : null}
                      <img
                        alt={image.alt}
                        className={`hero-carousel-image transition-opacity duration-500 ${
                          loadedImages[image.src] ? 'opacity-100' : 'opacity-0'
                        }`}
                        loading={index === 0 ? 'eager' : 'lazy'}
                        onError={() => handleImageLoaded(image.src)}
                        onLoad={() => handleImageLoaded(image.src)}
                        src={image.src}
                      />
                    </SwiperSlide>
                  ))}
                </Swiper>
              ) : (
                <div
                  aria-hidden="true"
                  className="h-full w-full rounded-[28px] border border-white/10 bg-black/35"
                />
              )}

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
                    {mainPrize}
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
