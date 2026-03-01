import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { DEFAULT_BONUS_PRIZE, DEFAULT_CAMPAIGN_TITLE, DEFAULT_MAIN_PRIZE, DEFAULT_SECOND_PRIZE } from '../../const/campaign'
import { calculateCampaignPricing } from '../../utils/campaignPricing'
import { formatCurrency } from '../../utils/purchaseNumbers'
import Skeleton from 'react-loading-skeleton'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import 'react-loading-skeleton/dist/skeleton.css'

type HeroSectionProps = {
  quantity: number
  packQuantities: number[]
  onSetQuantity: (value: number) => void
  onQuickCheckout: () => void
  isQuickCheckoutLoading: boolean
}

export default function HeroSection({
  quantity,
  packQuantities,
  onSetQuantity,
  onQuickCheckout,
  isQuickCheckoutLoading,
}: HeroSectionProps) {
  const { campaign } = useCampaignSettings()
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [heroSalesCardWidth, setHeroSalesCardWidth] = useState<number | null>(null)
  const heroQuickQuantityPacks = useMemo(
    () => packQuantities.filter((pack) => Number.isInteger(pack) && pack > 0).slice(0, 8),
    [packQuantities],
  )
  const campaignTitle = campaign.title || DEFAULT_CAMPAIGN_TITLE
  const mainPrize = campaign.mainPrize || DEFAULT_MAIN_PRIZE
  const secondPrize = campaign.secondPrize || DEFAULT_SECOND_PRIZE
  const bonusPrize = campaign.bonusPrize || DEFAULT_BONUS_PRIZE
  const campaignTitleParts = campaignTitle.trim().split(/\s+/).filter(Boolean)
  const campaignTitlePrefix =
    campaignTitleParts.length > 2 ? campaignTitleParts.slice(0, -2).join(' ') : campaignTitleParts.join(' ')
  const campaignTitleHighlight = campaignTitleParts.length > 2 ? campaignTitleParts.slice(-2).join(' ') : ''
  const heroScaledAlignedSectionStyle = heroSalesCardWidth
    ? { width: `${Math.round((heroSalesCardWidth / 2) * 1.75)}px` }
    : undefined
  const heroCarouselImages = useMemo(() => {
    return campaign.midias.heroCarousel
      .filter((item) => item.active && !!item.url)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        src: item.url,
        alt: item.alt || `Slide da campanha ${index + 1}`,
      }))
  }, [campaign.midias.heroCarousel])
  const activeFeaturedPromotion = useMemo(
    () => (campaign.featuredPromotion?.active ? campaign.featuredPromotion : null),
    [campaign.featuredPromotion],
  )
  const featuredPromotionInsight = useMemo(() => {
    if (!activeFeaturedPromotion) {
      return null
    }

    const pricing = calculateCampaignPricing(activeFeaturedPromotion.targetQuantity, {
      pricePerCota: campaign.pricePerCota,
      packPrices: campaign.packPrices,
      featuredPromotion: activeFeaturedPromotion,
    })

    const hasTooltip = pricing.promotionDiscount > 0
    const tooltip = hasTooltip
      ? (activeFeaturedPromotion.discountType === 'percent'
          ? `Economize ${activeFeaturedPromotion.discountValue}% nesse pacote e pague ${formatCurrency(pricing.subtotalAfterPromotion)}.`
          : `Economize ${formatCurrency(pricing.promotionDiscount)} nesse pacote e pague ${formatCurrency(pricing.subtotalAfterPromotion)}.`)
      : null

    return {
      targetQuantity: activeFeaturedPromotion.targetQuantity,
      label: activeFeaturedPromotion.label.trim() || 'Promocao ativa',
      tooltip,
      hasTooltip,
    }
  }, [activeFeaturedPromotion, campaign.packPrices, campaign.pricePerCota])

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const titleElement = titleRef.current
    if (!titleElement) {
      return
    }

    const updateHeroSalesCardWidth = () => {
      if (!window.matchMedia('(min-width: 1280px)').matches) {
        setHeroSalesCardWidth(null)
        return
      }

      const nextWidth = Math.round(titleElement.getBoundingClientRect().width)
      setHeroSalesCardWidth(nextWidth > 0 ? nextWidth : null)
    }

    updateHeroSalesCardWidth()
    window.addEventListener('resize', updateHeroSalesCardWidth)

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateHeroSalesCardWidth)
      : null
    resizeObserver?.observe(titleElement)

    return () => {
      window.removeEventListener('resize', updateHeroSalesCardWidth)
      resizeObserver?.disconnect()
    }
  }, [])

  return (
    <section className="relative overflow-hidden hero-bg pb-20 lg:pt-0 lg:h-[calc(100svh-7rem)] lg:py-4">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-neon-pink/5 to-transparent pointer-events-none" />
      <div className="container relative z-10 mx-auto h-full px-4 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:h-full lg:grid-cols-12 lg:items-center">
          <div className="order-2 flex flex-col gap-4 lg:col-span-6 lg:order-1">
            {/* Badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/40 px-3 py-1 text-[10px] font-bold text-red-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-2" /> Edição Limitada
              </span>
            </div>

            {/* Title */}
            <h1 ref={titleRef} className="w-full xl:w-fit text-5xl md:text-6xl lg:text-7xl font-luxury font-black leading-tight text-white">
              {campaignTitleHighlight ? (
                <>
                  {campaignTitlePrefix} <span className="text-neon-pink">{campaignTitleHighlight}</span>
                </>
              ) : (
                campaignTitlePrefix
              )}
            </h1>

            {/* Subtitle */}
            <p className="w-full max-w-none text-base font-light leading-relaxed text-gray-300">
              Além de <span className="text-neon-cyan font-semibold">{mainPrize}</span>, você também concorre a{' '}
              <span className="text-neon-cyan font-semibold">{secondPrize}</span> e{' '}
              <span className="text-neon-cyan font-semibold">{bonusPrize}</span>. Sorteio com transparência total:
              apuração pela Loteria Federal e validação por algoritmo auditável.
            </p>

            <article className="mt-1 rounded-2xl border border-white/10 bg-luxury-card/70 p-5 lg:max-w-lg xl:max-w-none" style={heroScaledAlignedSectionStyle}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Defina quantos numeros deseja comprar</h2>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4">
                {heroQuickQuantityPacks.map((pack) => {
                  const isPromotionPack = featuredPromotionInsight?.targetQuantity === pack

                  return (
                    <div key={pack} className="group relative">
                      {isPromotionPack ? (
                        <>
                          <span className="pointer-events-none absolute -top-2 left-1/2 z-10 inline-flex w-[70%] -translate-x-1/2 items-center justify-center rounded-md border border-amber-300 bg-[linear-gradient(120deg,rgb(245,158,11),rgb(251,191,36))] px-2.5 py-0.5 text-center text-[8px] font-black uppercase tracking-[0.09em] text-black shadow-[0_8px_18px_rgba(245,158,11,0.3)]">
                            {featuredPromotionInsight.label}
                          </span>
                          {featuredPromotionInsight.hasTooltip ? (
                            <div className="pointer-events-none absolute -top-2 left-1/2 z-30 w-48 -translate-x-1/2 -translate-y-[125%] scale-95 rounded-md border border-amber-200/80 bg-[#090611] px-2.5 py-2 text-center text-[10px] font-semibold leading-tight text-amber-100 opacity-0 shadow-[0_16px_40px_rgba(0,0,0,0.75)] ring-1 ring-black/70 transition-all duration-200 ease-out group-hover:-translate-y-[135%] group-hover:scale-100 group-hover:opacity-100 group-focus-within:-translate-y-[135%] group-focus-within:scale-100 group-focus-within:opacity-100">
                              {featuredPromotionInsight.tooltip}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      <button
                        className={`relative w-full overflow-hidden rounded-lg border px-4 py-3 text-left transition-all ${
                          quantity === pack
                            ? 'border-neon-pink bg-neon-pink/10 text-neon-pink'
                            : 'border-white/10 bg-luxury-bg text-white hover:border-neon-pink/50'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        type="button"
                        disabled={isQuickCheckoutLoading}
                        onClick={() => onSetQuantity(pack)}
                      >
                        {isPromotionPack ? (
                          <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-amber-400 to-yellow-300" />
                        ) : null}
                        <p className="text-lg font-black">+{pack}</p>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Numeros</p>
                      </button>
                    </div>
                  )
                })}
              </div>
            </article>

            {/* CTA button + secure payment */}
            <div className="mt-1 flex w-full flex-col gap-2 lg:max-w-lg xl:max-w-none" style={heroScaledAlignedSectionStyle}>
              <button
                className="inline-flex w-full h-16 items-center justify-center rounded-xl border border-violet-200/30 bg-gradient-to-r from-purple-600 via-violet-500 to-purple-700 px-8 text-base font-black text-white transition-all hover:scale-[1.02] hover:border-violet-100/45 hover:brightness-110 shadow-[0_0_32px_rgba(139,92,246,0.6),0_0_64px_rgba(139,92,246,0.3)] uppercase tracking-widest gap-3 disabled:cursor-not-allowed disabled:opacity-70"
                type="button"
                disabled={isQuickCheckoutLoading}
                onClick={onQuickCheckout}
              >
                {isQuickCheckoutLoading ? (
                  <span className="inline-flex items-center gap-3">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                    Processando compra...
                  </span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-2xl">confirmation_number</span>
                    Comprar Números Agora
                  </>
                )}
              </button>
              <Link
                className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 transition hover:text-cyan-100"
                to="/comprar"
              >
                Escolher numeros manualmente
              </Link>
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <span className="material-symbols-outlined text-neon-cyan text-base">verified_user</span>
                <span className="text-xs">Compra 100% segura e processada instantaneamente.</span>
              </div>
            </div>
          </div>

          {/* Moto image */}
          <div className="relative order-1 lg:col-span-6 lg:order-2">
            <div className="absolute inset-0 bg-neon-pink/20 blur-[100px] rounded-full opacity-20" />
            <div className="relative z-10 mx-auto aspect-square w-full max-w-[680px] hero-carousel-frame max-[639px]:left-1/2 max-[639px]:w-screen max-[639px]:max-w-none max-[639px]:-translate-x-1/2 lg:w-[min(40vw,640px)]">
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
                        className={`hero-carousel-image transition-opacity duration-500 ${loadedImages[image.src] ? 'opacity-100' : 'opacity-0'
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
                  className="h-full w-full rounded-[28px] border border-white/10 bg-black/35 max-[639px]:rounded-none"
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
                    className="text-neon-cyan text-base font-bold tracking-[0.2em] uppercase mt-1"
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
