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
    availableNumbersCount,
    selectedNumbers,
    selectedCount,
    couponCode,
    setCouponCode,
    appliedCoupon,
    couponFeedback,
    couponHint,
    reservationSeconds,
    hasExpiredReservation,
    subtotal,
    discountAmount,
    totalAmount,
    canProceed,
    isReserving,
    handleSetQuantity,
    handleToggleNumber,
    handleApplyCoupon,
    handleProceed,
  } = purchaseState

  return (
    <section className="container mx-auto px-4 py-10 lg:px-8 lg:py-14">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <QuantitySelectionCard
            quantity={quantity}
            maxSelectable={maxSelectable}
            availableNumbersCount={availableNumbersCount}
            onSetQuantity={handleSetQuantity}
          />

          <NumberSelectionCard
            numberPool={numberPool}
            selectionMode={selectionMode}
            quantity={quantity}
            selectedNumbers={selectedNumbers}
            selectedCount={selectedCount}
            onSelectionModeChange={setSelectionMode}
            onToggleNumber={handleToggleNumber}
          />
        </div>

        <aside className="xl:col-span-4">
          <PurchaseSummaryCard
            selectedCount={selectedCount}
            subtotal={subtotal}
            discountAmount={discountAmount}
            totalAmount={totalAmount}
            appliedCoupon={appliedCoupon}
            couponCode={couponCode}
            couponFeedback={couponFeedback}
            couponHint={couponHint}
            reservationSeconds={reservationSeconds}
            hasExpiredReservation={hasExpiredReservation}
            canProceed={canProceed}
            isReserving={isReserving}
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
