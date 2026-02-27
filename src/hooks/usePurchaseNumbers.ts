import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import { OPEN_AUTH_MODAL_EVENT } from '../const/auth'
import {
  DEFAULT_INITIAL_QUANTITY,
  MIN_QUANTITY,
  RAFFLE_NUMBER_END,
  RAFFLE_NUMBER_START,
} from '../const/purchaseNumbers'
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
import { formatTicketNumber } from '../utils/ticketNumber'

type ReserveNumbersInput = {
  numbers: number[]
}

type ReserveNumbersResponse = {
  numbers: number[]
  expiresAtMs: number
  reservationSeconds: number
}

type CallableEnvelope<T> = T | { result?: T }

const NUMBER_WINDOW_PAGE_SIZE = 50

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

function extractConflictedNumber(message: string) {
  const matched = /Numero\s+(\d+)/i.exec(message)
  if (!matched) {
    return null
  }

  const parsed = Number(matched[1])
  return Number.isInteger(parsed) ? parsed : null
}

function clampPageStart(value: number, rangeStart: number, rangeEnd: number) {
  if (rangeEnd < rangeStart) {
    return rangeStart
  }

  const total = rangeEnd - rangeStart + 1
  const totalPages = Math.max(1, Math.ceil(total / NUMBER_WINDOW_PAGE_SIZE))
  const maxPageStart = rangeStart + ((totalPages - 1) * NUMBER_WINDOW_PAGE_SIZE)
  return Math.max(rangeStart, Math.min(value, maxPageStart))
}

function buildLocalNumberPool(pageStart: number, rangeStart: number, rangeEnd: number): NumberSlot[] {
  const pageEnd = Math.min(pageStart + NUMBER_WINDOW_PAGE_SIZE - 1, rangeEnd)
  const pool: NumberSlot[] = []

  for (let number = pageStart; number <= pageEnd; number += 1) {
    pool.push({
      number,
      status: 'disponivel',
    })
  }

  return pool
}

function pickRandomUniqueNumbersFromRange(
  rangeStart: number,
  rangeEnd: number,
  quantity: number,
  excludedNumbers: number[],
) {
  const excluded = new Set(excludedNumbers)
  const total = Math.max(rangeEnd - rangeStart + 1, 0)
  const maxPossible = Math.max(total - excluded.size, 0)
  const target = Math.min(Math.max(quantity, 0), maxPossible)

  if (target <= 0) {
    return []
  }

  const selected = new Set<number>()
  const maxAttempts = Math.max(target * 30, 2000)
  let attempts = 0

  while (selected.size < target && attempts < maxAttempts) {
    const candidate = rangeStart + Math.floor(Math.random() * total)
    if (!excluded.has(candidate) && !selected.has(candidate)) {
      selected.add(candidate)
    }
    attempts += 1
  }

  if (selected.size < target) {
    const offset = Math.floor(Math.random() * total)
    for (let index = 0; index < total && selected.size < target; index += 1) {
      const candidate = rangeStart + ((offset + index) % total)
      if (!excluded.has(candidate) && !selected.has(candidate)) {
        selected.add(candidate)
      }
    }
  }

  return Array.from(selected).sort((left, right) => left - right)
}

export function usePurchaseNumbers() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const { campaign } = useCampaignSettings()

  const totalNumbers =
    Number.isInteger(campaign.totalNumbers) && campaign.totalNumbers > 0
      ? campaign.totalNumbers
      : RAFFLE_NUMBER_END
  const rangeStart = RAFFLE_NUMBER_START
  const rangeEnd = rangeStart + totalNumbers - 1

  const [pageStartState, setPageStartState] = useState(rangeStart)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('automatico')
  const [quantity, setQuantity] = useState(
    getSafeQuantity(DEFAULT_INITIAL_QUANTITY, RAFFLE_NUMBER_END, MIN_QUANTITY),
  )
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [appliedCouponDiscountType, setAppliedCouponDiscountType] = useState<'percent' | 'fixed' | null>(null)
  const [appliedCouponDiscountValue, setAppliedCouponDiscountValue] = useState(0)
  const [couponFeedback, setCouponFeedback] = useState<CouponFeedback | null>(null)
  const [reservationSeconds, setReservationSeconds] = useState<number | null>(null)
  const [hasExpiredReservation, setHasExpiredReservation] = useState(false)
  const [isReserving, setIsReserving] = useState(false)
  const [isAutoSelecting, setIsAutoSelecting] = useState(false)
  const [isManualAdding, setIsManualAdding] = useState(false)
  const [shouldHighlightSelectedNumbers, setShouldHighlightSelectedNumbers] = useState(false)
  const [shouldHighlightAutoButton, setShouldHighlightAutoButton] = useState(false)

  const selectedNumbersRef = useRef<number[]>(selectedNumbers)
  selectedNumbersRef.current = selectedNumbers

  const callables = useMemo(
    () => ({
      reserveNumbers: httpsCallable<ReserveNumbersInput, unknown>(functions, 'reserveNumbers'),
    }),
    [],
  )

  const pageStart = useMemo(
    () => clampPageStart(pageStartState, rangeStart, rangeEnd),
    [pageStartState, rangeEnd, rangeStart],
  )

  useEffect(() => {
    if (pageStart !== pageStartState) {
      setPageStartState(pageStart)
    }
  }, [pageStart, pageStartState])

  const numberPool = useMemo(
    () => buildLocalNumberPool(pageStart, rangeStart, rangeEnd),
    [pageStart, rangeEnd, rangeStart],
  )

  const pageEnd = useMemo(
    () => (numberPool.length ? numberPool[numberPool.length - 1].number : null),
    [numberPool],
  )

  const totalPages = useMemo(() => {
    if (rangeEnd < rangeStart) {
      return 1
    }

    return Math.max(1, Math.ceil((rangeEnd - rangeStart + 1) / NUMBER_WINDOW_PAGE_SIZE))
  }, [rangeEnd, rangeStart])

  const currentPage = useMemo(
    () => Math.floor((pageStart - rangeStart) / NUMBER_WINDOW_PAGE_SIZE) + 1,
    [pageStart, rangeStart],
  )

  const previousPageStart = useMemo(
    () => (pageStart > rangeStart ? Math.max(rangeStart, pageStart - NUMBER_WINDOW_PAGE_SIZE) : null),
    [pageStart, rangeStart],
  )

  const nextPageStart = useMemo(() => {
    const nextStart = pageStart + NUMBER_WINDOW_PAGE_SIZE
    return nextStart <= rangeEnd ? nextStart : null
  }, [pageStart, rangeEnd])

  const availableNumbersCount = numberPool.length
  const smallestAvailableNumber = rangeStart
  const isPageLoading = false

  const maxSelectable = totalNumbers > 0 ? totalNumbers : RAFFLE_NUMBER_END
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
  const canProceed = selectedCount >= minPurchaseQuantity && !isReserving && !isAutoSelecting

  useEffect(() => {
    setQuantity((current) => getSafeQuantity(current, maxSelectable, minPurchaseQuantity))
  }, [maxSelectable, minPurchaseQuantity])

  useEffect(() => {
    setSelectedNumbers((currentSelection) => {
      const normalized = Array.from(new Set(currentSelection))
        .filter((number) => number >= rangeStart && number <= rangeEnd)
        .sort((left, right) => left - right)
      return areNumberListsEqual(currentSelection, normalized) ? currentSelection : normalized
    })
  }, [rangeEnd, rangeStart])

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
    if (selectionMode !== 'automatico' || reservationSeconds !== null) {
      setIsAutoSelecting(false)
      return
    }

    setIsAutoSelecting(true)

    const preservedSelection = Array.from(new Set(selectedNumbersRef.current))
      .filter((number) => number >= rangeStart && number <= rangeEnd)
      .slice(0, quantity)
      .sort((left, right) => left - right)
    const missingQuantity = Math.max(quantity - preservedSelection.length, 0)

    if (missingQuantity === 0) {
      setSelectedNumbers((currentSelection) => (
        areNumberListsEqual(currentSelection, preservedSelection)
          ? currentSelection
          : preservedSelection
      ))
      setIsAutoSelecting(false)
      return
    }

    const generated = pickRandomUniqueNumbersFromRange(
      rangeStart,
      rangeEnd,
      missingQuantity,
      preservedSelection,
    )
    const mergedSelection = Array.from(new Set([...preservedSelection, ...generated]))
      .sort((left, right) => left - right)
      .slice(0, quantity)

    setSelectedNumbers((currentSelection) => (
      areNumberListsEqual(currentSelection, mergedSelection)
        ? currentSelection
        : mergedSelection
    ))
    setIsAutoSelecting(false)
  }, [quantity, rangeEnd, rangeStart, reservationSeconds, selectionMode])

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

  const triggerSelectedNumbersHighlight = useCallback(() => {
    setShouldHighlightSelectedNumbers(true)
  }, [])

  const triggerAutoButtonHighlight = useCallback(() => {
    setShouldHighlightAutoButton(true)
  }, [])

  useEffect(() => {
    if (!shouldHighlightSelectedNumbers) {
      return
    }

    const timer = window.setTimeout(() => {
      setShouldHighlightSelectedNumbers(false)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [shouldHighlightSelectedNumbers])

  useEffect(() => {
    if (!shouldHighlightAutoButton) {
      return
    }

    const timer = window.setTimeout(() => {
      setShouldHighlightAutoButton(false)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [shouldHighlightAutoButton])

  const handleSelectionModeChange = useCallback(
    (mode: SelectionMode) => {
      if (mode === 'manual') {
        setSelectedNumbers([])
      }
      setSelectionMode(mode)
      clearReservationState()
    },
    [clearReservationState],
  )

  const handleSetQuantity = useCallback(
    (value: number) => {
      const safeValue = getSafeQuantity(value, maxSelectable, minPurchaseQuantity)
      setQuantity(safeValue)
      clearReservationState()
    },
    [clearReservationState, maxSelectable, minPurchaseQuantity],
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
      if (slot.status !== 'disponivel') {
        return
      }

      if (selectionMode === 'automatico') {
        if (selectedNumbers.length >= quantity) {
          triggerSelectedNumbersHighlight()
          triggerAutoButtonHighlight()
          toast.warning('Numeros ja pre-selecionados! Quer escolher os seus? Mude para Manual ou limpe a selecao.', {
            position: 'bottom-right',
            toastId: 'selection-max-reached',
          })
        }
        return
      }

      setSelectedNumbers((currentSelection) => {
        const alreadySelected = currentSelection.includes(slot.number)

        if (alreadySelected) {
          return currentSelection.filter((selectedNumber) => selectedNumber !== slot.number)
        }

        if (currentSelection.length >= quantity) {
          triggerSelectedNumbersHighlight()
          triggerAutoButtonHighlight()
          toast.warning('Numeros ja pre-selecionados! Quer escolher os seus? Mude para Manual ou limpe a selecao.', {
            position: 'bottom-right',
            toastId: 'selection-max-reached',
          })
          return currentSelection
        }

        return [...currentSelection, slot.number].sort((left, right) => left - right)
      })
      clearReservationState()
    },
    [
      clearReservationState,
      quantity,
      selectedNumbers.length,
      selectionMode,
      triggerAutoButtonHighlight,
      triggerSelectedNumbersHighlight,
    ],
  )

  const handleGoToPage = useCallback(
    (pageNumber: number) => {
      if (!Number.isInteger(pageNumber)) {
        toast.warning('Informe um numero inteiro de pagina.', {
          position: 'bottom-right',
        })
        return
      }

      const clampedPage = Math.max(1, Math.min(pageNumber, totalPages))
      const targetPageStart = rangeStart + (clampedPage - 1) * NUMBER_WINDOW_PAGE_SIZE
      setPageStartState(targetPageStart)
    },
    [rangeStart, totalPages],
  )

  const handleAddManualNumber = useCallback(
    async (number: number) => {
      if (selectionMode !== 'manual') {
        toast.info('Mude para o modo manual para adicionar um numero especifico.', {
          position: 'bottom-right',
        })
        return
      }

      if (!Number.isInteger(number)) {
        toast.warning('Digite um numero inteiro valido.', {
          position: 'bottom-right',
        })
        return
      }

      if (number < rangeStart || number > rangeEnd) {
        toast.warning(
          `Numero fora da faixa da campanha (${formatTicketNumber(rangeStart)} a ${formatTicketNumber(rangeEnd)}).`,
          { position: 'bottom-right' },
        )
        return
      }

      if (selectedNumbers.includes(number)) {
        toast.info('Este numero ja esta na sua selecao.', {
          position: 'bottom-right',
        })
        return
      }

      if (selectedNumbers.length >= quantity) {
        toast.warning(
          `Voce ja atingiu o limite de ${quantity} numeros na selecao manual. Use "Limpar selecionados" ou remova alguns.`,
          { position: 'bottom-right' },
        )
        return
      }

      setIsManualAdding(true)

      try {
        const targetPageStart = rangeStart + (Math.floor((number - rangeStart) / NUMBER_WINDOW_PAGE_SIZE) * NUMBER_WINDOW_PAGE_SIZE)
        setPageStartState(targetPageStart)

        setSelectedNumbers((currentSelection) => {
          if (currentSelection.includes(number) || currentSelection.length >= quantity) {
            return currentSelection
          }

          return [...currentSelection, number].sort((left, right) => left - right)
        })
        clearReservationState()
      } finally {
        setIsManualAdding(false)
      }
    },
    [clearReservationState, quantity, rangeEnd, rangeStart, selectedNumbers, selectionMode],
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
    if (!canProceed) {
      return
    }

    if (!isLoggedIn) {
      toast.warning('Voce precisa estar logado para comprar numeros.', {
        position: 'bottom-right',
        toastId: 'purchase-login-required',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT))
      return
    }

    setIsReserving(true)

    try {
      const callableResult = await callables.reserveNumbers({ numbers: selectedNumbers })
      const payload = unwrapCallableData(callableResult.data as CallableEnvelope<ReserveNumbersResponse>)
      const secondsFromNow = Math.max(Math.floor((payload.expiresAtMs - Date.now()) / 1000), 0)

      if (secondsFromNow <= 0) {
        setReservationSeconds(null)
        setHasExpiredReservation(true)
        toast.warning('Sua reserva expirou durante o processamento. Tente novamente.', {
          position: 'bottom-right',
          toastId: 'reservation-expired',
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
    } catch (error) {
      const errorMessage = getReserveErrorMessage(error)
      const conflictedNumber = extractConflictedNumber(errorMessage)
      const normalized = errorMessage.toLowerCase()

      if (
        conflictedNumber !== null
        && (normalized.includes('nao esta mais disponivel') || normalized.includes('ja foi pago'))
      ) {
        const filteredSelection = selectedNumbersRef.current
          .filter((number) => number !== conflictedNumber)
          .sort((left, right) => left - right)

        setSelectedNumbers(filteredSelection)

        const shouldAutoReplace = (
          filteredSelection.length < quantity
          && typeof window !== 'undefined'
          && window.confirm(
            `O numero ${formatTicketNumber(conflictedNumber)} ja foi reservado ou comprado. Deseja gerar automaticamente outro numero para substituir?`,
          )
        )

        if (shouldAutoReplace) {
          const missingQuantity = quantity - filteredSelection.length
          const replacements = pickRandomUniqueNumbersFromRange(
            rangeStart,
            rangeEnd,
            missingQuantity,
            filteredSelection,
          )

          if (replacements.length > 0) {
            const mergedSelection = Array.from(new Set([...filteredSelection, ...replacements]))
              .sort((left, right) => left - right)
              .slice(0, quantity)
            setSelectedNumbers(mergedSelection)

            toast.info(
              `Substituimos ${replacements.length} numero(s) automaticamente. Confira a selecao e clique em comprar novamente.`,
              { position: 'bottom-right' },
            )
          } else {
            toast.warning(
              'Nao foi possivel gerar substituicao automatica no momento. Escolha outro numero e tente novamente.',
              { position: 'bottom-right' },
            )
          }
        } else {
          toast.warning(
            `O numero ${formatTicketNumber(conflictedNumber)} foi reservado por outro usuario durante o processo. Selecione outro numero e tente novamente.`,
            { position: 'bottom-right' },
          )
        }
      } else {
        toast.error(errorMessage, {
          position: 'bottom-right',
        })
      }
    } finally {
      setIsReserving(false)
    }
  }, [
    appliedCoupon,
    callables.reserveNumbers,
    canProceed,
    isLoggedIn,
    navigate,
    quantity,
    rangeEnd,
    rangeStart,
    selectedNumbers,
    totalAmount,
  ])

  const handleLoadPreviousPage = useCallback(() => {
    if (previousPageStart === null) {
      return
    }

    setPageStartState(previousPageStart)
  }, [previousPageStart])

  const handleLoadNextPage = useCallback(() => {
    if (nextPageStart === null) {
      return
    }

    setPageStartState(nextPageStart)
  }, [nextPageStart])

  return {
    campaign,
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
  }
}
