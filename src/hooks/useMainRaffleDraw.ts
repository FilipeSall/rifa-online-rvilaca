import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

type CallableEnvelope<T> = T | { result?: T }

type RawMainRaffleWinner = {
  userId?: unknown
  name?: unknown
}

type RawMainRaffleResult = {
  campaignId?: unknown
  drawId?: unknown
  drawDate?: unknown
  drawPrize?: unknown
  extractionNumbers?: unknown
  selectedExtractionIndex?: unknown
  selectedExtractionNumber?: unknown
  raffleRangeStart?: unknown
  raffleRangeEnd?: unknown
  raffleTotalNumbers?: unknown
  moduloTargetOffset?: unknown
  targetNumber?: unknown
  targetNumberFormatted?: unknown
  winningNumber?: unknown
  winningNumberFormatted?: unknown
  fallbackDirection?: unknown
  winner?: RawMainRaffleWinner
  publishedAtMs?: unknown
}

type GetLatestMainRaffleDrawOutput = {
  hasResult?: unknown
  result?: RawMainRaffleResult | null
}

type GetPublicMainRaffleDrawHistoryOutput = {
  results?: unknown
}
const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000
const FETCH_EVERY_DAYS = 5
const HISTORY_LIMIT = 20
const RESULT_CACHE_KEY = 'rifa-online:cache:main-raffle:result:v1'
const HISTORY_CACHE_KEY = 'rifa-online:cache:main-raffle:history:v1'
const RESULT_LAST_FETCH_KEY = 'rifa-online:last-fetch:main-raffle:result:v1'
const HISTORY_LAST_FETCH_KEY = 'rifa-online:last-fetch:main-raffle:history:v1'

type PublishMainRaffleDrawInput = {
  extractionNumbers: string[]
  extractionIndex: number
  drawPrize: string
}

type MainRaffleHistoryInput = {
  limit?: number
}

export type MainRaffleDrawResult = {
  campaignId: string
  drawId: string
  drawDate: string
  drawPrize: string
  extractionNumbers: string[]
  selectedExtractionIndex: number
  selectedExtractionNumber: string
  raffleRangeStart: number
  raffleRangeEnd: number
  raffleTotalNumbers: number
  moduloTargetOffset: number
  targetNumber: number
  targetNumberFormatted: string
  winningNumber: number
  winningNumberFormatted: string
  fallbackDirection: 'none' | 'above' | 'below'
  winner: {
    userId: string
    name: string
  }
  publishedAtMs: number
}

type MainRaffleResultCache = {
  result: MainRaffleDrawResult | null
}

type MainRaffleHistoryCache = {
  results: MainRaffleDrawResult[]
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

function sanitizeString(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim()
  return normalized || fallback
}

function sanitizeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeResult(raw: RawMainRaffleResult | null | undefined): MainRaffleDrawResult | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const extractionNumbers = Array.isArray(raw.extractionNumbers)
    ? raw.extractionNumbers.map((item) => sanitizeString(item))
    : []
  const winnerRaw = raw.winner || {}
  const fallbackDirection = raw.fallbackDirection === 'above'
    ? 'above'
    : raw.fallbackDirection === 'below'
      ? 'below'
      : 'none'

  const result: MainRaffleDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    drawDate: sanitizeString(raw.drawDate),
    drawPrize: sanitizeString(raw.drawPrize),
    extractionNumbers,
    selectedExtractionIndex: sanitizeInteger(raw.selectedExtractionIndex),
    selectedExtractionNumber: sanitizeString(raw.selectedExtractionNumber),
    raffleRangeStart: sanitizeInteger(raw.raffleRangeStart),
    raffleRangeEnd: sanitizeInteger(raw.raffleRangeEnd),
    raffleTotalNumbers: sanitizeInteger(raw.raffleTotalNumbers),
    moduloTargetOffset: sanitizeInteger(raw.moduloTargetOffset),
    targetNumber: sanitizeInteger(raw.targetNumber),
    targetNumberFormatted: sanitizeString(raw.targetNumberFormatted),
    winningNumber: sanitizeInteger(raw.winningNumber),
    winningNumberFormatted: sanitizeString(raw.winningNumberFormatted),
    fallbackDirection,
    winner: {
      userId: sanitizeString(winnerRaw.userId),
      name: sanitizeString(winnerRaw.name, 'Participante'),
    },
    publishedAtMs: sanitizeNumber(raw.publishedAtMs),
  }

  if (
    !result.campaignId ||
    !result.drawId ||
    !result.drawDate ||
    !result.drawPrize ||
    result.extractionNumbers.length !== 5 ||
    result.selectedExtractionIndex < 1 ||
    result.selectedExtractionIndex > 5 ||
    !result.selectedExtractionNumber ||
    result.targetNumber <= 0 ||
    result.winningNumber <= 0 ||
    !result.winner.userId
  ) {
    return null
  }

  return result
}

export function useMainRaffleDraw(autoRefresh = false) {
  const [result, setResult] = useState<MainRaffleDrawResult | null>(null)
  const [history, setHistory] = useState<MainRaffleDrawResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const getLatestMainRaffleDraw = useMemo(
    () => httpsCallable<Record<string, never>, unknown>(functions, 'getLatestMainRaffleDraw'),
    [],
  )
  const getPublicMainRaffleDrawHistory = useMemo(
    () => httpsCallable<MainRaffleHistoryInput, unknown>(functions, 'getPublicMainRaffleDrawHistory'),
    [],
  )
  const publishMainRaffleDraw = useMemo(
    () => httpsCallable<PublishMainRaffleDrawInput, unknown>(functions, 'publishMainRaffleDraw'),
    [],
  )

  const refreshResult = useCallback(async () => {
    try {
      const response = await getLatestMainRaffleDraw({})
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetLatestMainRaffleDrawOutput>)
      const normalized = normalizeResult((payload?.result || null) as RawMainRaffleResult | null)
      setResult(normalized)
      writeCachedJson(RESULT_CACHE_KEY, { result: normalized } satisfies MainRaffleResultCache)
      markFetchedNow(RESULT_LAST_FETCH_KEY)
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar o ultimo sorteio principal.')
    } finally {
      setIsLoading(false)
    }
  }, [getLatestMainRaffleDraw])

  const refreshHistory = useCallback(async () => {
    setIsHistoryLoading(true)
    try {
      const response = await getPublicMainRaffleDrawHistory({ limit: HISTORY_LIMIT })
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetPublicMainRaffleDrawHistoryOutput>)
      const normalizedHistory = Array.isArray(payload?.results)
        ? payload.results
          .map((item) => normalizeResult(item as RawMainRaffleResult))
          .filter((item): item is MainRaffleDrawResult => Boolean(item))
        : []
      setHistory(normalizedHistory)
      writeCachedJson(HISTORY_CACHE_KEY, { results: normalizedHistory } satisfies MainRaffleHistoryCache)
      markFetchedNow(HISTORY_LAST_FETCH_KEY)
    } catch {
      setHistory([])
    } finally {
      setIsHistoryLoading(false)
    }
  }, [getPublicMainRaffleDrawHistory])

  const publishResult = useCallback(async (input: PublishMainRaffleDrawInput) => {
    setIsPublishing(true)
    try {
      const response = await publishMainRaffleDraw(input)
      const payload = unwrapCallableData(response.data as CallableEnvelope<RawMainRaffleResult>)
      const normalized = normalizeResult(payload)
      if (!normalized) {
        throw new Error('Resposta invalida ao publicar sorteio principal.')
      }

      setResult(normalized)
      writeCachedJson(RESULT_CACHE_KEY, { result: normalized } satisfies MainRaffleResultCache)
      markFetchedNow(RESULT_LAST_FETCH_KEY)
      setHistory((current) => {
        const merged = [normalized, ...current]
        const unique = new Map(merged.map((item) => [item.drawId, item]))
        return Array.from(unique.values()).sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
      })
      setErrorMessage(null)
      return normalized
    } finally {
      setIsPublishing(false)
    }
  }, [publishMainRaffleDraw])

  useEffect(() => {
    const cachedResult = readCachedJson<MainRaffleResultCache>(RESULT_CACHE_KEY)
    if (cachedResult && 'result' in cachedResult) {
      setResult(cachedResult.result)
    }

    const cachedHistory = readCachedJson<MainRaffleHistoryCache>(HISTORY_CACHE_KEY)
    if (cachedHistory && Array.isArray(cachedHistory.results)) {
      setHistory(cachedHistory.results)
    }

    const shouldFetchResult = shouldFetchAfterDays(RESULT_LAST_FETCH_KEY, FETCH_EVERY_DAYS)
    if (shouldFetchResult || !cachedResult) {
      void refreshResult()
    } else {
      setIsLoading(false)
    }

    const shouldFetchHistory = shouldFetchAfterDays(HISTORY_LAST_FETCH_KEY, FETCH_EVERY_DAYS)
    if (shouldFetchHistory || !cachedHistory) {
      void refreshHistory()
    } else {
      setIsHistoryLoading(false)
    }
  }, [refreshHistory, refreshResult])

  useEffect(() => {
    if (!autoRefresh) {
      return
    }

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      if (shouldFetchAfterDays(RESULT_LAST_FETCH_KEY, FETCH_EVERY_DAYS)) {
        void refreshResult()
      }
      if (shouldFetchAfterDays(HISTORY_LAST_FETCH_KEY, FETCH_EVERY_DAYS)) {
        void refreshHistory()
      }
    }

    const intervalId = window.setInterval(() => {
      runRefresh()
    }, AUTO_REFRESH_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [autoRefresh, refreshHistory, refreshResult])

  return {
    result,
    history,
    isLoading,
    isHistoryLoading,
    isPublishing,
    errorMessage,
    refreshResult,
    refreshHistory,
    publishResult,
  }
}
