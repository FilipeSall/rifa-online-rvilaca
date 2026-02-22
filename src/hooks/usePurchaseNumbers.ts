import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import { OPEN_AUTH_MODAL_EVENT } from '../const/auth'
import { MAX_QUANTITY, MIN_QUANTITY } from '../const/purchaseNumbers'
import { DEFAULT_TICKET_PRICE } from '../const/campaign'
import { functions } from '../lib/firebase'
import { useCampaignSettings } from './useCampaignSettings'
import {
  calculateCouponDiscount,
  getCouponHint,
  validateCouponCode,
} from '../services/purchaseNumbers/purchaseNumbersService'
import { useAuthStore } from '../stores/authStore'
import type { CouponFeedback, NumberSlot, SelectionMode } from '../types/purchaseNumbers'
import { getSafeQuantity } from '../utils/purchaseNumbers'
import { logPurchaseFlow, serializeError } from '../utils/purchaseFlowLogger'

type ReserveNumbersInput = {
  numbers: number[]
}

type ReserveNumbersResponse = {
  numbers: number[]
  expiresAtMs: number
  reservationSeconds: number
}

type GetNumberWindowInput = {
  pageStart?: number
  pageSize?: number
}

type GetNumberWindowResponse = {
  campaignId: string
  pageSize: number
  pageStart: number
  pageEnd: number
  rangeStart: number
  rangeEnd: number
  totalNumbers: number
  smallestAvailableNumber: number | null
  availableInPage: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  previousPageStart: number | null
  nextPageStart: number | null
  numbers: Array<{
    number: number
    status: NumberSlot['status']
    reservationExpiresAtMs: number | null
  }>
}

type PickRandomAvailableNumbersInput = {
  quantity: number
  excludeNumbers?: number[]
}

type PickRandomAvailableNumbersResponse = {
  quantityRequested: number
  numbers: number[]
  exhausted: boolean
}

type CallableEnvelope<T> = T | { result?: T }
const NUMBER_WINDOW_PAGE_SIZE = 100

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function areNumberListsEqual(left: number[], right: number[]) {
  return (
    left.length === right.length
    && left.every((number, index) => number === right[index])
  )
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

function getCallableErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const candidate = error as { message?: string }
  if (candidate.message) {
    const cleanMessage = candidate.message
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[a-z-]+\)\.?$/i, '')
      .trim()
    if (cleanMessage) {
      return cleanMessage
    }
  }

  return fallback
}

function extractConflictedNumber(message: string) {
  const matched = /Numero\s+(\d+)/i.exec(message)
  if (!matched) {
    return null
  }

  const parsed = Number(matched[1])
  return Number.isInteger(parsed) ? parsed : null
}

export function usePurchaseNumbers() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const { campaign } = useCampaignSettings()
  const [numberPool, setNumberPool] = useState<NumberSlot[]>([])
  const [availableNumbersCount, setAvailableNumbersCount] = useState(0)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [totalNumbers, setTotalNumbers] = useState(0)
  const [pageStart, setPageStart] = useState<number | null>(null)
  const [pageEnd, setPageEnd] = useState<number | null>(null)
  const [smallestAvailableNumber, setSmallestAvailableNumber] = useState<number | null>(null)
  const [previousPageStart, setPreviousPageStart] = useState<number | null>(null)
  const [nextPageStart, setNextPageStart] = useState<number | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isAutoSelecting, setIsAutoSelecting] = useState(false)
  const [isManualAdding, setIsManualAdding] = useState(false)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('manual')
  const [quantity, setQuantity] = useState(MIN_QUANTITY)
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [appliedCouponDiscountType, setAppliedCouponDiscountType] = useState<'percent' | 'fixed' | null>(null)
  const [appliedCouponDiscountValue, setAppliedCouponDiscountValue] = useState(0)
  const [couponFeedback, setCouponFeedback] = useState<CouponFeedback | null>(null)
  const [reservationSeconds, setReservationSeconds] = useState<number | null>(null)
  const [hasExpiredReservation, setHasExpiredReservation] = useState(false)
  const [isReserving, setIsReserving] = useState(false)
  const pageRequestIdRef = useRef(0)
  const autoSelectRequestIdRef = useRef(0)
  const callables = useMemo(
    () => ({
      reserveNumbers: httpsCallable<ReserveNumbersInput, unknown>(functions, 'reserveNumbers'),
      getNumberWindow: httpsCallable<GetNumberWindowInput, unknown>(functions, 'getNumberWindow'),
      pickRandomAvailableNumbers: httpsCallable<PickRandomAvailableNumbersInput, unknown>(
        functions,
        'pickRandomAvailableNumbers',
      ),
    }),
    [],
  )

  const maxSelectable = MAX_QUANTITY
  const minPurchaseQuantity =
    Number.isInteger(campaign.minPurchaseQuantity) && campaign.minPurchaseQuantity > 0
      ? campaign.minPurchaseQuantity
      : MIN_QUANTITY

  const selectedCount = selectedNumbers.length
  const unitPrice = Number.isFinite(campaign.pricePerCota) && campaign.pricePerCota > 0
    ? campaign.pricePerCota
    : DEFAULT_TICKET_PRICE
  const subtotal = selectedCount * unitPrice
  const discountAmount = calculateCouponDiscount(
    subtotal,
    appliedCouponDiscountType,
    appliedCouponDiscountValue,
  )
  const totalAmount = Math.max(subtotal - discountAmount, 0)
  const canProceed = selectedCount >= minPurchaseQuantity && !isReserving && !isAutoSelecting && !isPageLoading

  const loadNumberWindow = useCallback(
    async (nextPageStart: number | null = null) => {
      const requestId = pageRequestIdRef.current + 1
      pageRequestIdRef.current = requestId
      setIsPageLoading(true)
      try {
        const payloadInput: GetNumberWindowInput = {
          pageSize: NUMBER_WINDOW_PAGE_SIZE,
        }

        if (nextPageStart !== null) {
          payloadInput.pageStart = nextPageStart
        }

        const callableResult = await callables.getNumberWindow(payloadInput)
        const payload = unwrapCallableData(callableResult.data as CallableEnvelope<GetNumberWindowResponse>)

        if (pageRequestIdRef.current !== requestId) {
          return null
        }

        setNumberPool(
          payload.numbers.map((item) => ({
            number: item.number,
            status: item.status,
          })),
        )
        setAvailableNumbersCount(payload.availableInPage)
        setRangeStart(payload.rangeStart)
        setRangeEnd(payload.rangeEnd)
        setTotalNumbers(payload.totalNumbers)
        setPageStart(payload.pageStart)
        setPageEnd(payload.pageEnd)
        setSmallestAvailableNumber(payload.smallestAvailableNumber)
        setPreviousPageStart(payload.previousPageStart)
        setNextPageStart(payload.nextPageStart)
        return payload
      } catch (error) {
        if (pageRequestIdRef.current === requestId) {
          logPurchaseFlow('usePurchaseNumbers', 'load_window_failed', 'error', {
            requestId,
            error: serializeError(error),
          })
          toast.error(
            getCallableErrorMessage(error, 'Nao foi possivel carregar a pagina de numeros agora.'),
            { position: 'bottom-right' },
          )
        }
        return null
      } finally {
        if (pageRequestIdRef.current === requestId) {
          setIsPageLoading(false)
        }
      }
    },
    [callables.getNumberWindow],
  )

  useEffect(() => {
    void loadNumberWindow(null)
  }, [loadNumberWindow])

  useEffect(() => {
    if (selectionMode !== 'automatico' || reservationSeconds !== null) {
      return
    }

    const preservedSelection = Array.from(new Set(selectedNumbers))
      .slice(0, quantity)
      .sort((a, b) => a - b)
    const missingQuantity = Math.max(quantity - preservedSelection.length, 0)

    if (missingQuantity === 0) {
      setSelectedNumbers((currentSelection) => {
        if (areNumberListsEqual(currentSelection, preservedSelection)) {
          return currentSelection
        }

        return preservedSelection
      })
      setIsAutoSelecting(false)
      return
    }

    const requestId = autoSelectRequestIdRef.current + 1
    autoSelectRequestIdRef.current = requestId
    setIsAutoSelecting(true)
    logPurchaseFlow('usePurchaseNumbers', 'auto_select_started', 'info', {
      requestId,
      quantity,
      missingQuantity,
      preservedSelectionCount: preservedSelection.length,
    })

    void callables.pickRandomAvailableNumbers({
      quantity: missingQuantity,
      excludeNumbers: preservedSelection,
    })
      .then((callableResult) => {
        const payload = unwrapCallableData(
          callableResult.data as CallableEnvelope<PickRandomAvailableNumbersResponse>,
        )

        if (autoSelectRequestIdRef.current !== requestId) {
          return
        }

        const mergedSelection = Array.from(new Set([...preservedSelection, ...payload.numbers]))
          .sort((a, b) => a - b)
          .slice(0, quantity)

        setSelectedNumbers((currentSelection) => (
          areNumberListsEqual(currentSelection, mergedSelection)
            ? currentSelection
            : mergedSelection
        ))
        logPurchaseFlow('usePurchaseNumbers', 'auto_select_succeeded', 'info', {
          requestId,
          quantityRequested: missingQuantity,
          quantitySelected: mergedSelection.length,
          exhausted: payload.exhausted,
        })

        if (payload.exhausted || mergedSelection.length < quantity) {
          toast.warning(
            `Apenas ${mergedSelection.length} numeros disponiveis encontrados no momento.`,
            {
              position: 'bottom-right',
              toastId: 'automatic-selection-exhausted',
            },
          )
        }
      })
      .catch((error) => {
        if (autoSelectRequestIdRef.current !== requestId) {
          return
        }

        setSelectedNumbers(preservedSelection)
        logPurchaseFlow('usePurchaseNumbers', 'auto_select_failed', 'error', {
          requestId,
          error: serializeError(error),
        })
        toast.error(
          getCallableErrorMessage(error, 'Nao foi possivel selecionar numeros automaticos agora.'),
          { position: 'bottom-right' },
        )
      })
      .finally(() => {
        if (autoSelectRequestIdRef.current === requestId) {
          setIsAutoSelecting(false)
        }
      })
  }, [
    callables.pickRandomAvailableNumbers,
    quantity,
    reservationSeconds,
    selectedNumbers,
    selectionMode,
  ])

  useEffect(() => {
    setQuantity((current) => getSafeQuantity(current, MAX_QUANTITY, minPurchaseQuantity))
  }, [minPurchaseQuantity])

  useEffect(() => {
    if (selectionMode === 'automatico' && reservationSeconds === null) {
      return
    }

    autoSelectRequestIdRef.current += 1
    setIsAutoSelecting(false)
  }, [reservationSeconds, selectionMode])

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
    if (selectedNumbers.length === 0 || reservationSeconds !== null || numberPool.length === 0) {
      return
    }

    const blockedNumbersOnPage = new Set(
      numberPool
        .filter((item) => item.status !== 'disponivel')
        .map((item) => item.number),
    )

    if (blockedNumbersOnPage.size === 0) {
      return
    }

    setSelectedNumbers((currentSelection) => {
      const nextSelection = currentSelection.filter((number) => !blockedNumbersOnPage.has(number))
      return nextSelection.length === currentSelection.length ? currentSelection : nextSelection
    })
  }, [numberPool, reservationSeconds, selectedNumbers.length])

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

  const handleSelectionModeChange = useCallback(
    (mode: SelectionMode) => {
      setSelectionMode(mode)
      clearReservationState()
    },
    [clearReservationState],
  )

  const handleSetQuantity = useCallback(
    (value: number) => {
      const safeValue = getSafeQuantity(value, MAX_QUANTITY, minPurchaseQuantity)
      setQuantity(safeValue)
      clearReservationState()
    },
    [clearReservationState, minPurchaseQuantity],
  )

  const handleClearSelectedNumbers = useCallback(() => {
    setSelectedNumbers([])
    if (selectionMode === 'automatico') {
      setSelectionMode('manual')
    }
    clearReservationState()
  }, [clearReservationState, selectionMode])

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

  const totalPages = useMemo(() => {
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
      return 1
    }

    return Math.max(1, Math.ceil((rangeEnd - rangeStart + 1) / NUMBER_WINDOW_PAGE_SIZE))
  }, [rangeEnd, rangeStart])

  const currentPage = useMemo(() => {
    if (!pageStart || !rangeStart || pageStart < rangeStart) {
      return 1
    }

    return Math.floor((pageStart - rangeStart) / NUMBER_WINDOW_PAGE_SIZE) + 1
  }, [pageStart, rangeStart])

  const handleGoToPage = useCallback(
    (pageNumber: number) => {
      if (!Number.isInteger(pageNumber)) {
        toast.warning('Informe um numero inteiro de pagina.', {
          position: 'bottom-right',
        })
        return
      }

      if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
        return
      }

      const clampedPage = Math.max(1, Math.min(pageNumber, totalPages))
      const targetPageStart = rangeStart + (clampedPage - 1) * NUMBER_WINDOW_PAGE_SIZE
      void loadNumberWindow(targetPageStart)
    },
    [loadNumberWindow, rangeEnd, rangeStart, totalPages],
  )

  const handleAddManualNumber = useCallback(
    async (number: number) => {
      logPurchaseFlow('usePurchaseNumbers', 'manual_add_requested', 'info', {
        number,
        selectionMode,
        quantity,
        selectedCount: selectedNumbers.length,
      })
      if (selectionMode !== 'manual') {
        toast.info('Mude para o modo manual para adicionar um numero especifico.', {
          position: 'bottom-right',
        })
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_mode', 'warn', {
          number,
          selectionMode,
        })
        return
      }

      if (!Number.isInteger(number)) {
        toast.warning('Digite um numero inteiro valido.', {
          position: 'bottom-right',
        })
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_not_integer', 'warn', { number })
        return
      }

      if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
        toast.warning('A faixa de numeros ainda nao foi carregada.', {
          position: 'bottom-right',
        })
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_range_not_loaded', 'warn', { number })
        return
      }

      if (number < rangeStart || number > rangeEnd) {
        toast.warning(
          `Numero fora da faixa da campanha (${rangeStart.toLocaleString('pt-BR')} a ${rangeEnd.toLocaleString('pt-BR')}).`,
          { position: 'bottom-right' },
        )
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_out_of_range', 'warn', {
          number,
          rangeStart,
          rangeEnd,
        })
        return
      }

      if (selectedNumbers.includes(number)) {
        toast.info('Este numero ja esta na sua selecao.', {
          position: 'bottom-right',
        })
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_duplicate', 'warn', { number })
        return
      }

      if (selectedNumbers.length >= quantity) {
        toast.warning(
          `Voce ja atingiu o limite de ${quantity} numeros na selecao manual. Use "Limpar selecionados" ou remova alguns.`,
          { position: 'bottom-right' },
        )
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_limit', 'warn', {
          number,
          quantity,
          selectedCount: selectedNumbers.length,
        })
        return
      }

      const targetPageStart = rangeStart + Math.floor((number - rangeStart) / NUMBER_WINDOW_PAGE_SIZE) * NUMBER_WINDOW_PAGE_SIZE

      setIsManualAdding(true)

      try {
        const payload = await loadNumberWindow(targetPageStart)
        if (!payload) {
          return
        }

        const targetNumber = payload.numbers.find((item) => item.number === number)
        if (!targetNumber) {
          toast.warning('Nao foi possivel localizar esse numero nesta campanha.', {
            position: 'bottom-right',
          })
          logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_not_found', 'warn', {
            number,
            targetPageStart,
          })
          return
        }

        if (targetNumber.status !== 'disponivel') {
          toast.warning('Esse numero nao esta disponivel no momento.', {
            position: 'bottom-right',
          })
          logPurchaseFlow('usePurchaseNumbers', 'manual_add_rejected_unavailable', 'warn', {
            number,
            targetStatus: targetNumber.status,
          })
          return
        }

        setSelectedNumbers((currentSelection) => {
          if (currentSelection.includes(number) || currentSelection.length >= quantity) {
            return currentSelection
          }

          return [...currentSelection, number].sort((a, b) => a - b)
        })
        logPurchaseFlow('usePurchaseNumbers', 'manual_add_succeeded', 'info', {
          number,
          targetPageStart,
        })
        clearReservationState()
      } finally {
        setIsManualAdding(false)
      }
    },
    [clearReservationState, loadNumberWindow, quantity, rangeEnd, rangeStart, selectedNumbers, selectionMode],
  )

  const handleApplyCoupon = useCallback(() => {
    const validation = validateCouponCode(couponCode, campaign.coupons, subtotal)

    setCouponFeedback({
      message: validation.message,
      tone: validation.status === 'valid' ? 'success' : 'neutral',
    })

    if (validation.status !== 'valid') {
      setAppliedCoupon(null)
      setAppliedCouponDiscountType(null)
      setAppliedCouponDiscountValue(0)
      return
    }

    setAppliedCoupon(validation.code)
    setAppliedCouponDiscountType(validation.discountType)
    setAppliedCouponDiscountValue(validation.discountValue)
  }, [campaign.coupons, couponCode, subtotal])

  const handleProceed = useCallback(async () => {
    logPurchaseFlow('usePurchaseNumbers', 'proceed_requested', 'info', {
      canProceed,
      isLoggedIn,
      selectedCount,
      totalAmount,
    })
    if (!canProceed) {
      logPurchaseFlow('usePurchaseNumbers', 'proceed_blocked', 'warn', {
        canProceed,
        isLoggedIn,
        selectedCount,
      })
      return
    }

    if (!isLoggedIn) {
      toast.warning('Voce precisa estar logado para comprar numeros.', {
        position: 'bottom-right',
        toastId: 'purchase-login-required',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT))
      logPurchaseFlow('usePurchaseNumbers', 'proceed_blocked_unauthenticated', 'warn', {
        selectedCount,
      })
      return
    }
    setIsReserving(true)
    logPurchaseFlow('usePurchaseNumbers', 'reserve_numbers_started', 'info', {
      selectedCount,
      selectedNumbersPreview: selectedNumbers.slice(0, 10),
      totalAmount,
    })

    try {
      const callableResult = await callables.reserveNumbers({ numbers: selectedNumbers })
      const payload = unwrapCallableData(callableResult.data as CallableEnvelope<ReserveNumbersResponse>)
      const secondsFromNow = Math.max(Math.floor((payload.expiresAtMs - Date.now()) / 1000), 0)
      logPurchaseFlow('usePurchaseNumbers', 'reserve_numbers_succeeded', 'info', {
        reservedCount: payload.numbers.length,
        reservationSeconds: secondsFromNow,
      })

      if (secondsFromNow <= 0) {
        setReservationSeconds(null)
        setHasExpiredReservation(true)
        toast.warning('Sua reserva expirou durante o processamento. Tente novamente.', {
          position: 'bottom-right',
          toastId: 'reservation-expired',
        })
        logPurchaseFlow('usePurchaseNumbers', 'reserve_numbers_expired_immediately', 'warn', {
          expiresAtMs: payload.expiresAtMs,
        })
        return
      }

      setReservationSeconds(secondsFromNow)
      setHasExpiredReservation(false)

      navigate('/checkout', {
        state: {
          amount: totalAmount,
          quantity: payload.numbers.length,
          selectedNumbers: payload.numbers,
          couponCode: appliedCoupon || undefined,
        },
      })
      logPurchaseFlow('usePurchaseNumbers', 'navigate_checkout', 'info', {
        quantity: payload.numbers.length,
        amount: totalAmount,
      })
    } catch (error) {
      const errorMessage = getReserveErrorMessage(error)
      const conflictedNumber = extractConflictedNumber(errorMessage)
      const normalized = errorMessage.toLowerCase()
      logPurchaseFlow('usePurchaseNumbers', 'reserve_numbers_failed', 'error', {
        errorMessage,
        error: serializeError(error),
        conflictedNumber,
      })

      if (
        conflictedNumber !== null
        && (normalized.includes('nao esta mais disponivel') || normalized.includes('ja foi pago'))
      ) {
        setSelectedNumbers((currentSelection) =>
          currentSelection.filter((number) => number !== conflictedNumber))
        toast.warning(
          `O numero ${conflictedNumber.toLocaleString('pt-BR')} foi reservado por outro usuario durante o processo. Selecione outro numero e tente novamente.`,
          { position: 'bottom-right' },
        )
        logPurchaseFlow('usePurchaseNumbers', 'reserve_numbers_conflict', 'warn', {
          conflictedNumber,
        })

        void loadNumberWindow(pageStart)
      } else {
        toast.error(errorMessage, {
          position: 'bottom-right',
        })
      }
    } finally {
      setIsReserving(false)
    }
  }, [
    callables.reserveNumbers,
    canProceed,
    isLoggedIn,
    loadNumberWindow,
    navigate,
    pageStart,
    selectedCount,
    selectedNumbers,
    totalAmount,
    appliedCoupon,
  ])

  const handleLoadPreviousPage = useCallback(() => {
    if (previousPageStart === null || isPageLoading) {
      return
    }

    void loadNumberWindow(previousPageStart)
  }, [isPageLoading, loadNumberWindow, previousPageStart])

  const handleLoadNextPage = useCallback(() => {
    if (nextPageStart === null || isPageLoading) {
      return
    }

    void loadNumberWindow(nextPageStart)
  }, [isPageLoading, loadNumberWindow, nextPageStart])

  return {
    numberPool,
    selectionMode,
    setSelectionMode: handleSelectionModeChange,
    quantity,
    maxSelectable,
    availableNumbersCount,
    minPurchaseQuantity,
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
    isAutoSelecting,
    isManualAdding,
    selectedNumbers,
    selectedCount,
    couponCode,
    setCouponCode,
    appliedCoupon,
    couponFeedback,
    couponHint: getCouponHint(campaign.coupons),
    unitPrice,
    reservationSeconds,
    hasExpiredReservation,
    subtotal,
    discountAmount,
    totalAmount,
    canProceed,
    isReserving,
    handleSetQuantity,
    handleClearSelectedNumbers,
    handleToggleNumber,
    handleGoToPage,
    handleAddManualNumber,
    handleApplyCoupon,
    handleLoadPreviousPage,
    handleLoadNextPage,
    handleProceed,
  }
}
