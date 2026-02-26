import { useCallback, useEffect, useMemo, useState } from 'react'
import type { usePurchaseNumbers } from '../../hooks/usePurchaseNumbers'
import { useAuthStore } from '../../stores/authStore'
import MobileAuthCard from './MobileAuthCard'
import NumberSelectionCard from './NumberSelectionCard'
import QuantitySelectionCard from './QuantitySelectionCard'
import PurchaseSummaryCard from './PurchaseSummaryCard'

type PurchaseNumbersContentProps = {
  purchaseState: ReturnType<typeof usePurchaseNumbers>
}

export default function PurchaseNumbersContent({ purchaseState }: PurchaseNumbersContentProps) {
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [mobileModalView, setMobileModalView] = useState<'cart' | 'auth'>('cart')
  const [shouldProceedAfterMobileAuth, setShouldProceedAfterMobileAuth] = useState(false)
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const {
    numberPool,
    selectionMode,
    setSelectionMode,
    quantity,
    minPurchaseQuantity,
    maxSelectable,
    rangeStart,
    rangeEnd,
    totalNumbers,
    pageStart,
    pageEnd,
    smallestAvailableNumber,
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
    discountAmount,
    totalAmount,
    canProceed,
    isReserving,
    isAutoSelecting,
    shouldHighlightSelectedNumbers,
    shouldHighlightAutoButton,
    handleSetQuantity,
    handleClearSelectedNumbers,
    handleToggleNumber,
    handleGoToPage,
    handleAddManualNumber,
    handleApplyCoupon,
    handleLoadPreviousPage,
    handleLoadNextPage,
    handleProceed,
  } = purchaseState

  const closeMobileOverlay = useCallback(() => {
    setIsMobileCartOpen(false)
    setMobileModalView('cart')
    setShouldProceedAfterMobileAuth(false)
  }, [])

  const isSmallViewport = () => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia('(max-width: 1023px)').matches
  }

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
    if (!isMobileCartOpen || mobileModalView !== 'auth' || !shouldProceedAfterMobileAuth || !isLoggedIn) {
      return
    }

    setShouldProceedAfterMobileAuth(false)
    setMobileModalView('cart')
    setIsMobileCartOpen(false)
    void handleProceed()
  }, [handleProceed, isLoggedIn, isMobileCartOpen, mobileModalView, shouldProceedAfterMobileAuth])

  const handleSummaryProceed = useCallback(() => {
    if (!isLoggedIn && isSmallViewport()) {
      setMobileModalView('auth')
      setShouldProceedAfterMobileAuth(true)
      return
    }

    void handleProceed()
  }, [handleProceed, isLoggedIn])

  const summaryCardProps = useMemo(
    () => ({
      selectedCount,
      minQuantity: minPurchaseQuantity,
      unitPrice,
      subtotal,
      discountAmount,
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
      onSwitchToManual: () => setSelectionMode('manual'),
      onProceed: handleSummaryProceed,
    }),
    [
      selectedCount,
      minPurchaseQuantity,
      unitPrice,
      subtotal,
      discountAmount,
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
      handleSummaryProceed,
      setSelectionMode,
    ],
  )

  return (
    <>
      <section className="container mx-auto px-4 py-10 lg:px-8 lg:py-14">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-8">
            <QuantitySelectionCard
              quantity={quantity}
              minQuantity={minPurchaseQuantity}
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
              smallestAvailableNumber={smallestAvailableNumber}
              hasPreviousPage={previousPageStart !== null}
              hasNextPage={nextPageStart !== null}
              currentPage={currentPage}
              totalPages={totalPages}
              isPageLoading={isPageLoading}
              isManualAdding={isManualAdding}
              shouldHighlightAutoButton={shouldHighlightAutoButton}
              onSelectionModeChange={setSelectionMode}
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

      <button
        aria-label="Abrir carrinho"
        className="fixed bottom-4 right-4 z-[72] flex h-16 w-16 items-center justify-center rounded-full border border-neon-pink/70 bg-[radial-gradient(circle_at_35%_30%,#ff66e8,#ff00cc_56%,#d600ab_100%)] text-black shadow-[0_14px_35px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-neon-pink/75 xl:hidden"
        type="button"
        onClick={() => {
          setMobileModalView('cart')
          setIsMobileCartOpen(true)
        }}
      >
        <span className="material-symbols-outlined text-[31px]">shopping_cart</span>
        {selectedCount > 0 ? (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-red-200/70 bg-red-500 px-1 text-[11px] font-black leading-none text-white shadow-[0_6px_12px_rgba(0,0,0,0.35)]">
            !
          </span>
        ) : null}
      </button>

      {isMobileCartOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[95] flex items-end bg-black/75 p-3 xl:hidden"
          role="dialog"
          onClick={closeMobileOverlay}
        >
          <div
            className="relative w-full max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-luxury-bg p-1 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {mobileModalView !== 'auth' ? (
              <button
                aria-label="Fechar carrinho"
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
                type="button"
                onClick={closeMobileOverlay}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            ) : null}
            {mobileModalView === 'auth' ? (
              <MobileAuthCard onBackToCart={() => setMobileModalView('cart')} />
            ) : (
              <PurchaseSummaryCard {...summaryCardProps} isSticky={false} />
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
