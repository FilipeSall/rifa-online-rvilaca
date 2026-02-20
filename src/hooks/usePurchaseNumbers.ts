import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_QUANTITY, MIN_QUANTITY, RESERVATION_SECONDS, UNIT_PRICE } from '../const/purchaseNumbers'
import {
  getCouponHint,
  getPurchaseNumberPool,
  validateCouponCode,
} from '../services/purchaseNumbers/purchaseNumbersService'
import type { CouponFeedback, NumberSlot, SelectionMode } from '../types/purchaseNumbers'
import { getSafeQuantity, pickRandomNumbers } from '../utils/purchaseNumbers'

export function usePurchaseNumbers() {
  const navigate = useNavigate()
  const [numberPool] = useState(() => getPurchaseNumberPool())
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('automatico')
  const [quantity, setQuantity] = useState(MIN_QUANTITY)
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [discountRate, setDiscountRate] = useState(0)
  const [couponFeedback, setCouponFeedback] = useState<CouponFeedback | null>(null)
  const [reservationSeconds, setReservationSeconds] = useState<number | null>(null)
  const [hasExpiredReservation, setHasExpiredReservation] = useState(false)

  const availableNumbers = useMemo(
    () => numberPool.filter((item) => item.status === 'disponivel').map((item) => item.number),
    [numberPool],
  )

  const maxSelectable = useMemo(
    () => Math.min(MAX_QUANTITY, availableNumbers.length),
    [availableNumbers.length],
  )

  const selectedCount = selectedNumbers.length
  const subtotal = selectedCount * UNIT_PRICE
  const discountAmount = subtotal * discountRate
  const totalAmount = Math.max(subtotal - discountAmount, 0)
  const canProceed = selectedCount >= MIN_QUANTITY

  useEffect(() => {
    if (selectionMode !== 'automatico') {
      return
    }

    setSelectedNumbers(pickRandomNumbers(availableNumbers, quantity))
  }, [selectionMode, quantity, availableNumbers])

  useEffect(() => {
    if (selectionMode !== 'manual') {
      return
    }

    setSelectedNumbers((currentSelection) => {
      if (currentSelection.length <= quantity) {
        return currentSelection
      }

      return currentSelection.slice(0, quantity)
    })
  }, [quantity, selectionMode])

  useEffect(() => {
    if (reservationSeconds === null) {
      return
    }

    if (reservationSeconds <= 0) {
      setReservationSeconds(null)
      setHasExpiredReservation(true)
      return
    }

    const timer = window.setInterval(() => {
      setReservationSeconds((currentTime) => {
        if (currentTime === null) {
          return null
        }

        return currentTime - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [reservationSeconds])

  const clearReservationState = useCallback(() => {
    setReservationSeconds(null)
    setHasExpiredReservation(false)
  }, [])

  const handleSetQuantity = useCallback(
    (value: number) => {
      const safeValue = getSafeQuantity(value, availableNumbers.length)
      setQuantity(safeValue)
      clearReservationState()
    },
    [availableNumbers.length, clearReservationState],
  )

  const handleToggleNumber = useCallback(
    (slot: NumberSlot) => {
      if (selectionMode !== 'manual' || slot.status !== 'disponivel') {
        return
      }

      setSelectedNumbers((currentSelection) => {
        const alreadySelected = currentSelection.includes(slot.number)

        if (alreadySelected) {
          return currentSelection.filter((selectedNumber) => selectedNumber !== slot.number)
        }

        if (currentSelection.length >= quantity) {
          return currentSelection
        }

        return [...currentSelection, slot.number].sort((a, b) => a - b)
      })
      clearReservationState()
    },
    [clearReservationState, quantity, selectionMode],
  )

  const handleApplyCoupon = useCallback(() => {
    const validation = validateCouponCode(couponCode)

    setCouponFeedback({
      message: validation.message,
      tone: validation.status === 'valid' ? 'success' : 'neutral',
    })

    if (validation.status !== 'valid') {
      setAppliedCoupon(null)
      setDiscountRate(0)
      return
    }

    setAppliedCoupon(validation.code)
    setDiscountRate(validation.discountRate)
  }, [couponCode])

  const handleProceed = useCallback(() => {
    if (!canProceed) {
      return
    }

    if (reservationSeconds === null) {
      setReservationSeconds(RESERVATION_SECONDS)
      setHasExpiredReservation(false)
      return
    }

    navigate('/checkout')
  }, [canProceed, navigate, reservationSeconds])

  return {
    numberPool,
    selectionMode,
    setSelectionMode,
    quantity,
    maxSelectable,
    availableNumbersCount: availableNumbers.length,
    selectedNumbers,
    selectedCount,
    couponCode,
    setCouponCode,
    appliedCoupon,
    couponFeedback,
    couponHint: getCouponHint(),
    reservationSeconds,
    hasExpiredReservation,
    subtotal,
    discountAmount,
    totalAmount,
    canProceed,
    handleSetQuantity,
    handleToggleNumber,
    handleApplyCoupon,
    handleProceed,
  }
}
