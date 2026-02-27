import { create } from 'zustand'

type PurchaseSummaryState = {
  quantity: number
  selectedCount: number
  selectedNumbers: number[]
  couponCode: string | null
  totalAmount: number
  subtotalAmount: number
  promotionDiscountAmount: number
  setSummary: (payload: {
    quantity: number
    selectedCount: number
    selectedNumbers: number[]
    couponCode: string | null
    totalAmount: number
    subtotalAmount: number
    promotionDiscountAmount: number
  }) => void
  resetSummary: () => void
}

const initialSummary = {
  quantity: 0,
  selectedCount: 0,
  selectedNumbers: [] as number[],
  couponCode: null as string | null,
  totalAmount: 0,
  subtotalAmount: 0,
  promotionDiscountAmount: 0,
}

export const usePurchaseSummaryStore = create<PurchaseSummaryState>((set) => ({
  ...initialSummary,
  setSummary: (payload) =>
    set({
      quantity: payload.quantity,
      selectedCount: payload.selectedCount,
      selectedNumbers: payload.selectedNumbers,
      couponCode: payload.couponCode,
      totalAmount: payload.totalAmount,
      subtotalAmount: payload.subtotalAmount,
      promotionDiscountAmount: payload.promotionDiscountAmount,
    }),
  resetSummary: () => set(initialSummary),
}))
