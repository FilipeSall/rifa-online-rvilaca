import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import { OPEN_AUTH_MODAL_EVENT } from '../const/auth'
import { MAX_QUANTITY, MIN_QUANTITY } from '../const/purchaseNumbers'
import { DEFAULT_TICKET_PRICE } from '../const/campaign'
import { db, functions } from '../lib/firebase'
import { useCampaignSettings } from './useCampaignSettings'
import {
  getCouponHint,
  getPurchaseNumberPool,
  type RemoteNumberState,
  validateCouponCode,
} from '../services/purchaseNumbers/purchaseNumbersService'
import { useAuthStore } from '../stores/authStore'
import type { CouponFeedback, NumberSlot, SelectionMode } from '../types/purchaseNumbers'
import { getSafeQuantity, pickRandomNumbers } from '../utils/purchaseNumbers'

type ReserveNumbersInput = {
  numbers: number[]
}

type ReserveNumbersResponse = {
  numbers: number[]
  expiresAtMs: number
  reservationSeconds: number
}

type CallableEnvelope<T> = T | { result?: T }

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function readTimestampMillis(value: unknown): number | null {
  if (!value) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return Number((value as { toMillis: () => number }).toMillis())
    } catch {
      return null
    }
  }

  return null
}

function getReserveErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Nao foi possivel reservar os numeros agora. Tente novamente.'
  }

  const candidate = error as { code?: string; message?: string }
  if (candidate.message) {
    const cleanMessage = candidate.message
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[a-z-]+\)\.?$/i, '')
      .trim()

    if (cleanMessage) {
      return cleanMessage
    }
  }

  if (candidate.code === 'functions/unauthenticated') {
    return 'Voce precisa estar logado para reservar numeros.'
  }

  return 'Nao foi possivel reservar os numeros agora. Tente novamente.'
}

export function usePurchaseNumbers() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const { campaign } = useCampaignSettings()
  const [remoteStateByNumber, setRemoteStateByNumber] = useState<Map<number, RemoteNumberState>>(() => new Map())
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('automatico')
  const [quantity, setQuantity] = useState(MIN_QUANTITY)
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [discountRate, setDiscountRate] = useState(0)
  const [couponFeedback, setCouponFeedback] = useState<CouponFeedback | null>(null)
  const [reservationSeconds, setReservationSeconds] = useState<number | null>(null)
  const [hasExpiredReservation, setHasExpiredReservation] = useState(false)
  const [isReserving, setIsReserving] = useState(false)
  const reserveNumbers = useMemo(
    () => httpsCallable<ReserveNumbersInput, unknown>(functions, 'reserveNumbers'),
    [],
  )

  const numberPool = useMemo(
    () => getPurchaseNumberPool(remoteStateByNumber),
    [remoteStateByNumber],
  )

  const availableNumbers = useMemo(
    () => numberPool.filter((item) => item.status === 'disponivel').map((item) => item.number),
    [numberPool],
  )

  const maxSelectable = useMemo(
    () => Math.min(MAX_QUANTITY, availableNumbers.length),
    [availableNumbers.length],
  )

  const selectedCount = selectedNumbers.length
  const unitPrice = Number.isFinite(campaign.pricePerCota) && campaign.pricePerCota > 0
    ? campaign.pricePerCota
    : DEFAULT_TICKET_PRICE
  const subtotal = selectedCount * unitPrice
  const discountAmount = subtotal * discountRate
  const totalAmount = Math.max(subtotal - discountAmount, 0)
  const canProceed = selectedCount >= MIN_QUANTITY && !isReserving

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'raffleNumbers'),
      (snapshot) => {
        const nextState = new Map<number, RemoteNumberState>()

        snapshot.forEach((documentSnapshot) => {
          const data = documentSnapshot.data()
          const number = Number(data.number ?? documentSnapshot.id)

          if (!Number.isInteger(number)) {
            return
          }

          nextState.set(number, {
            status: typeof data.status === 'string' ? data.status : 'disponivel',
            reservationExpiresAtMs: readTimestampMillis(data.reservationExpiresAt ?? data.expiresAt),
          })
        })

        setRemoteStateByNumber(nextState)
      },
      (error) => {
        console.warn('Failed to subscribe raffleNumbers:', error)
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    if (selectionMode !== 'automatico' || reservationSeconds !== null) {
      return
    }

    setSelectedNumbers(pickRandomNumbers(availableNumbers, quantity))
  }, [availableNumbers, quantity, reservationSeconds, selectionMode])

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
    if (selectedNumbers.length === 0 || reservationSeconds !== null) {
      return
    }

    const availableSet = new Set(availableNumbers)
    setSelectedNumbers((currentSelection) => {
      const nextSelection = currentSelection.filter((number) => availableSet.has(number))
      return nextSelection.length === currentSelection.length ? currentSelection : nextSelection
    })
  }, [availableNumbers, reservationSeconds, selectedNumbers.length])

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

  const handleProceed = useCallback(async () => {
    if (!canProceed) {
      return
    }

    if (!isLoggedIn) {
      toast.warning('Voce precisa estar logado para reservar numeros.', {
        position: 'bottom-right',
        toastId: 'purchase-login-required',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT))
      return
    }

    if (reservationSeconds === null) {
      setIsReserving(true)

      try {
        const callableResult = await reserveNumbers({ numbers: selectedNumbers })
        const payload = unwrapCallableData(callableResult.data as CallableEnvelope<ReserveNumbersResponse>)
        const secondsFromNow = Math.max(Math.floor((payload.expiresAtMs - Date.now()) / 1000), 0)

        if (secondsFromNow <= 0) {
          setReservationSeconds(null)
          setHasExpiredReservation(true)
          toast.warning('Sua reserva expirou. Tente reservar novamente.', {
            position: 'bottom-right',
            toastId: 'reservation-expired',
          })
          return
        }

        setReservationSeconds(secondsFromNow)
        setHasExpiredReservation(false)
      } catch (error) {
        toast.error(getReserveErrorMessage(error), {
          position: 'bottom-right',
        })
      } finally {
        setIsReserving(false)
      }

      return
    }

    navigate('/checkout', {
      state: {
        amount: totalAmount,
        quantity: selectedCount,
        selectedNumbers,
      },
    })
  }, [canProceed, isLoggedIn, navigate, reservationSeconds, reserveNumbers, selectedCount, selectedNumbers, totalAmount])

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
    unitPrice,
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
  }
}
