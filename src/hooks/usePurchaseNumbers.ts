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

type PickRandomAvailableNumbersInput = {
  campaignId?: string
  quantity: number
  excludeNumbers?: number[]
}

type PickRandomAvailableNumbersResponse = {
  campaignId: string
  quantityRequested: number
  numbers: number[]
  exhausted: boolean
}

type GetNumberChunkWindowInput = {
  campaignId?: string
  pageStart?: number
  pageSize?: number
}

type GetManualNumberSelectionSnapshotInput = {
  campaignId?: string
  number?: number | string
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

type GetManualNumberSelectionSnapshotResponse = GetNumberChunkWindowResponse & {
  lookup: {
    number: number
    formattedNumber: string
    status: NumberSlot['status']
    reservationExpiresAtMs: number | null
  }
}

type ConflictResolutionState = {
  conflictedNumbers: number[]
  filteredSelection: number[]
}

type CallableEnvelope<T> = T | { result?: T }

const NUMBER_WINDOW_PAGE_SIZE = 50
const NUMBER_WINDOW_CACHE_TTL_MS = 120_000
const NUMBER_WINDOW_CACHE_MAX_PAGES = 12
const PAID_NUMBERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const PAID_NUMBERS_CACHE_MAX_CHUNKS = 400
const AUTO_RESERVE_CONFLICT_MAX_RETRIES = 3

type PaidNumbersChunkCacheEntry = {
  updatedAtMs: number
  numbers: Set<number>
}

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function buildNumberWindowCacheStorageKey(campaignId: string) {
  return `purchase-numbers-window-cache:${campaignId}`
}

function buildPaidNumbersCacheStorageKey(campaignId: string) {
  return `purchase-numbers-paid-cache:${campaignId}`
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
  const [isWindowCacheReady, setIsWindowCacheReady] = useState(() => typeof window === 'undefined')
  const [paidNumbersCacheVersion, setPaidNumbersCacheVersion] = useState(0)

  const selectedNumbersRef = useRef<number[]>(selectedNumbers)
  selectedNumbersRef.current = selectedNumbers
  const lastReserveAttemptRef = useRef<{ fingerprint: string; atMs: number } | null>(null)
  const hasPromptedAuthForQuickCheckoutRef = useRef(false)
  const numberWindowRequestRef = useRef(0)
  const numberWindowCacheRef = useRef(new Map<number, { payload: GetNumberChunkWindowResponse; fetchedAt: number }>())
  const numberWindowInFlightRef = useRef(new Map<number, Promise<GetNumberChunkWindowResponse | null>>())
  const paidNumbersChunkCacheRef = useRef(new Map<number, PaidNumbersChunkCacheEntry>())

  const callables = useMemo(
    () => ({
      reserveNumbers: httpsCallable<ReserveNumbersInput, unknown>(functions, 'reserveNumbers'),
      pickRandomAvailableNumbers: httpsCallable<PickRandomAvailableNumbersInput, unknown>(
        functions,
        'pickRandomAvailableNumbers',
      ),
      getNumberChunkWindow: httpsCallable<GetNumberChunkWindowInput, unknown>(functions, 'getNumberChunkWindow'),
      getManualNumberSelectionSnapshot: httpsCallable<GetManualNumberSelectionSnapshotInput, unknown>(
        functions,
        'getManualNumberSelectionSnapshot',
      ),
    }),
    [],
  )

  const rangeStart = numberWindow?.rangeStart ?? baseRangeStart
  const rangeEnd = numberWindow?.rangeEnd ?? baseRangeEnd
  const totalNumbers = numberWindow?.totalNumbers ?? baseTotalNumbers
  const numberWindowCacheStorageKey = useMemo(
    () => buildNumberWindowCacheStorageKey(campaign.id || 'default'),
    [campaign.id],
  )
  const paidNumbersCacheStorageKey = useMemo(
    () => buildPaidNumbersCacheStorageKey(campaign.id || 'default'),
    [campaign.id],
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

  const persistWindowCache = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nowMs = Date.now()
    const serializable = Array.from(numberWindowCacheRef.current.entries())
      .filter(([, entry]) => (nowMs - entry.fetchedAt) <= NUMBER_WINDOW_CACHE_TTL_MS)
      .sort((left, right) => right[1].fetchedAt - left[1].fetchedAt)
      .slice(0, NUMBER_WINDOW_CACHE_MAX_PAGES)
      .map(([pageStartEntry, entry]) => ({
        pageStart: pageStartEntry,
        fetchedAt: entry.fetchedAt,
        payload: entry.payload,
      }))

    if (serializable.length === 0) {
      window.sessionStorage.removeItem(numberWindowCacheStorageKey)
      return
    }

    window.sessionStorage.setItem(numberWindowCacheStorageKey, JSON.stringify(serializable))
  }, [numberWindowCacheStorageKey])

  const persistPaidNumbersCache = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nowMs = Date.now()
    const serializable = Array.from(paidNumbersChunkCacheRef.current.entries())
      .filter(([, entry]) => Number.isFinite(entry.updatedAtMs) && (nowMs - entry.updatedAtMs) <= PAID_NUMBERS_CACHE_TTL_MS)
      .sort((left, right) => right[1].updatedAtMs - left[1].updatedAtMs)
      .slice(0, PAID_NUMBERS_CACHE_MAX_CHUNKS)
      .map(([pageStartEntry, entry]) => ({
        pageStart: pageStartEntry,
        updatedAtMs: entry.updatedAtMs,
        numbers: Array.from(entry.numbers)
          .filter((number) => Number.isInteger(number) && number >= pageStartEntry && number <= (pageStartEntry + NUMBER_WINDOW_PAGE_SIZE - 1))
          .sort((left, right) => left - right),
      }))
      .filter((entry) => entry.numbers.length > 0)

    if (serializable.length === 0) {
      window.localStorage.removeItem(paidNumbersCacheStorageKey)
      return
    }

    window.localStorage.setItem(
      paidNumbersCacheStorageKey,
      JSON.stringify({
        chunks: serializable,
      }),
    )
  }, [paidNumbersCacheStorageKey])

  const mergePaidNumbersIntoCache = useCallback(
    (params: { pageStart: number; numbers: number[] }) => {
      if (params.numbers.length === 0) {
        return
      }

      const safePageStart = clampPageStart(params.pageStart, baseRangeStart, baseRangeEnd)
      const pageEnd = Math.min(safePageStart + NUMBER_WINDOW_PAGE_SIZE - 1, baseRangeEnd)
      const currentEntry = paidNumbersChunkCacheRef.current.get(safePageStart)
      const nextNumbers = new Set(currentEntry?.numbers || [])
      let hasChanges = false

      for (const number of params.numbers) {
        if (!Number.isInteger(number) || number < safePageStart || number > pageEnd) {
          continue
        }

        if (!nextNumbers.has(number)) {
          nextNumbers.add(number)
          hasChanges = true
        }
      }

      if (!hasChanges || nextNumbers.size === 0) {
        return
      }

      paidNumbersChunkCacheRef.current.set(safePageStart, {
        updatedAtMs: Date.now(),
        numbers: nextNumbers,
      })
      persistPaidNumbersCache()
      setPaidNumbersCacheVersion((current) => current + 1)
    },
    [baseRangeEnd, baseRangeStart, persistPaidNumbersCache],
  )

  useEffect(() => {
    numberWindowCacheRef.current.clear()
    numberWindowInFlightRef.current.clear()
    paidNumbersChunkCacheRef.current.clear()

    if (typeof window === 'undefined') {
      setPaidNumbersCacheVersion((current) => current + 1)
      setIsWindowCacheReady(true)
      return
    }

    const nowMs = Date.now()
    const nextPaidNumbersByChunk = new Map<number, PaidNumbersChunkCacheEntry>()

    const mergeChunkPaidNumbers = (params: { pageStart: number; numbers: number[]; updatedAtMs: number }) => {
      const safePageStart = clampPageStart(params.pageStart, baseRangeStart, baseRangeEnd)
      const pageEnd = Math.min(safePageStart + NUMBER_WINDOW_PAGE_SIZE - 1, baseRangeEnd)
      const previousEntry = nextPaidNumbersByChunk.get(safePageStart)
      const mergedNumbers = new Set(previousEntry?.numbers || [])

      for (const candidate of params.numbers) {
        const number = Number(candidate)
        if (!Number.isInteger(number) || number < safePageStart || number > pageEnd) {
          continue
        }

        mergedNumbers.add(number)
      }

      if (mergedNumbers.size === 0) {
        return
      }

      nextPaidNumbersByChunk.set(safePageStart, {
        updatedAtMs: Math.max(previousEntry?.updatedAtMs || 0, params.updatedAtMs),
        numbers: mergedNumbers,
      })
    }

    const rawPaidNumbers = window.localStorage.getItem(paidNumbersCacheStorageKey)
    if (rawPaidNumbers) {
      try {
        const parsed = JSON.parse(rawPaidNumbers) as {
          chunks?: unknown
          updatedAtMs?: unknown
          numbers?: unknown
        }

        const chunksRaw = Array.isArray(parsed.chunks) ? parsed.chunks : []
        for (const item of chunksRaw) {
          if (!item || typeof item !== 'object') {
            continue
          }

          const chunk = item as {
            pageStart?: unknown
            updatedAtMs?: unknown
            numbers?: unknown
          }
          const pageStartEntry = Number(chunk.pageStart)
          const updatedAtMs = Number(chunk.updatedAtMs)

          if (!Number.isInteger(pageStartEntry) || !Number.isFinite(updatedAtMs)) {
            continue
          }
          if ((nowMs - updatedAtMs) > PAID_NUMBERS_CACHE_TTL_MS) {
            continue
          }

          mergeChunkPaidNumbers({
            pageStart: pageStartEntry,
            updatedAtMs,
            numbers: Array.isArray(chunk.numbers) ? chunk.numbers as number[] : [],
          })
        }

        // Backward compatibility: old global shape { updatedAtMs, numbers }.
        const legacyUpdatedAtMs = Number(parsed.updatedAtMs)
        const legacyIsFresh = Number.isFinite(legacyUpdatedAtMs) && (nowMs - legacyUpdatedAtMs) <= PAID_NUMBERS_CACHE_TTL_MS
        if (nextPaidNumbersByChunk.size === 0 && legacyIsFresh && Array.isArray(parsed.numbers)) {
          const byChunk = new Map<number, number[]>()
          for (const candidate of parsed.numbers) {
            const number = Number(candidate)
            if (!Number.isInteger(number) || number < baseRangeStart || number > baseRangeEnd) {
              continue
            }

            const pageStartEntry = baseRangeStart
              + (Math.floor((number - baseRangeStart) / NUMBER_WINDOW_PAGE_SIZE) * NUMBER_WINDOW_PAGE_SIZE)
            const list = byChunk.get(pageStartEntry) || []
            list.push(number)
            byChunk.set(pageStartEntry, list)
          }

          for (const [pageStartEntry, numbers] of byChunk.entries()) {
            mergeChunkPaidNumbers({
              pageStart: pageStartEntry,
              updatedAtMs: legacyUpdatedAtMs,
              numbers,
            })
          }
        }
      } catch {
        window.localStorage.removeItem(paidNumbersCacheStorageKey)
      }
    }

    const raw = window.sessionStorage.getItem(numberWindowCacheStorageKey)
    if (!raw) {
      paidNumbersChunkCacheRef.current = nextPaidNumbersByChunk
      persistPaidNumbersCache()
      setPaidNumbersCacheVersion((current) => current + 1)
      setIsWindowCacheReady(true)
      return
    }

    try {
      const parsed = JSON.parse(raw) as Array<{ pageStart?: unknown; fetchedAt?: unknown; payload?: unknown }>
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const pageStartFromEntry = Number(item.pageStart)
          const fetchedAt = Number(item.fetchedAt)
          if (!Number.isInteger(pageStartFromEntry) || !Number.isFinite(fetchedAt)) {
            continue
          }
          if ((nowMs - fetchedAt) > NUMBER_WINDOW_CACHE_TTL_MS) {
            continue
          }

          const sanitized = sanitizeWindowResponse(item.payload as GetNumberChunkWindowResponse, {
            rangeStart: baseRangeStart,
            rangeEnd: baseRangeEnd,
            totalNumbers: baseTotalNumbers,
            pageStart: pageStartFromEntry,
          })
          if (!sanitized) {
            continue
          }

          numberWindowCacheRef.current.set(sanitized.pageStart, {
            payload: sanitized,
            fetchedAt,
          })

          mergeChunkPaidNumbers({
            pageStart: sanitized.pageStart,
            updatedAtMs: fetchedAt,
            numbers: sanitized.numbers
              .filter((slot) => slot.status === 'pago')
              .map((slot) => slot.number),
          })
        }
      }
    } catch {
      window.sessionStorage.removeItem(numberWindowCacheStorageKey)
    } finally {
      paidNumbersChunkCacheRef.current = nextPaidNumbersByChunk
      persistPaidNumbersCache()
      setPaidNumbersCacheVersion((current) => current + 1)
      setIsWindowCacheReady(true)
    }
  }, [
    baseRangeEnd,
    baseRangeStart,
    baseTotalNumbers,
    numberWindowCacheStorageKey,
    paidNumbersCacheStorageKey,
    persistPaidNumbersCache,
  ])

  const fetchWindowPage = useCallback(
    async (
      requestedPageStart: number,
      options?: {
        useCache?: boolean
      },
    ) => {
      const useCache = options?.useCache !== false
      const safePageStart = clampPageStart(requestedPageStart, baseRangeStart, baseRangeEnd)
      const nowMs = Date.now()

      if (useCache) {
        const cached = numberWindowCacheRef.current.get(safePageStart)
        if (cached && (nowMs - cached.fetchedAt) <= NUMBER_WINDOW_CACHE_TTL_MS) {
          mergePaidNumbersIntoCache({
            pageStart: cached.payload.pageStart,
            numbers: cached.payload.numbers
              .filter((item) => item.status === 'pago')
              .map((item) => item.number),
          })
          return cached.payload
        }
      }

      const ongoing = numberWindowInFlightRef.current.get(safePageStart)
      if (ongoing) {
        return ongoing
      }

      const request = callables.getNumberChunkWindow({
        pageStart: safePageStart,
        pageSize: NUMBER_WINDOW_PAGE_SIZE,
      })
        .then((callableResult) => {
          const payload = unwrapCallableData(
            callableResult.data as CallableEnvelope<GetNumberChunkWindowResponse>,
          )
          const sanitized = sanitizeWindowResponse(payload, {
            rangeStart: baseRangeStart,
            rangeEnd: baseRangeEnd,
            totalNumbers: baseTotalNumbers,
            pageStart: safePageStart,
          })

          if (sanitized) {
            numberWindowCacheRef.current.set(sanitized.pageStart, {
              payload: sanitized,
              fetchedAt: Date.now(),
            })
            persistWindowCache()
            mergePaidNumbersIntoCache({
              pageStart: sanitized.pageStart,
              numbers: sanitized.numbers
                .filter((item) => item.status === 'pago')
                .map((item) => item.number),
            })
          }

          return sanitized
        })
        .finally(() => {
          numberWindowInFlightRef.current.delete(safePageStart)
        })

      numberWindowInFlightRef.current.set(safePageStart, request)

      return request
    },
    [
      baseRangeEnd,
      baseRangeStart,
      baseTotalNumbers,
      callables.getNumberChunkWindow,
      mergePaidNumbersIntoCache,
      persistWindowCache,
    ],
  )

  useEffect(() => {
    if (!isWindowCacheReady) {
      return
    }

    const requestId = numberWindowRequestRef.current + 1
    numberWindowRequestRef.current = requestId
    setIsPageLoading(true)

    void fetchWindowPage(pageStart)
      .then((sanitized) => {
        if (requestId !== numberWindowRequestRef.current) {
          return
        }

        if (sanitized) {
          setNumberWindow(sanitized)
        }
      })
      .catch((error) => {
        if (requestId !== numberWindowRequestRef.current) {
          return
        }

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
    fetchWindowPage,
    isWindowCacheReady,
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
        const paidNumbersInChunk = paidNumbersChunkCacheRef.current.get(numberWindow.pageStart)?.numbers || new Set<number>()
        return numberWindow.numbers.map((item) => ({
          number: item.number,
          status: paidNumbersInChunk.has(item.number) ? 'pago' : item.status,
        }))
      }

      return []
    },
    [numberWindow, paidNumbersCacheVersion],
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

  const availableNumbersCount = numberPool.filter((item) => item.status === 'disponivel').length

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

  const requestAvailableNumbers = useCallback(
    async (params: { quantity: number; excludeNumbers: number[] }) => {
      const targetQuantity = Math.max(0, Math.floor(params.quantity))
      if (targetQuantity <= 0) {
        return [] as number[]
      }

      const normalizedExcluded = Array.from(new Set(
        params.excludeNumbers
          .map((number) => Number(number))
          .filter((number) => Number.isInteger(number) && number >= rangeStart && number <= rangeEnd),
      ))

      const callableResult = await callables.pickRandomAvailableNumbers({
        quantity: targetQuantity,
        excludeNumbers: normalizedExcluded,
      })
      const payload = unwrapCallableData(
        callableResult.data as CallableEnvelope<PickRandomAvailableNumbersResponse>,
      )

      return Array.from(new Set(
        (payload?.numbers || [])
          .map((number) => Number(number))
          .filter((number) =>
            Number.isInteger(number)
            && number >= rangeStart
            && number <= rangeEnd
            && !normalizedExcluded.includes(number)),
      ))
        .sort((left, right) => left - right)
        .slice(0, targetQuantity)
    },
    [callables.pickRandomAvailableNumbers, rangeEnd, rangeStart],
  )

  useEffect(() => {
    if (selectionMode !== 'automatico' || reservationSeconds !== null) {
      setIsAutoSelecting(false)
      return
    }

    let isCancelled = false
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

    void requestAvailableNumbers({
      quantity: missingQuantity,
      excludeNumbers: preservedSelection,
    })
      .then((generatedFromBackend) => {
        if (isCancelled) {
          return
        }

        const missingAfterBackend = Math.max(missingQuantity - generatedFromBackend.length, 0)
        const fallbackGenerated = missingAfterBackend > 0
          ? pickRandomUniqueNumbersFromRange(
            rangeStart,
            rangeEnd,
            missingAfterBackend,
            [...preservedSelection, ...generatedFromBackend],
          )
          : []
        const mergedSelection = Array.from(new Set([
          ...preservedSelection,
          ...generatedFromBackend,
          ...fallbackGenerated,
        ]))
          .sort((left, right) => left - right)
          .slice(0, quantity)

        setSelectedNumbers((currentSelection) => (
          areNumberListsEqual(currentSelection, mergedSelection)
            ? currentSelection
            : mergedSelection
        ))
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        const fallbackGenerated = pickRandomUniqueNumbersFromRange(
          rangeStart,
          rangeEnd,
          missingQuantity,
          preservedSelection,
        )
        const mergedSelection = Array.from(new Set([...preservedSelection, ...fallbackGenerated]))
          .sort((left, right) => left - right)
          .slice(0, quantity)

        setSelectedNumbers((currentSelection) => (
          areNumberListsEqual(currentSelection, mergedSelection)
            ? currentSelection
            : mergedSelection
        ))
      })
      .finally(() => {
        if (!isCancelled) {
          setIsAutoSelecting(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [quantity, rangeEnd, rangeStart, requestAvailableNumbers, reservationSeconds, selectionMode])

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

  const handleFillRemainingAutomatically = useCallback(async () => {
    const preservedSelection = Array.from(new Set(selectedNumbersRef.current))
      .filter((number) => number >= rangeStart && number <= rangeEnd)
      .slice(0, quantity)
      .sort((left, right) => left - right)
    const missingQuantity = Math.max(quantity - preservedSelection.length, 0)

    if (missingQuantity <= 0) {
      return
    }

    let generated: number[] = []

    try {
      generated = await requestAvailableNumbers({
        quantity: missingQuantity,
        excludeNumbers: preservedSelection,
      })
    } catch {
      generated = []
    }

    if (generated.length < missingQuantity) {
      const fallbackGenerated = pickRandomUniqueNumbersFromRange(
        rangeStart,
        rangeEnd,
        missingQuantity - generated.length,
        [...preservedSelection, ...generated],
      )
      generated = [...generated, ...fallbackGenerated]
    }

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
  }, [clearReservationState, quantity, rangeEnd, rangeStart, requestAvailableNumbers])

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
        const snapshotResult = await callables.getManualNumberSelectionSnapshot({
          number,
          pageSize: NUMBER_WINDOW_PAGE_SIZE,
        })
        const snapshotPayload = unwrapCallableData(
          snapshotResult.data as CallableEnvelope<GetManualNumberSelectionSnapshotResponse>,
        )
        const sanitized = sanitizeWindowResponse(snapshotPayload, {
          rangeStart: baseRangeStart,
          rangeEnd: baseRangeEnd,
          totalNumbers: baseTotalNumbers,
          pageStart: targetPageStart,
        })

        if (sanitized) {
          numberWindowCacheRef.current.set(sanitized.pageStart, {
            payload: sanitized,
            fetchedAt: Date.now(),
          })
          persistWindowCache()
          mergePaidNumbersIntoCache({
            pageStart: sanitized.pageStart,
            numbers: sanitized.numbers
              .filter((item) => item.status === 'pago')
              .map((item) => item.number),
          })
          setNumberWindow(sanitized)
          setPageStartState(sanitized.pageStart)
        } else {
          setPageStartState(targetPageStart)
        }

        if (snapshotPayload.lookup?.status !== 'disponivel') {
          toast.warning(
            `O numero ${formatTicketNumber(number)} nao esta disponivel agora. Escolha outro numero.`,
            { position: 'bottom-right' },
          )
          return
        }

        const statusInPage = sanitized?.numbers.find((item) => item.number === number)?.status
        const isAvailable = !statusInPage || statusInPage === 'disponivel'
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
      } catch (error) {
        const message = getReserveErrorMessage(error)
        toast.error(`Nao foi possivel verificar o numero agora. ${message}`, {
          position: 'bottom-right',
        })
      } finally {
        setIsManualAdding(false)
      }
    },
    [
      baseRangeEnd,
      baseRangeStart,
      baseTotalNumbers,
      callables.getManualNumberSelectionSnapshot,
      clearReservationState,
      mergePaidNumbersIntoCache,
      persistWindowCache,
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
      let selectionForReservation = Array.from(new Set(selectedNumbersRef.current))
        .filter((number) => Number.isInteger(number) && number >= rangeStart && number <= rangeEnd)
        .sort((left, right) => left - right)

      for (let attempt = 0; attempt <= AUTO_RESERVE_CONFLICT_MAX_RETRIES; attempt += 1) {
        try {
          const callableResult = await callables.reserveNumbers({ numbers: selectionForReservation })
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

          setSelectedNumbers((currentSelection) => (
            areNumberListsEqual(currentSelection, selectionForReservation)
              ? currentSelection
              : selectionForReservation
          ))
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
          return
        } catch (error) {
          const errorMessage = getReserveErrorMessage(error)
          const conflictedNumbers = extractConflictedNumbers(error, errorMessage)
            .filter((number) => number >= rangeStart && number <= rangeEnd)
          const normalizedMessage = errorMessage.toLowerCase()
          const errorCode = (
            error
            && typeof error === 'object'
            && 'code' in error
            && typeof (error as { code?: unknown }).code === 'string'
          )
            ? String((error as { code?: string }).code).toLowerCase()
            : ''
          const isAvailabilityConflict = conflictedNumbers.length > 0 && (
            normalizedMessage.includes('nao esta mais disponivel')
            || normalizedMessage.includes('nao estao mais disponiveis')
            || normalizedMessage.includes('ja foi pago')
            || errorCode.includes('failed-precondition')
          )

          if (!isAvailabilityConflict) {
            throw error
          }

          if (numberWindow && conflictedNumbers.length > 0) {
            const chunkEnd = Math.min(numberWindow.pageStart + NUMBER_WINDOW_PAGE_SIZE - 1, rangeEnd)
            mergePaidNumbersIntoCache({
              pageStart: numberWindow.pageStart,
              numbers: conflictedNumbers.filter(
                (number) => number >= numberWindow.pageStart && number <= chunkEnd,
              ),
            })
          }

          const filteredSelection = selectionForReservation
            .filter((number) => !conflictedNumbers.includes(number))
            .sort((left, right) => left - right)

          if (selectionMode !== 'automatico') {
            setSelectedNumbers(filteredSelection)
            setConflictResolution({
              conflictedNumbers,
              filteredSelection,
            })
            return
          }

          const missingQuantity = Math.max(quantity - filteredSelection.length, 0)
          if (missingQuantity <= 0) {
            selectionForReservation = filteredSelection
            continue
          }

          let replacements: number[] = []
          try {
            replacements = await requestAvailableNumbers({
              quantity: missingQuantity,
              excludeNumbers: [...filteredSelection, ...conflictedNumbers],
            })
          } catch {
            replacements = []
          }

          if (replacements.length === 0) {
            setSelectedNumbers(filteredSelection)
            toast.warning(
              'Alguns numeros ficaram indisponiveis e nao foi possivel encontrar substitutos automaticos agora.',
              { position: 'bottom-right' },
            )
            return
          }

          selectionForReservation = Array.from(new Set([...filteredSelection, ...replacements]))
            .filter((number) => Number.isInteger(number) && number >= rangeStart && number <= rangeEnd)
            .sort((left, right) => left - right)
            .slice(0, quantity)
          setSelectedNumbers(selectionForReservation)

          if (attempt < AUTO_RESERVE_CONFLICT_MAX_RETRIES) {
            toast.info('Numero indisponivel detectado. Atualizamos a selecao e vamos tentar novamente.', {
              position: 'bottom-right',
              toastId: 'auto-retry-reserve-conflict',
            })
          }
        }
      }

      toast.warning('Nao foi possivel confirmar a reserva apos varias tentativas. Tente novamente.', {
        position: 'bottom-right',
      })
    } catch (error) {
      const errorMessage = getReserveErrorMessage(error)
      toast.error(errorMessage, {
        position: 'bottom-right',
      })
    } finally {
      setIsReserving(false)
    }
  }, [
    appliedCoupon,
    callables.reserveNumbers,
    canProceed,
    isLoggedIn,
    mergePaidNumbersIntoCache,
    navigate,
    numberWindow,
    quantity,
    rangeEnd,
    rangeStart,
    requestAvailableNumbers,
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
