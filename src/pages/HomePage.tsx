import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScrollToHash } from '../hooks/useScrollToHash'
import { OPEN_PURCHASE_CART_EVENT } from '../const/purchaseNumbers'
import AnnouncementBar from '../components/home/AnnouncementBar'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import HeroSection from '../components/home/HeroSection'
import PurchaseSummaryCard from '../components/purchaseNumbers/PurchaseSummaryCard'
import TrustBadgesSection from '../components/home/TrustBadgesSection'
import WinnersFaqSection from '../components/home/WinnersFaqSection'
import { PurchaseHeroSection } from '../components/purchaseNumbers'
import { usePurchaseNumbers } from '../hooks/usePurchaseNumbers'
import { applyCampaignShareMeta, buildCampaignShareMeta } from '../utils/shareMeta'

export default function HomePage() {
  useScrollToHash()
  const purchaseState = usePurchaseNumbers()
  const [isCartModalOpen, setIsCartModalOpen] = useState(false)
  const isProceedingToCheckout = purchaseState.isReserving || purchaseState.isAutoSelecting
  const closeCartModal = useCallback(() => {
    if (isProceedingToCheckout) {
      return
    }

    setIsCartModalOpen(false)
  }, [isProceedingToCheckout])

  useEffect(() => {
    const shareMeta = buildCampaignShareMeta({
      campaignTitle: purchaseState.campaign.title,
      mainPrize: purchaseState.campaign.mainPrize,
      secondPrize: purchaseState.campaign.secondPrize,
      bonusPrize: purchaseState.campaign.bonusPrize,
    })

    applyCampaignShareMeta(shareMeta)
  }, [
    purchaseState.campaign.bonusPrize,
    purchaseState.campaign.mainPrize,
    purchaseState.campaign.secondPrize,
    purchaseState.campaign.title,
  ])

  useEffect(() => {
    const handleOpenCart = () => {
      setIsCartModalOpen(true)
    }

    window.addEventListener(OPEN_PURCHASE_CART_EVENT, handleOpenCart)
    return () => {
      window.removeEventListener(OPEN_PURCHASE_CART_EVENT, handleOpenCart)
    }
  }, [])

  useEffect(() => {
    if (!isCartModalOpen) {
      return
    }

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isCartModalOpen])

  const handleHomeSummaryProceed = useCallback(() => {
    void purchaseState.handleProceed()
  }, [purchaseState.handleProceed])

  const homeSummaryCardProps = useMemo(
    () => ({
      selectedCount: purchaseState.selectedCount,
      minQuantity: purchaseState.minSelectableQuantity,
      unitPrice: purchaseState.unitPrice,
      subtotal: purchaseState.subtotal,
      promotionDiscountAmount: purchaseState.promotionDiscountAmount,
      promotionDiscountPercent: purchaseState.promotionDiscountPercent,
      couponDiscountAmount: purchaseState.couponDiscountAmount,
      totalAmount: purchaseState.totalAmount,
      appliedCoupon: purchaseState.appliedCoupon,
      couponCode: purchaseState.couponCode,
      couponFeedback: purchaseState.couponFeedback,
      couponHint: purchaseState.couponHint,
      canProceed: purchaseState.canProceed,
      isReserving: purchaseState.isReserving,
      isAutoSelecting: purchaseState.isAutoSelecting,
      selectionMode: purchaseState.selectionMode,
      shouldHighlightSelectedNumbers: purchaseState.shouldHighlightSelectedNumbers,
      selectedNumbers: purchaseState.selectedNumbers,
      onCouponCodeChange: purchaseState.setCouponCode,
      onApplyCoupon: purchaseState.handleApplyCoupon,
      onSwitchToManual: () => purchaseState.setSelectionMode('manual'),
      onProceed: handleHomeSummaryProceed,
    }),
    [handleHomeSummaryProceed, purchaseState],
  )

  return (
    <div className="bg-luxury-bg font-display text-text-main overflow-x-hidden selection:bg-neon-pink selection:text-black">
      <AnnouncementBar />

      <div className="flex min-h-screen flex-col relative">
        <Header />

        <main className="flex-grow">
          <HeroSection
            quantity={purchaseState.quantity}
            packQuantities={purchaseState.availablePackQuantities}
            onSetQuantity={purchaseState.handleSetQuantity}
            onQuickCheckout={purchaseState.handleQuickCheckout}
            isQuickCheckoutLoading={
              purchaseState.isQuickCheckoutPending
              || purchaseState.isAutoSelecting
              || purchaseState.isReserving
            }
          />
          <PurchaseHeroSection
            unitPrice={purchaseState.unitPrice}
            minQuantity={purchaseState.minSelectableQuantity}
          />
          <WinnersFaqSection />
          <TrustBadgesSection />
        </main>

        <Footer />
      </div>

      {isCartModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[95] flex items-end bg-black/75 p-3 sm:items-center sm:justify-center sm:p-6"
          role="dialog"
          onClick={closeCartModal}
        >
          <div
            className="relative w-full max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-luxury-bg p-1 shadow-2xl sm:max-w-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Fechar carrinho"
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={closeCartModal}
              disabled={isProceedingToCheckout}
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
            <PurchaseSummaryCard {...homeSummaryCardProps} isSticky={false} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
