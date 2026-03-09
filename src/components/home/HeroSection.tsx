import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScopedCampaignSettings } from '../../hooks/useScopedCampaignSettings'
import { DEFAULT_BONUS_PRIZE, DEFAULT_CAMPAIGN_TITLE, DEFAULT_MAIN_PRIZE, DEFAULT_SECOND_PRIZE } from '../../const/campaign'
import { calculateCampaignPricing } from '../../utils/campaignPricing'
import { formatCurrency } from '../../utils/purchaseNumbers'
import { formatPrizeLabelWithQuantity } from '../../utils/campaignPrizes'
import type { CampaignFeaturedPromotion } from '../../types/campaign'
import Skeleton from 'react-loading-skeleton'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import 'react-loading-skeleton/dist/skeleton.css'

type HeroSectionProps = {
  quantity: number
  minSelectable: number
  maxSelectable: number
  packQuantities: number[]
  onSetQuantity: (value: number) => void
  onQuickCheckout: () => void
  isQuickCheckoutLoading: boolean
}

export default function HeroSection({
  quantity,
  minSelectable,
  maxSelectable,
  packQuantities,
  onSetQuantity,
  onQuickCheckout,
  isQuickCheckoutLoading,
}: HeroSectionProps) {
  const { campaign } = useScopedCampaignSettings()
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [heroSalesCardWidth, setHeroSalesCardWidth] = useState<number | null>(null)
  const [customQuantityInput, setCustomQuantityInput] = useState(String(quantity))
  const [isCustomQuantityFocused, setIsCustomQuantityFocused] = useState(false)
  const heroQuickQuantityPacks = useMemo(
    () => packQuantities.filter((pack) => Number.isInteger(pack) && pack > 0).slice(0, 8),
    [packQuantities],
  )
  const campaignTitle = campaign.title || DEFAULT_CAMPAIGN_TITLE
  const mainPrize = campaign.mainPrize || DEFAULT_MAIN_PRIZE
  const secondPrize = campaign.secondPrize || DEFAULT_SECOND_PRIZE
  const bonusPrize = formatPrizeLabelWithQuantity(campaign.bonusPrize || DEFAULT_BONUS_PRIZE, campaign.bonusPrizeQuantity)

  const campaignTitleParts = campaignTitle.trim().split(/\s+/).filter(Boolean)

  const campaignTitlePrefix =
    campaignTitleParts.length > 2 ? campaignTitleParts.slice(0, -2).join(' ') : campaignTitleParts.join(' ')

  const campaignTitleHighlight = campaignTitleParts.length > 2 ? campaignTitleParts.slice(-2).join(' ') : ''

  const heroScaledAlignedSectionStyle = heroSalesCardWidth
    ? { width: `${Math.round((heroSalesCardWidth / 2) * 1.75)}px` }
    : undefined

  useEffect(() => {
    if (isCustomQuantityFocused) {
      return
    }

    setCustomQuantityInput(String(quantity))
  }, [isCustomQuantityFocused, quantity])

  const heroCarouselImages = useMemo(() => {
    return campaign.midias.heroCarousel
      .filter((item) => item.active && !!item.url)
      .sort((a, b) => a.order - b.order)
      .map((item, index) => ({
        src: item.url,
        alt: item.alt || `Slide da campanha ${index + 1}`,
      }))
  }, [campaign.midias.heroCarousel])

  const activeFeaturedPromotions = useMemo(
    () => {
      const promotions = Array.isArray(campaign.featuredPromotions) ? campaign.featuredPromotions : []
      return promotions
        .map((promotion) => {
          if (!promotion?.active) {
            return null
          }

          const discountType = promotion.discountType === 'fixed' ? ('fixed' as const) : ('percent' as const)
          const normalizedDiscount = Number(promotion.discountValue)
          if (!Number.isFinite(normalizedDiscount) || normalizedDiscount <= 0) {
            return null
          }

          return {
            ...promotion,
            discountType,
            discountValue: Number((discountType === 'percent' ? Math.min(normalizedDiscount, 100) : normalizedDiscount).toFixed(2)),
          }
        })
        .filter((promotion): promotion is CampaignFeaturedPromotion => Boolean(promotion))
    },
    [campaign.featuredPromotions],
  )
  const mostPurchasedPackQuantities = useMemo(
    () => campaign.packPrices
      .filter((pack) => pack.active && pack.mostPurchasedTag)
      .map((pack) => pack.quantity),
    [campaign.packPrices],
  )
  const heroPackPricingByQuantity = useMemo(
    () => heroQuickQuantityPacks.reduce<Record<number, ReturnType<typeof calculateCampaignPricing>>>((accumulator, pack) => {
      accumulator[pack] = calculateCampaignPricing(pack, {
        pricePerCota: campaign.pricePerCota,
        packPrices: campaign.packPrices,
        featuredPromotions: activeFeaturedPromotions,
      })
      return accumulator
    }, {}),
    [
      activeFeaturedPromotions,
      campaign.packPrices,
      campaign.pricePerCota,
      heroQuickQuantityPacks,
    ],
  )
  const discountTooltipByPack = useMemo(() => {
    return heroQuickQuantityPacks.reduce<Record<number, string>>((accumulator, pack) => {
      const pricing = heroPackPricingByQuantity[pack]
      if (!pricing || pricing.promotionDiscount <= 0) {
        return accumulator
      }

      const appliedPromotion = pricing.appliedPromotion
      if (!appliedPromotion) {
        return accumulator
      }

      const discountLabel = appliedPromotion.discountType === 'percent'
        ? `${appliedPromotion.discountValue.toFixed(2).replace(/\.00$/, '')}%`
        : formatCurrency(appliedPromotion.discountValue)
      accumulator[pack] = `Economize ${discountLabel} e pague ${formatCurrency(pricing.subtotalAfterPromotion)}.`
      return accumulator
    }, {})
  }, [
    heroQuickQuantityPacks,
    heroPackPricingByQuantity,
  ])
  const promotionCallout = useMemo(() => {
    if (activeFeaturedPromotions.length === 0) {
      return null
    }

    const bestPromotion = [...activeFeaturedPromotions].sort((left, right) => {
      if (right.targetQuantity !== left.targetQuantity) {
        return right.targetQuantity - left.targetQuantity
      }

      return right.discountValue - left.discountValue
    })[0]
    if (!bestPromotion) {
      return null
    }

    const discountLabel = bestPromotion.discountType === 'percent'
      ? `${bestPromotion.discountValue.toFixed(2).replace(/\.00$/, '')}%`
      : formatCurrency(bestPromotion.discountValue)
    return {
      targetQuantityLabel: String(bestPromotion.targetQuantity),
      discountLabel,
    }
  }, [activeFeaturedPromotions])

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

  const handleCommitCustomQuantity = useCallback(() => {
    const parsedValue = Number(customQuantityInput)
    const normalizedValue = Number.isFinite(parsedValue) ? Math.floor(parsedValue) : minSelectable
    const safeValue = Math.max(minSelectable, Math.min(normalizedValue, maxSelectable))
    onSetQuantity(safeValue)
    setCustomQuantityInput(String(safeValue))
  }, [customQuantityInput, maxSelectable, minSelectable, onSetQuantity])

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
    <section className="relative flex items-center overflow-hidden hero-bg min-h-[calc(100vh-5rem)] py-8 md:min-h-[calc(100vh-7rem)] lg:py-10">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-neon-pink/5 to-transparent pointer-events-none" />
      <div className="container relative z-10 mx-auto w-full px-4 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          <div className="order-2 flex flex-col gap-4 lg:col-span-6 lg:order-1">
            {/* Title */}
            <h1 ref={titleRef} className="w-full xl:w-fit text-5xl md:text-6xl lg:text-7xl max-[1440px]:lg:text-5xl font-display font-black leading-tight text-white">
              {campaignTitleHighlight ? (
                <>
                  {campaignTitlePrefix} <span className="text-neon-pink">{campaignTitleHighlight}</span>
                </>
              ) : (
                campaignTitlePrefix
              )}
            </h1>

            {/* Subtitle */}
            <p className="w-full max-w-none text-base font-light leading-relaxed text-gray-300 max-[1440px]:lg:text-xs">
              Além de <span className="text-neon-cyan font-semibold">{mainPrize}</span>, você também concorre a{' '}
              <span className="text-neon-cyan font-semibold">{secondPrize}</span> e{' '}
              <span className="text-neon-cyan font-semibold">{bonusPrize}</span>. Sorteio com transparência total:
              apuração pela{' '}
              <span className="font-bold text-amber-300">Loteria Federal</span>.
            </p>

            <article
              className="relative mt-1 overflow-visible rounded-2xl border border-white/15 bg-[linear-gradient(140deg,rgba(20,12,34,0.9),rgba(7,13,29,0.9))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.48)] ring-1 ring-white/5 lg:max-w-lg xl:max-w-none"
              style={heroScaledAlignedSectionStyle}
            >
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
                </div>

                <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-4 md:gap-y-7">
                  {heroQuickQuantityPacks.map((pack) => {
                    const packPricing = heroPackPricingByQuantity[pack]
                    const hasPricing = Boolean(packPricing)
                    const hasPromotionDiscount = (packPricing?.promotionDiscount ?? 0) > 0
                    const isMostPurchasedPack = mostPurchasedPackQuantities.includes(pack)
                    const isDiscountPack = hasPromotionDiscount
                    const shouldShowBadge = isMostPurchasedPack || isDiscountPack
                    const discountTooltip = discountTooltipByPack[pack]

                    return (
                      <div key={pack} className="group relative">
                        {shouldShowBadge ? (
                          <>
                            <span className={`pointer-events-none absolute left-1/2 top-0 z-10 inline-flex w-[75%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border px-2.5 py-0.5 text-center text-[8px] font-black uppercase tracking-[0.09em] text-black ${isMostPurchasedPack
                                ? 'border-amber-300 bg-[linear-gradient(120deg,rgb(252,211,77),rgb(245,158,11))] shadow-[0_8px_18px_rgba(245,158,11,0.35)]'
                                : 'border-emerald-200 bg-[linear-gradient(120deg,rgb(110,231,183),rgb(16,185,129))] shadow-[0_8px_18px_rgba(16,185,129,0.22)]'
                              }`}>
                              {isMostPurchasedPack ? (
                                <span className="text-[8px] leading-none">Mais vendidos</span>
                              ) : (
                                <span className="text-[8px] leading-none">Desconto</span>
                              )}
                            </span>
                            {isDiscountPack && discountTooltip ? (
                              <div className={`pointer-events-none absolute left-1/2 top-0 z-50 w-48 -translate-x-1/2 -translate-y-[125%] scale-95 rounded-md border px-2.5 py-2 text-center text-[10px] font-semibold leading-tight opacity-0 shadow-[0_16px_40px_rgba(0,0,0,0.75)] ring-1 ring-black transition-all duration-200 ease-out group-hover:-translate-y-[135%] group-hover:scale-100 group-hover:opacity-100 ${isMostPurchasedPack
                                  ? 'border-amber-200 bg-[#140d02] text-amber-100'
                                  : 'border-emerald-200 bg-[#090611] text-emerald-100'
                                }`}>
                                {discountTooltip}
                                <span className={`absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r ${isMostPurchasedPack
                                    ? 'border-amber-200 bg-[#140d02]'
                                    : 'border-emerald-200 bg-[#090611]'
                                  }`} />
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <button
                          className={`relative w-full overflow-hidden rounded-xl border px-4 py-3.5 lg:px-2 lg:py-3 2xl:px-4 2xl:py-3.5 text-left transition-all duration-300 ${quantity === pack
                              ? 'border-neon-pink/90 bg-[linear-gradient(140deg,rgba(255,0,204,0.16),rgba(6,14,28,0.98))] text-neon-pink shadow-[0_0_0_1px_rgba(255,0,204,0.35),0_14px_28px_rgba(255,0,204,0.2)]'
                              : 'border-white/15 bg-[linear-gradient(160deg,rgba(15,23,42,0.9),rgba(8,13,24,0.95))] text-white hover:-translate-y-0.5 hover:border-cyan-300/45 hover:shadow-[0_14px_30px_rgba(34,211,238,0.14)]'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          type="button"
                          disabled={isQuickCheckoutLoading}
                          onClick={() => onSetQuantity(pack)}
                        >
                          {shouldShowBadge ? (
                            <span className={`pointer-events-none absolute left-0 top-0 h-[2px] w-full ${isMostPurchasedPack
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
                                  <p className={`text-[11px] lg:text-[9px] 2xl:text-[11px] font-semibold tracking-tight line-through decoration-1 ${quantity === pack ? 'text-neon-pink/70' : 'text-gray-500'}`}>
                                    {formatCurrency(packPricing.subtotalBase)}
                                  </p>
                                ) : null}
                                <p className="text-xl lg:text-sm 2xl:text-xl font-black tracking-tight">{formatCurrency(packPricing.subtotalAfterPromotion)}</p>
                                <p className={`mt-0.5 text-[10px] lg:text-[8px] 2xl:text-[10px] tracking-[0.12em] ${quantity === pack ? 'text-neon-pink/85' : 'text-gray-400'}`}>
                                  {pack} numeros
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-xl lg:text-sm 2xl:text-xl font-black tracking-tight">+{pack}</p>
                                <p className={`mt-0.5 text-[10px] lg:text-[8px] 2xl:text-[10px] uppercase tracking-[0.18em] ${quantity === pack ? 'text-neon-pink/85' : 'text-gray-400'}`}>
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

                <div className="mt-3 border-t border-white/10 pt-2">
                  <div className="relative mx-auto w-full overflow-hidden rounded-2xl border border-violet-300/25 bg-[linear-gradient(125deg,rgba(11,8,34,0.96),rgba(7,12,27,0.94))] px-3 py-2 shadow-[0_14px_32px_rgba(8,6,25,0.55)] ring-1 ring-white/5">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-neon-pink/60 to-transparent"
                    />
                    <div className="relative z-10 flex items-center justify-between gap-2">
                      <p className="flex-1 text-left text-[9px] font-semibold uppercase tracking-[0.08em] text-cyan-200/80 sm:text-[10px] sm:tracking-[0.14em]">
                        Compra personalizada
                      </p>
                      <div className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5">
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-cyan-200/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 sm:text-base"
                          type="button"
                          onClick={() => onSetQuantity(quantity - 1)}
                          disabled={isQuickCheckoutLoading || quantity <= minSelectable}
                          aria-label="Diminuir quantidade"
                        >
                          -
                        </button>
                        <input
                          className="h-8 w-[4rem] rounded-lg border border-white/15 bg-black/35 px-2 text-center text-lg leading-none font-black text-white outline-none transition focus:border-neon-pink/80 focus:shadow-[0_0_0_1px_rgba(255,0,204,0.3)] sm:h-9 sm:w-20"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={customQuantityInput}
                          onFocus={() => setIsCustomQuantityFocused(true)}
                          onBlur={() => {
                            setIsCustomQuantityFocused(false)
                            handleCommitCustomQuantity()
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur()
                            }
                          }}
                          onChange={(event) => {
                            const nextValue = event.target.value
                            if (!/^\d*$/.test(nextValue)) {
                              return
                            }

                            setCustomQuantityInput(nextValue)
                          }}
                          aria-label="Quantidade personalizada de numeros"
                        />
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-cyan-200/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 sm:text-base"
                          type="button"
                          onClick={() => onSetQuantity(quantity + 1)}
                          disabled={isQuickCheckoutLoading || quantity >= maxSelectable}
                          aria-label="Aumentar quantidade"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <span className="material-symbols-outlined text-neon-cyan text-base">verified_user</span>
                <span className="text-xs">Compra 100% segura e processada instantaneamente.</span>
              </div>
            </div>
          </div>

          {/* Moto image */}
          <div className="relative order-1 lg:col-span-6 lg:order-2">
            <div className="absolute inset-0 bg-neon-pink/20 blur-[100px] rounded-full opacity-20" />
            {promotionCallout ? (
              <div className="pointer-events-none absolute left-0 right-0 top-[2px] z-30 flex justify-center">
                <span className="relative inline-flex w-[85%] -translate-y-1/2 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-[linear-gradient(120deg,rgb(252,211,77),rgb(245,158,11))] px-3 py-1.5 text-center text-[10px] font-black uppercase tracking-[0.09em] text-black shadow-[0_8px_18px_rgba(245,158,11,0.35)] sm:w-[75%] sm:text-[11px]">
                  <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-amber-300 to-yellow-400" />
                  <span className="material-symbols-outlined text-[13px] leading-none text-black sm:text-[14px]">local_offer</span>
                  <span>
                    A partir de <span className="text-[#7a2500]">{promotionCallout.targetQuantityLabel}</span> numeros, ganhe{' '}
                    <span className="text-[#7a2500]">{promotionCallout.discountLabel}</span> de desconto
                  </span>
                </span>
              </div>
            ) : null}
            <div className="relative z-10 mx-auto aspect-square w-full max-w-[680px] hero-carousel-frame max-[639px]:left-1/2 max-[639px]:w-screen max-[639px]:max-w-none max-[639px]:-translate-x-1/2 lg:w-[min(40vw,640px)]">
              {promotionCallout ? (
                <span className="pointer-events-none absolute left-0 top-0 z-20 h-[2px] w-full bg-gradient-to-r from-amber-300 to-yellow-400" />
              ) : null}
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
