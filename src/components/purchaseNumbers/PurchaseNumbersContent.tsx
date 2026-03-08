import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { OPEN_PURCHASE_CART_EVENT } from '../../const/purchaseNumbers'
import type { usePurchaseNumbers } from '../../hooks/usePurchaseNumbers'
import { calculateCampaignPricing } from '../../utils/campaignPricing'
import NumberSelectionCard from './NumberSelectionCard'
import QuickCheckoutAuthModal from './QuickCheckoutAuthModal'
import QuantitySelectionCard, { type PackPricingByQuantity } from './QuantitySelectionCard'
import PurchaseSummaryCard from './PurchaseSummaryCard'

type PurchaseNumbersContentProps = {
  purchaseState: ReturnType<typeof usePurchaseNumbers>
}

export default function PurchaseNumbersContent({ purchaseState }: PurchaseNumbersContentProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [isQuickCheckoutAuthModalOpen, setIsQuickCheckoutAuthModalOpen] = useState(false)
  const {
    numberPool,
    selectionMode,
    setSelectionMode,
    quantity,
    availablePackQuantities,
    minSelectableQuantity,
    maxSelectable,
    rangeStart,
    rangeEnd,
    totalNumbers,
    pageStart,
    pageEnd,
    previousPageStart,
    nextPageStart,
    currentPage,
    totalPages,
    isPageLoading,
    isManualAdding,
    selectedNumbers,
    selectedCount,
    couponCode,
    setCouponCode,
    appliedCoupon,
    couponFeedback,
    couponHint,
    unitPrice,
    subtotal,
    promotionDiscountAmount,
    promotionDiscountPercent,
    couponDiscountAmount,
    totalAmount,
    canProceed,
    isReserving,
    isAutoSelecting,
    shouldHighlightSelectedNumbers,
    shouldHighlightAutoButton,
    shouldOpenQuickCheckoutAuthModal,
    conflictResolution,
    handleSetQuantity,
    handleClearSelectedNumbers,
    handleFillRemainingAutomatically,
    handleToggleNumber,
    handleGoToPage,
    handleAddManualNumber,
    handleApplyCoupon,
    consumeQuickCheckoutAuthModalRequest,
    cancelPendingCheckoutAfterAuth,
    handleLoadPreviousPage,
    handleLoadNextPage,
    handleProceed,
    closeConflictResolutionModal,
    resolveConflictWithAutomaticNumber,
    resolveConflictManually,
  } = purchaseState
  const isProceedingToCheckout = isReserving || isAutoSelecting

  const closeMobileOverlay = useCallback(() => {
    if (isProceedingToCheckout) {
      return
    }

    setIsMobileCartOpen(false)
  }, [isProceedingToCheckout])
  const openCartOverlay = useCallback(() => {
    setIsMobileCartOpen(true)
  }, [])

  useEffect(() => {
    if (!isMobileCartOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobileOverlay()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleEscape)
    }
  }, [closeMobileOverlay, isMobileCartOpen])

  useEffect(() => {
    const handleOpenCart = () => {
      openCartOverlay()
    }

    window.addEventListener(OPEN_PURCHASE_CART_EVENT, handleOpenCart)
    return () => {
      window.removeEventListener(OPEN_PURCHASE_CART_EVENT, handleOpenCart)
    }
  }, [openCartOverlay])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get('openCart') !== '1') {
      return
    }

    openCartOverlay()
    searchParams.delete('openCart')

    const nextSearch = searchParams.toString()
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }, [location.pathname, location.search, navigate, openCartOverlay])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    if (searchParams.get('mode') !== 'manual') {
      return
    }

    handleClearSelectedNumbers()

    searchParams.delete('mode')
    const nextSearch = searchParams.toString()
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    )
  }, [handleClearSelectedNumbers, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!shouldOpenQuickCheckoutAuthModal) {
      return
    }

    setIsMobileCartOpen(false)
    setIsQuickCheckoutAuthModalOpen(true)
    consumeQuickCheckoutAuthModalRequest()
  }, [consumeQuickCheckoutAuthModalRequest, shouldOpenQuickCheckoutAuthModal])

  const handleQuickCheckoutAuthModalClose = useCallback((reason: 'dismiss' | 'login-success' | 'signup-success') => {
    setIsQuickCheckoutAuthModalOpen(false)
    if (reason !== 'login-success') {
      cancelPendingCheckoutAfterAuth()
    }
  }, [cancelPendingCheckoutAfterAuth])

  const handleSummaryProceed = useCallback(() => {
    void handleProceed()
  }, [handleProceed])
  const handleSwitchToManualFromSummary = useCallback(() => {
    setSelectionMode('manual')
    setIsMobileCartOpen(false)
  }, [setSelectionMode])

  const summaryCardProps = useMemo(
    () => ({
      selectedCount,
      minQuantity: minSelectableQuantity,
      unitPrice,
      subtotal,
      promotionDiscountAmount,
      promotionDiscountPercent,
      couponDiscountAmount,
      totalAmount,
      appliedCoupon,
      couponCode,
      couponFeedback,
      couponHint,
      canProceed,
      isReserving,
      isAutoSelecting,
      selectionMode,
      shouldHighlightSelectedNumbers,
      selectedNumbers,
      onCouponCodeChange: setCouponCode,
      onApplyCoupon: handleApplyCoupon,
      onSwitchToManual: handleSwitchToManualFromSummary,
      onProceed: handleSummaryProceed,
    }),
    [
      selectedCount,
      minSelectableQuantity,
      unitPrice,
      subtotal,
      promotionDiscountAmount,
      promotionDiscountPercent,
      couponDiscountAmount,
      totalAmount,
      appliedCoupon,
      couponCode,
      couponFeedback,
      couponHint,
      canProceed,
      isReserving,
      isAutoSelecting,
      selectionMode,
      shouldHighlightSelectedNumbers,
      selectedNumbers,
      setCouponCode,
      handleApplyCoupon,
      handleSwitchToManualFromSummary,
      handleSummaryProceed,
    ],
  )
  const mostPurchasedPackQuantities = useMemo(
    () => purchaseState.campaign.packPrices
      .filter((pack) => pack.active && pack.mostPurchasedTag)
      .map((pack) => pack.quantity),
    [purchaseState.campaign.packPrices],
  )
  const activeFeaturedPromotions = useMemo(
    () => purchaseState.campaign.featuredPromotions
      .filter((promotion) => promotion.active && promotion.discountValue > 0),
    [purchaseState.campaign.featuredPromotions],
  )
  const packPricingByQuantity = useMemo<PackPricingByQuantity>(
    () => availablePackQuantities.reduce<PackPricingByQuantity>((accumulator, pack) => {
      const pricing = calculateCampaignPricing(pack, {
        pricePerCota: purchaseState.campaign.pricePerCota,
        packPrices: purchaseState.campaign.packPrices,
        featuredPromotions: activeFeaturedPromotions,
      })

      accumulator[pack] = {
        subtotalBase: pricing.subtotalBase,
        subtotalAfterPromotion: pricing.subtotalAfterPromotion,
        promotionDiscount: pricing.promotionDiscount,
      }
      return accumulator
    }, {}),
    [
      activeFeaturedPromotions,
      availablePackQuantities,
      purchaseState.campaign.packPrices,
      purchaseState.campaign.pricePerCota,
    ],
  )
  const discountPackQuantities = useMemo(() => {
    return availablePackQuantities.filter((pack) => (packPricingByQuantity[pack]?.promotionDiscount ?? 0) > 0)
  }, [availablePackQuantities, packPricingByQuantity])

  return (
    <>
      <section className="container mx-auto px-4 py-10 lg:px-8 lg:py-14">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <QuantitySelectionCard
              quantity={quantity}
              minQuantity={minSelectableQuantity}
              packQuantities={availablePackQuantities}
              mostPurchasedPackQuantities={mostPurchasedPackQuantities}
              discountPackQuantities={discountPackQuantities}
              packPricingByQuantity={packPricingByQuantity}
              maxSelectable={maxSelectable}
              onSetQuantity={handleSetQuantity}
            />

            <NumberSelectionCard
              numberPool={numberPool}
              selectionMode={selectionMode}
              quantity={quantity}
              selectedNumbers={selectedNumbers}
              selectedCount={selectedCount}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalNumbers={totalNumbers}
              pageStart={pageStart}
              pageEnd={pageEnd}
              hasPreviousPage={previousPageStart !== null}
              hasNextPage={nextPageStart !== null}
              currentPage={currentPage}
              totalPages={totalPages}
              isPageLoading={isPageLoading}
              isManualAdding={isManualAdding}
              shouldHighlightAutoButton={shouldHighlightAutoButton}
              onFillRemainingAutomatically={handleFillRemainingAutomatically}
              onToggleNumber={handleToggleNumber}
              onLoadPreviousPage={handleLoadPreviousPage}
              onLoadNextPage={handleLoadNextPage}
              onClearSelectedNumbers={handleClearSelectedNumbers}
              onGoToPage={handleGoToPage}
              onAddManualNumber={handleAddManualNumber}
            />
          </div>

          <aside className="hidden xl:block xl:col-span-4">
            <PurchaseSummaryCard {...summaryCardProps} />
          </aside>
        </div>
      </section>

      {isMobileCartOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[95] flex items-end bg-black/75 p-3 sm:items-center sm:justify-center sm:p-6"
          role="dialog"
          onClick={closeMobileOverlay}
        >
          <div
            className="relative w-full max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-luxury-bg p-1 shadow-2xl sm:max-w-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Fechar carrinho"
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={closeMobileOverlay}
              disabled={isProceedingToCheckout}
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
            <PurchaseSummaryCard {...summaryCardProps} isSticky={false} />
          </div>
        </div>
      ) : null}

      <QuickCheckoutAuthModal
        isOpen={isQuickCheckoutAuthModalOpen}
        onClose={handleQuickCheckoutAuthModalClose}
      />

      {conflictResolution ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-luxury-card shadow-2xl">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-neon-pink/20 blur-2xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-cyan-400/20 blur-2xl" />

            <div className="relative z-10 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Numeros indisponiveis</p>
              <h3 className="mt-2 text-xl font-black text-white">Alguns numeros acabaram de ser reservados</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">
                Identificamos <span className="font-bold text-neon-pink">{conflictResolution.conflictedNumbers.length}</span>{' '}
                numero(s) que ja foram reservados ou comprados. Deseja preencher todos automaticamente?
              </p>

              <div className="mt-4 max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Numeros em conflito</p>
                <p className="mt-2 break-all text-xs text-gray-200">
                  {conflictResolution.conflictedNumbers
                    .map((number) => String(number).padStart(7, '0'))
                    .join(', ')}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3">
                <button
                  className="h-11 rounded-lg border border-cyan-300/45 bg-cyan-500/15 px-4 text-sm font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/25"
                  type="button"
                  onClick={resolveConflictManually}
                >
                  Escolher manualmente
                </button>
                <button
                  className="h-11 rounded-lg border border-neon-pink/45 bg-neon-pink/15 px-4 text-sm font-bold uppercase tracking-[0.14em] text-neon-pink transition hover:bg-neon-pink/25"
                  type="button"
                  onClick={resolveConflictWithAutomaticNumber}
                >
                  Preencher todos automatico
                </button>
              </div>

              <button
                className="mt-3 w-full text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 transition hover:text-white"
                type="button"
                onClick={closeConflictResolutionModal}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
