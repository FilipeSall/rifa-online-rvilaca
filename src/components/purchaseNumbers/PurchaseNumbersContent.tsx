import type { usePurchaseNumbers } from '../../hooks/usePurchaseNumbers'
import NumberSelectionCard from './NumberSelectionCard'
import QuantitySelectionCard from './QuantitySelectionCard'
import PurchaseSummaryCard from './PurchaseSummaryCard'

type PurchaseNumbersContentProps = {
  purchaseState: ReturnType<typeof usePurchaseNumbers>
}

export default function PurchaseNumbersContent({ purchaseState }: PurchaseNumbersContentProps) {
  const {
    numberPool,
    selectionMode,
    setSelectionMode,
    quantity,
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

  return (
    <section className="container mx-auto px-4 py-10 lg:px-8 lg:py-14">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <QuantitySelectionCard
            quantity={quantity}
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
            onSelectionModeChange={setSelectionMode}
            onToggleNumber={handleToggleNumber}
            onLoadPreviousPage={handleLoadPreviousPage}
            onLoadNextPage={handleLoadNextPage}
            onClearSelectedNumbers={handleClearSelectedNumbers}
            onGoToPage={handleGoToPage}
            onAddManualNumber={handleAddManualNumber}
          />
        </div>

        <aside className="xl:col-span-4">
          <PurchaseSummaryCard
            selectedCount={selectedCount}
            unitPrice={unitPrice}
            subtotal={subtotal}
            discountAmount={discountAmount}
            totalAmount={totalAmount}
            appliedCoupon={appliedCoupon}
            couponCode={couponCode}
            couponFeedback={couponFeedback}
            couponHint={couponHint}
            canProceed={canProceed}
            isReserving={isReserving}
            isAutoSelecting={isAutoSelecting}
            selectedNumbers={selectedNumbers}
            onCouponCodeChange={setCouponCode}
            onApplyCoupon={handleApplyCoupon}
            onProceed={handleProceed}
          />
        </aside>
      </div>
    </section>
  )
}
