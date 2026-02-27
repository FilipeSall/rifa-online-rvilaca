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
    conflictResolution,
    handleSetQuantity,
    handleClearSelectedNumbers,
    handleToggleNumber,
    handleGoToPage,
    handleAddManualNumber,
    handleApplyCoupon,
    handleLoadPreviousPage,
    handleLoadNextPage,
    handleProceed,
    closeConflictResolutionModal,
    resolveConflictWithAutomaticNumber,
    resolveConflictManually,
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
