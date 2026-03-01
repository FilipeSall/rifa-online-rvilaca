import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import { OPEN_AUTH_MODAL_EVENT } from '../const/auth'
import {
  CAMPAIGN_PACK_QUANTITIES,
} from '../const/campaign'
import {
  DEFAULT_INITIAL_QUANTITY,
  MAX_QUANTITY,
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
import { usePurchaseSummaryStore } from '../stores/purchaseSummaryStore'
import type { CouponFeedback, NumberSlot, SelectionMode } from '../types/purchaseNumbers'
import { calculateCampaignPricing } from '../utils/campaignPricing'
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

type GetNumberChunkWindowInput = {
  campaignId?: string
  pageStart?: number
  pageSize?: number
}

type GetNumberChunkWindowResponse = {
  campaignId: string
  pageSize: number
  pageStart: number
  pageEnd: number
  rangeStart: number
  rangeEnd: number
  totalNumbers: number
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

type ConflictResolutionState = {
  conflictedNumbers: number[]
  filteredSelection: number[]
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

  const candidate = error as { code?: string; details?: unknown; message?: string }
  if (candidate.code === 'functions/invalid-argument' && candidate.details && typeof candidate.details === 'object') {
    const details = candidate.details as { maxAllowed?: unknown }
    const maxAllowed = Number(details.maxAllowed)
    if (Number.isInteger(maxAllowed) && maxAllowed > 0) {
      return `Voce pode reservar no maximo ${maxAllowed} numeros por tentativa.`
    }
  }

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

function toIntegerList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )).sort((a, b) => a - b)
}

function extractConflictedNumbers(error: unknown, message: string): number[] {
  if (error && typeof error === 'object') {
    const candidate = error as { details?: unknown }
    if (candidate.details && typeof candidate.details === 'object') {
      const details = candidate.details as { conflictedNumbers?: unknown }
      const fromDetails = toIntegerList(details.conflictedNumbers)
      if (fromDetails.length > 0) {
        return fromDetails
      }
    }
  }

  const single = extractConflictedNumber(message)
  if (single !== null) {
    return [single]
  }

  const maybeList = message.match(/(\d+)/g) || []
  return Array.from(new Set(
    maybeList
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )).sort((a, b) => a - b)
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

function sanitizeWindowResponse(
  payload: GetNumberChunkWindowResponse | null,
  fallback: {
    rangeStart: number
    rangeEnd: number
    totalNumbers: number
    pageStart: number
  },
): GetNumberChunkWindowResponse | null {
  if (!payload) {
    return null
  }

  const rangeStart = Number.isInteger(payload.rangeStart) ? payload.rangeStart : fallback.rangeStart
  const rangeEnd = Number.isInteger(payload.rangeEnd) && payload.rangeEnd >= rangeStart
    ? payload.rangeEnd
    : fallback.rangeEnd
  const totalNumbers = Number.isInteger(payload.totalNumbers) && payload.totalNumbers > 0
    ? payload.totalNumbers
    : Math.max(rangeEnd - rangeStart + 1, fallback.totalNumbers)
  const pageSize = Number.isInteger(payload.pageSize) && payload.pageSize > 0 ? payload.pageSize : NUMBER_WINDOW_PAGE_SIZE
  const rawPageStart = Number.isInteger(payload.pageStart) ? payload.pageStart : fallback.pageStart
  const pageStart = clampPageStart(rawPageStart, rangeStart, rangeEnd)
  const pageEnd = Number.isInteger(payload.pageEnd) ? payload.pageEnd : Math.min(pageStart + pageSize - 1, rangeEnd)
  const numbers = Array.isArray(payload.numbers)
    ? payload.numbers
      .map((item) => ({
        number: Number(item.number),
        status: item.status,
        reservationExpiresAtMs: Number.isFinite(item.reservationExpiresAtMs) ? Number(item.reservationExpiresAtMs) : null,
      }))
      .filter((item) =>
        Number.isInteger(item.number)
        && item.number >= rangeStart
        && item.number <= rangeEnd
        && (item.status === 'disponivel' || item.status === 'reservado' || item.status === 'pago'))
      .sort((left, right) => left.number - right.number)
    : []

  return {
    ...payload,
    pageSize,
    pageStart,
    pageEnd: Math.max(pageStart, Math.min(pageEnd, rangeEnd)),
    rangeStart,
    rangeEnd,
    totalNumbers,
    availableInPage: Number.isInteger(payload.availableInPage)
      ? payload.availableInPage
      : numbers.filter((item) => item.status === 'disponivel').length,
    hasPreviousPage: Boolean(payload.hasPreviousPage),
    hasNextPage: Boolean(payload.hasNextPage),
    previousPageStart: Number.isInteger(payload.previousPageStart ?? null) ? Number(payload.previousPageStart) : null,
    nextPageStart: Number.isInteger(payload.nextPageStart ?? null) ? Number(payload.nextPageStart) : null,
    numbers,
  }
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

export function usePurchaseNumbers(options?: { initialSelectionMode?: SelectionMode }) {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const setPurchaseSummary = usePurchaseSummaryStore((state) => state.setSummary)
  const { campaign } = useCampaignSettings()
  const initialSelectionMode = options?.initialSelectionMode === 'manual' ? 'manual' : 'automatico'

  const baseTotalNumbers =
    Number.isInteger(campaign.totalNumbers) && campaign.totalNumbers > 0
      ? campaign.totalNumbers
      : RAFFLE_NUMBER_END
  const baseRangeStart = RAFFLE_NUMBER_START
  const baseRangeEnd = baseRangeStart + baseTotalNumbers - 1

  const [pageStartState, setPageStartState] = useState(baseRangeStart)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(initialSelectionMode)
  const [quantity, setQuantity] = useState(
    getSafeQuantity(DEFAULT_INITIAL_QUANTITY, MAX_QUANTITY, CAMPAIGN_PACK_QUANTITIES[0]),
  )
  const [numberWindow, setNumberWindow] = useState<GetNumberChunkWindowResponse | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(false)
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
  const [isQuickCheckoutPending, setIsQuickCheckoutPending] = useState(false)
  const [shouldHighlightSelectedNumbers, setShouldHighlightSelectedNumbers] = useState(false)
  const [shouldHighlightAutoButton, setShouldHighlightAutoButton] = useState(false)
  const [conflictResolution, setConflictResolution] = useState<ConflictResolutionState | null>(null)

  const selectedNumbersRef = useRef<number[]>(selectedNumbers)
  selectedNumbersRef.current = selectedNumbers
  const lastReserveAttemptRef = useRef<{ fingerprint: string; atMs: number } | null>(null)
  const hasPromptedAuthForQuickCheckoutRef = useRef(false)
  const numberWindowRequestRef = useRef(0)

  const callables = useMemo(
    () => ({
      reserveNumbers: httpsCallable<ReserveNumbersInput, unknown>(functions, 'reserveNumbers'),
      getNumberChunkWindow: httpsCallable<GetNumberChunkWindowInput, unknown>(functions, 'getNumberChunkWindow'),
    }),
    [],
  )

  const rangeStart = numberWindow?.rangeStart ?? baseRangeStart
  const rangeEnd = numberWindow?.rangeEnd ?? baseRangeEnd
  const totalNumbers = numberWindow?.totalNumbers ?? baseTotalNumbers

  const pageStart = useMemo(
    () => clampPageStart(pageStartState, rangeStart, rangeEnd),
    [pageStartState, rangeEnd, rangeStart],
  )

  useEffect(() => {
    if (pageStart !== pageStartState) {
      setPageStartState(pageStart)
    }
  }, [pageStart, pageStartState])

  useEffect(() => {
    const requestId = numberWindowRequestRef.current + 1
    numberWindowRequestRef.current = requestId
    setIsPageLoading(true)

    void callables.getNumberChunkWindow({
      pageStart,
      pageSize: NUMBER_WINDOW_PAGE_SIZE,
    })
      .then((callableResult) => {
        if (requestId !== numberWindowRequestRef.current) {
          return
        }

        const payload = unwrapCallableData(
          callableResult.data as CallableEnvelope<GetNumberChunkWindowResponse>,
        )
        const sanitized = sanitizeWindowResponse(payload, {
          rangeStart: baseRangeStart,
          rangeEnd: baseRangeEnd,
          totalNumbers: baseTotalNumbers,
          pageStart,
        })
        setNumberWindow(sanitized)
      })
      .catch((error) => {
        if (requestId !== numberWindowRequestRef.current) {
          return
        }

        setNumberWindow(null)
        const message = getReserveErrorMessage(error)
        toast.error(`Nao foi possivel carregar a pagina de numeros. ${message}`, {
          position: 'bottom-right',
          toastId: 'number-window-load-error',
        })
      })
      .finally(() => {
        if (requestId === numberWindowRequestRef.current) {
          setIsPageLoading(false)
        }
      })
  }, [
    baseRangeEnd,
    baseRangeStart,
    baseTotalNumbers,
    callables.getNumberChunkWindow,
    pageStart,
  ])

  useEffect(() => {
    if (!numberWindow) {
      return
    }

    if (numberWindow.pageStart !== pageStartState) {
      setPageStartState(numberWindow.pageStart)
    }
  }, [numberWindow, pageStartState])

  const numberPool = useMemo(
    () => {
      if (numberWindow && numberWindow.numbers.length > 0) {
        return numberWindow.numbers.map((item) => ({
          number: item.number,
          status: item.status,
        }))
      }

      return buildLocalNumberPool(pageStart, rangeStart, rangeEnd)
    },
    [numberWindow, pageStart, rangeEnd, rangeStart],
  )

  const pageEnd = useMemo(
    () => {
      if (numberWindow && Number.isInteger(numberWindow.pageEnd)) {
        return numberWindow.pageEnd
      }

      return numberPool.length ? numberPool[numberPool.length - 1].number : null
    },
    [numberPool, numberWindow],
  )

  const totalPages = useMemo(() => {
    if (rangeEnd < rangeStart) {
      return 1
    }

    return Math.max(1, Math.ceil((rangeEnd - rangeStart + 1) / NUMBER_WINDOW_PAGE_SIZE))
  }, [rangeEnd, rangeStart])

  const currentPage = useMemo(
    () => Math.floor(((numberWindow?.pageStart ?? pageStart) - rangeStart) / NUMBER_WINDOW_PAGE_SIZE) + 1,
    [numberWindow?.pageStart, pageStart, rangeStart],
  )

  const previousPageStart = useMemo(
    () => (
      numberWindow
        ? numberWindow.previousPageStart
        : (pageStart > rangeStart ? Math.max(rangeStart, pageStart - NUMBER_WINDOW_PAGE_SIZE) : null)
    ),
    [numberWindow, pageStart, rangeStart],
  )

  const nextPageStart = useMemo(() => {
    if (numberWindow) {
      return numberWindow.nextPageStart
    }

    const nextStart = pageStart + NUMBER_WINDOW_PAGE_SIZE
    return nextStart <= rangeEnd ? nextStart : null
  }, [numberWindow, pageStart, rangeEnd])

  const availableNumbersCount = numberWindow
    ? numberWindow.availableInPage
    : numberPool.filter((item) => item.status === 'disponivel').length

  const reservationCap = Math.max(
    1,
    Math.min(totalNumbers > 0 ? totalNumbers : RAFFLE_NUMBER_END, MAX_QUANTITY),
  )
  const activePackQuantities = useMemo(() => (
    campaign.packPrices
      .filter((item) => item.active)
      .map((item) => item.quantity)
      .filter((item, index, list) => Number.isInteger(item) && item > 0 && list.indexOf(item) === index)
      .sort((left, right) => left - right)
  ), [campaign.packPrices])
  const availablePackQuantities = useMemo(() => {
    const base = activePackQuantities.length > 0
      ? activePackQuantities
      : [...CAMPAIGN_PACK_QUANTITIES]
    const withinCap = base.filter((quantityOption) => quantityOption <= reservationCap)
    if (withinCap.length > 0) {
      return withinCap
    }

    return [reservationCap]
  }, [activePackQuantities, reservationCap])
  const minSelectableQuantity = availablePackQuantities[0]
  const maxSelectable = availablePackQuantities[availablePackQuantities.length - 1]

  const selectedCount = selectedNumbers.length
  const unitPrice = Number.isFinite(campaign.pricePerCota) && campaign.pricePerCota > 0
    ? campaign.pricePerCota
    : DEFAULT_TICKET_PRICE
  const pricingWithoutCoupon = useMemo(
    () => calculateCampaignPricing(selectedCount, campaign, null),
    [campaign, selectedCount],
  )
  const subtotal = pricingWithoutCoupon.subtotalBase
  const promotionDiscountAmount = pricingWithoutCoupon.promotionDiscount
  const promotionDiscountPercent = pricingWithoutCoupon.appliedPromotion?.discountType === 'percent'
    ? pricingWithoutCoupon.appliedPromotion.discountValue
    : null
  const subtotalAfterPromotion = pricingWithoutCoupon.subtotalAfterPromotion
  const couponDiscountAmount = calculateCouponDiscount(
    subtotalAfterPromotion,
    appliedCouponDiscountType,
    appliedCouponDiscountValue,
  )
  const discountAmount = Number((promotionDiscountAmount + couponDiscountAmount).toFixed(2))
  const totalAmount = Math.max(subtotalAfterPromotion - couponDiscountAmount, 0)
  const canProceed = selectedCount >= minSelectableQuantity && !isReserving && !isAutoSelecting

  useEffect(() => {
    setPurchaseSummary({
      quantity,
      selectedCount,
      selectedNumbers,
      couponCode: appliedCoupon,
      totalAmount,
      subtotalAmount: subtotal,
      promotionDiscountAmount,
    })
  }, [
    appliedCoupon,
    promotionDiscountAmount,
    quantity,
    selectedCount,
    selectedNumbers,
    setPurchaseSummary,
    subtotal,
    totalAmount,
  ])

  useEffect(() => {
    setQuantity((current) => getSafeQuantity(current, maxSelectable, minSelectableQuantity))
  }, [maxSelectable, minSelectableQuantity])

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
      const safeValue = getSafeQuantity(value, maxSelectable, minSelectableQuantity)
      setQuantity(safeValue)
      clearReservationState()
    },
    [clearReservationState, maxSelectable, minSelectableQuantity],
  )

  const handleClearSelectedNumbers = useCallback(() => {
    setSelectedNumbers([])
    if (selectionMode === 'automatico') {
      setSelectionMode('manual')
    }
    clearReservationState()
  }, [clearReservationState, selectionMode])

  const handleFillRemainingAutomatically = useCallback(() => {
    const preservedSelection = Array.from(new Set(selectedNumbersRef.current))
      .filter((number) => number >= rangeStart && number <= rangeEnd)
      .slice(0, quantity)
      .sort((left, right) => left - right)
    const missingQuantity = Math.max(quantity - preservedSelection.length, 0)

    if (missingQuantity <= 0) {
      return
    }

    const generated = pickRandomUniqueNumbersFromRange(
      rangeStart,
      rangeEnd,
      missingQuantity,
      preservedSelection,
    )

    if (generated.length === 0) {
      toast.warning('Nao foi possivel completar a selecao automaticamente no momento.', {
        position: 'bottom-right',
      })
      return
    }

    const mergedSelection = Array.from(new Set([...preservedSelection, ...generated]))
      .sort((left, right) => left - right)
      .slice(0, quantity)

    setSelectedNumbers((currentSelection) => (
      areNumberListsEqual(currentSelection, mergedSelection)
        ? currentSelection
        : mergedSelection
    ))
    setSelectionMode('manual')
    clearReservationState()
  }, [clearReservationState, quantity, rangeEnd, rangeStart])

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
        const callableResult = await callables.getNumberChunkWindow({
          pageStart: targetPageStart,
          pageSize: NUMBER_WINDOW_PAGE_SIZE,
        })
        const payload = unwrapCallableData(callableResult.data as CallableEnvelope<GetNumberChunkWindowResponse>)
        const sanitized = sanitizeWindowResponse(payload, {
          rangeStart: baseRangeStart,
          rangeEnd: baseRangeEnd,
          totalNumbers: baseTotalNumbers,
          pageStart: targetPageStart,
        })
        setNumberWindow(sanitized)
        setPageStartState(sanitized?.pageStart ?? targetPageStart)

        const isAvailable = sanitized?.numbers.find((item) => item.number === number)?.status === 'disponivel'
        if (!isAvailable) {
          toast.warning(
            `O numero ${formatTicketNumber(number)} nao esta disponivel agora. Escolha outro numero.`,
            { position: 'bottom-right' },
          )
          return
        }

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
    [
      baseRangeEnd,
      baseRangeStart,
      baseTotalNumbers,
      callables.getNumberChunkWindow,
      clearReservationState,
      quantity,
      rangeEnd,
      rangeStart,
      selectedNumbers,
      selectionMode,
    ],
  )

  const handleApplyCoupon = useCallback(() => {
    const validation = validateCouponCode(couponCode, campaign.coupons, subtotalAfterPromotion)

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
  }, [campaign.coupons, couponCode, subtotalAfterPromotion])

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

    const reserveFingerprint = selectedNumbers.slice().sort((left, right) => left - right).join(',')
    const nowMs = Date.now()
    const lastAttempt = lastReserveAttemptRef.current

    if (
      lastAttempt
      && lastAttempt.fingerprint === reserveFingerprint
      && (nowMs - lastAttempt.atMs) < 1200
    ) {
      toast.info('Aguarde um instante antes de tentar reservar os mesmos numeros novamente.', {
        position: 'bottom-right',
        toastId: 'reserve-same-selection-throttle',
      })
      return
    }

    lastReserveAttemptRef.current = {
      fingerprint: reserveFingerprint,
      atMs: nowMs,
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
          isAutomaticSelection: selectionMode === 'automatico',
        },
      })
    } catch (error) {
      const errorMessage = getReserveErrorMessage(error)
      const conflictedNumbers = extractConflictedNumbers(error, errorMessage)
        .filter((number) => number >= rangeStart && number <= rangeEnd)
      const normalized = errorMessage.toLowerCase()

      if (
        conflictedNumbers.length > 0
        && (normalized.includes('nao esta mais disponivel') || normalized.includes('ja foi pago'))
      ) {
        const filteredSelection = selectedNumbersRef.current
          .filter((number) => !conflictedNumbers.includes(number))
          .sort((left, right) => left - right)

        setSelectedNumbers(filteredSelection)
        setConflictResolution({
          conflictedNumbers,
          filteredSelection,
        })
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
    selectionMode,
    selectedNumbers,
    totalAmount,
  ])

  const handleQuickCheckout = useCallback(() => {
    if (selectionMode !== 'automatico') {
      setSelectionMode('automatico')
    }

    setIsQuickCheckoutPending(true)
  }, [selectionMode])

  useEffect(() => {
    if (!isQuickCheckoutPending) {
      hasPromptedAuthForQuickCheckoutRef.current = false
      return
    }

    if (!isLoggedIn) {
      if (!hasPromptedAuthForQuickCheckoutRef.current) {
        hasPromptedAuthForQuickCheckoutRef.current = true
        toast.info('Entre na conta para continuar sua compra no checkout.', {
          position: 'bottom-right',
          toastId: 'quick-checkout-login-required',
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT))
      }
      return
    }

    hasPromptedAuthForQuickCheckoutRef.current = false

    if (!canProceed || isReserving || isAutoSelecting) {
      return
    }

    setIsQuickCheckoutPending(false)
    void handleProceed()
  }, [canProceed, handleProceed, isAutoSelecting, isLoggedIn, isQuickCheckoutPending, isReserving])

  const closeConflictResolutionModal = useCallback(() => {
    setConflictResolution(null)
  }, [])

  const resolveConflictWithAutomaticNumber = useCallback(() => {
    if (!conflictResolution) {
      return
    }

    const missingQuantity = quantity - conflictResolution.filteredSelection.length
    if (missingQuantity <= 0) {
      setConflictResolution(null)
      return
    }

    const replacements = pickRandomUniqueNumbersFromRange(
      rangeStart,
      rangeEnd,
      missingQuantity,
      conflictResolution.filteredSelection,
    )

    if (replacements.length > 0) {
      const mergedSelection = Array.from(new Set([...conflictResolution.filteredSelection, ...replacements]))
        .sort((left, right) => left - right)
        .slice(0, quantity)
      setSelectedNumbers(mergedSelection)
      toast.info(
        `Substituimos ${replacements.length} numero(s) automaticamente. Confira a selecao e clique em comprar novamente.`,
        { position: 'bottom-right' },
      )
    } else {
      toast.warning(
        'Nao foi possivel gerar substituicao automatica no momento. Escolha outro numero manualmente.',
        { position: 'bottom-right' },
      )
    }

    setConflictResolution(null)
  }, [conflictResolution, quantity, rangeEnd, rangeStart])

  const resolveConflictManually = useCallback(() => {
    if (!conflictResolution) {
      return
    }

    setSelectionMode('manual')
    setConflictResolution(null)
    const preview = conflictResolution.conflictedNumbers
      .slice(0, 3)
      .map((number) => formatTicketNumber(number))
      .join(', ')
    const suffix = conflictResolution.conflictedNumbers.length > 3 ? '...' : ''
    toast.info(
      `Escolha manualmente novos numeros para substituir: ${preview}${suffix}`,
      { position: 'bottom-right' },
    )
  }, [conflictResolution])

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
    availablePackQuantities,
    maxSelectable,
    availableNumbersCount,
    minSelectableQuantity,
    rangeStart,
    rangeEnd,
    totalNumbers,
    pageStart,
    pageEnd,
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
    promotionDiscountAmount,
    subtotalAfterPromotion,
    promotionDiscountPercent,
    discountAmount,
    couponDiscountAmount,
    totalAmount,
    canProceed,
    isReserving,
    isQuickCheckoutPending,
    shouldHighlightSelectedNumbers,
    shouldHighlightAutoButton,
    conflictResolution,
    handleSetQuantity,
    handleClearSelectedNumbers,
    handleFillRemainingAutomatically,
    handleToggleNumber,
    handleGoToPage,
    handleAddManualNumber,
    handleApplyCoupon,
    handleQuickCheckout,
    handleLoadPreviousPage,
    handleLoadNextPage,
    handleProceed,
    closeConflictResolutionModal,
    resolveConflictWithAutomaticNumber,
    resolveConflictManually,
  }
}
