import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

type CallableEnvelope<T> = T | { result?: T }

type RawTopBuyersDrawWinner = {
  userId?: unknown
  name?: unknown
  cotas?: unknown
  pos?: unknown
}

type RawTopBuyersDrawItem = {
  pos?: unknown
  userId?: unknown
  name?: unknown
  cotas?: unknown
  firstPurchaseAtMs?: unknown
}

type RawAttempt = {
  extractionIndex?: unknown
  extractionNumber?: unknown
  comparisonDigits?: unknown
  rawCandidateCode?: unknown
  candidateCode?: unknown
  nearestDirection?: unknown
  nearestDistance?: unknown
  matchedPosition?: unknown
}

type RawTopBuyersDrawResult = {
  campaignId?: unknown
  drawId?: unknown
  drawDate?: unknown
  drawPrize?: unknown
  weekId?: unknown
  weekStartAtMs?: unknown
  weekEndAtMs?: unknown
  requestedRankingLimit?: unknown
  participantCount?: unknown
  comparisonDigits?: unknown
  extractionNumbers?: unknown
  attempts?: unknown
  winningPosition?: unknown
  winningCode?: unknown
  resolvedBy?: unknown
  winner?: RawTopBuyersDrawWinner
  winnerTicketNumbers?: unknown
  rankingSnapshot?: unknown
  publishedAtMs?: unknown
}

type GetLatestTopBuyersDrawOutput = {
  hasResult?: unknown
  result?: RawTopBuyersDrawResult | null
}

type GetTopBuyersDrawHistoryOutput = {
  results?: unknown
}

type HistoryScope = 'none' | 'admin' | 'public'
const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000
const FETCH_EVERY_DAYS = 5
const PUBLIC_HISTORY_LIMIT = 20
const ADMIN_HISTORY_LIMIT = 60
const RESULT_CACHE_KEY = 'rifa-online:cache:top-buyers:result:v1'
const RESULT_LAST_FETCH_KEY = 'rifa-online:last-fetch:top-buyers:result:v1'
const HISTORY_CACHE_KEY_PREFIX = 'rifa-online:cache:top-buyers:history'
const HISTORY_LAST_FETCH_KEY_PREFIX = 'rifa-online:last-fetch:top-buyers:history'

type PublishTopBuyersDrawInput = {
  extractionNumbers: string[]
  rankingLimit?: number
  drawPrize: string
}

type HistoryFetchInput = {
  limit?: number
}

export type TopBuyersDrawWinner = {
  userId: string
  name: string
  cotas: number
  pos: number
}

export type TopBuyersDrawItem = {
  pos: number
  userId: string
  name: string
  cotas: number
  firstPurchaseAtMs: number
}

export type TopBuyersDrawAttempt = {
  extractionIndex: number
  extractionNumber: string
  comparisonDigits: number
  rawCandidateCode: string
  candidateCode: string
  nearestDirection: 'none' | 'below' | 'above'
  nearestDistance: number | null
  matchedPosition: number | null
}

export type TopBuyersDrawResult = {
  campaignId: string
  drawId: string
  drawDate: string
  drawPrize: string
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  requestedRankingLimit: number
  participantCount: number
  comparisonDigits: number
  extractionNumbers: string[]
  attempts: TopBuyersDrawAttempt[]
  winningPosition: number
  winningCode: string
  resolvedBy: 'federal_extraction' | 'redundancy'
  winner: TopBuyersDrawWinner
  winnerTicketNumbers: string[]
  rankingSnapshot: TopBuyersDrawItem[]
  publishedAtMs: number
}

type TopBuyersDrawCache = {
  result: TopBuyersDrawResult | null
}

type TopBuyersDrawHistoryCache = {
  results: TopBuyersDrawResult[]
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

function isGetLatestTopBuyersDrawOutput(value: unknown): value is GetLatestTopBuyersDrawOutput {
  return Boolean(value && typeof value === 'object' && 'hasResult' in value)
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function sanitizeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return fallback
  }
  return parsed
}

function sanitizeString(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.trim()
  return normalized || fallback
}

function normalizeRankingSnapshot(value: unknown): TopBuyersDrawItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((rawItem) => (rawItem && typeof rawItem === 'object' ? (rawItem as RawTopBuyersDrawItem) : null))
    .filter((item): item is RawTopBuyersDrawItem => Boolean(item))
    .map((item) => ({
      pos: sanitizeInteger(item.pos),
      userId: sanitizeString(item.userId),
      name: sanitizeString(item.name, 'Participante'),
      cotas: sanitizeInteger(item.cotas),
      firstPurchaseAtMs: sanitizeNumber(item.firstPurchaseAtMs),
    }))
    .filter((item) => item.pos > 0 && item.cotas > 0 && item.userId.length > 0)
}

function normalizeAttempts(value: unknown): TopBuyersDrawAttempt[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((rawItem) => (rawItem && typeof rawItem === 'object' ? (rawItem as RawAttempt) : null))
    .filter((item): item is RawAttempt => Boolean(item))
    .map((item) => ({
      extractionIndex: sanitizeInteger(item.extractionIndex),
      extractionNumber: sanitizeString(item.extractionNumber),
      comparisonDigits: sanitizeInteger(item.comparisonDigits),
      rawCandidateCode: sanitizeString(item.rawCandidateCode),
      candidateCode: sanitizeString(item.candidateCode),
      nearestDirection: (item.nearestDirection === 'below'
        ? 'below'
        : item.nearestDirection === 'above'
          ? 'above'
          : 'none') as TopBuyersDrawAttempt['nearestDirection'],
      nearestDistance: Number.isFinite(Number(item.nearestDistance))
        ? Number(item.nearestDistance)
        : null,
      matchedPosition: Number.isInteger(Number(item.matchedPosition))
        ? Number(item.matchedPosition)
        : null,
    }))
    .filter((item) => item.extractionIndex > 0 && item.extractionNumber.length > 0)
}

function normalizeResult(raw: RawTopBuyersDrawResult | null | undefined): TopBuyersDrawResult | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const winnerRaw = raw.winner || {}
  const winner: TopBuyersDrawWinner = {
    userId: sanitizeString(winnerRaw.userId),
    name: sanitizeString(winnerRaw.name, 'Participante'),
    cotas: sanitizeInteger(winnerRaw.cotas),
    pos: sanitizeInteger(winnerRaw.pos),
  }

  const extractionNumbers = Array.isArray(raw.extractionNumbers)
    ? raw.extractionNumbers.map((item) => sanitizeString(item)).filter(Boolean)
    : []

  const resolvedBy = raw.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy'

  const result: TopBuyersDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    drawDate: sanitizeString(raw.drawDate),
    drawPrize: sanitizeString(raw.drawPrize),
    weekId: sanitizeString(raw.weekId),
    weekStartAtMs: sanitizeNumber(raw.weekStartAtMs),
    weekEndAtMs: sanitizeNumber(raw.weekEndAtMs),
    requestedRankingLimit: sanitizeInteger(raw.requestedRankingLimit),
    participantCount: sanitizeInteger(raw.participantCount),
    comparisonDigits: sanitizeInteger(raw.comparisonDigits),
    extractionNumbers,
    attempts: normalizeAttempts(raw.attempts),
    winningPosition: sanitizeInteger(raw.winningPosition),
    winningCode: sanitizeString(raw.winningCode),
    resolvedBy,
    winner,
    winnerTicketNumbers: Array.isArray(raw.winnerTicketNumbers)
      ? raw.winnerTicketNumbers.map((item) => sanitizeString(item)).filter(Boolean).slice(0, 300)
      : [],
    rankingSnapshot: normalizeRankingSnapshot(raw.rankingSnapshot),
    publishedAtMs: sanitizeNumber(raw.publishedAtMs),
  }

  if (
    !result.campaignId ||
    !result.drawId ||
    !result.drawDate ||
    !result.weekId ||
    result.requestedRankingLimit <= 0 ||
    result.participantCount <= 0 ||
    result.comparisonDigits <= 0 ||
    result.extractionNumbers.length === 0 ||
    result.winningPosition <= 0 ||
    !result.winningCode ||
    !result.winner.userId ||
    !result.winner.name
  ) {
    return null
  }

  return result
}

export function useTopBuyersDraw(autoRefresh = false, historyScope: HistoryScope = 'none') {
  const [result, setResult] = useState<TopBuyersDrawResult | null>(null)
  const [history, setHistory] = useState<TopBuyersDrawResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const getLatestTopBuyersDraw = useMemo(
    () => httpsCallable<Record<string, never>, unknown>(functions, 'getLatestTopBuyersDraw'),
    [],
  )
  const publishTopBuyersDraw = useMemo(
    () => httpsCallable<PublishTopBuyersDrawInput, unknown>(functions, 'publishTopBuyersDraw'),
    [],
  )
  const getTopBuyersDrawHistory = useMemo(
    () => httpsCallable<HistoryFetchInput, unknown>(functions, 'getTopBuyersDrawHistory'),
    [],
  )
  const getPublicTopBuyersDrawHistory = useMemo(
    () => httpsCallable<HistoryFetchInput, unknown>(functions, 'getPublicTopBuyersDrawHistory'),
    [],
  )

  const historyCacheKey = `${HISTORY_CACHE_KEY_PREFIX}:${historyScope}:v1`
  const historyLastFetchKey = `${HISTORY_LAST_FETCH_KEY_PREFIX}:${historyScope}:v1`

  const refreshHistory = useCallback(async () => {
    if (historyScope === 'none') {
      setHistory([])
      return
    }

    setIsHistoryLoading(true)
    try {
      const historyLimit = historyScope === 'admin' ? ADMIN_HISTORY_LIMIT : PUBLIC_HISTORY_LIMIT
      const response = historyScope === 'admin'
        ? await getTopBuyersDrawHistory({ limit: historyLimit })
        : await getPublicTopBuyersDrawHistory({ limit: historyLimit })
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetTopBuyersDrawHistoryOutput>)
      const normalizedHistory = Array.isArray(payload?.results)
        ? payload.results.map((item) => normalizeResult(item as RawTopBuyersDrawResult)).filter((item): item is TopBuyersDrawResult => Boolean(item))
        : []
      setHistory(normalizedHistory)
      writeCachedJson(historyCacheKey, { results: normalizedHistory } satisfies TopBuyersDrawHistoryCache)
      markFetchedNow(historyLastFetchKey)
    } catch {
      setHistory([])
    } finally {
      setIsHistoryLoading(false)
    }
  }, [
    getPublicTopBuyersDrawHistory,
    getTopBuyersDrawHistory,
    historyScope,
    historyCacheKey,
    historyLastFetchKey,
  ])

  const refreshResult = useCallback(async () => {
    try {
      const response = await getLatestTopBuyersDraw({})
      const rawPayload = response.data as unknown
      const payload = isGetLatestTopBuyersDrawOutput(rawPayload)
        ? rawPayload
        : unwrapCallableData(rawPayload as CallableEnvelope<GetLatestTopBuyersDrawOutput>)
      const normalizedResult = normalizeResult(payload?.result || null)
      setResult(normalizedResult)
      writeCachedJson(RESULT_CACHE_KEY, { result: normalizedResult } satisfies TopBuyersDrawCache)
      markFetchedNow(RESULT_LAST_FETCH_KEY)
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar o ultimo resultado publicado.')
    } finally {
      setIsLoading(false)
    }
  }, [getLatestTopBuyersDraw])

  const publishResult = useCallback(async (input: PublishTopBuyersDrawInput) => {
    setIsPublishing(true)

    try {
      const response = await publishTopBuyersDraw(input)
      const payload = unwrapCallableData(response.data as CallableEnvelope<RawTopBuyersDrawResult>)
      const normalized = normalizeResult(payload)

      if (!normalized) {
        throw new Error('Resposta invalida ao publicar sorteio.')
      }

      setResult(normalized)
      writeCachedJson(RESULT_CACHE_KEY, { result: normalized } satisfies TopBuyersDrawCache)
      markFetchedNow(RESULT_LAST_FETCH_KEY)
      setHistory((current) => {
        const deduped = [normalized, ...current.filter((item) => item.drawId !== normalized.drawId)]
        return deduped.sort((left, right) => (right.publishedAtMs || 0) - (left.publishedAtMs || 0))
      })
      setErrorMessage(null)
      return normalized
    } finally {
      setIsPublishing(false)
    }
  }, [publishTopBuyersDraw])

  useEffect(() => {
    const cachedResult = readCachedJson<TopBuyersDrawCache>(RESULT_CACHE_KEY)
    if (cachedResult && 'result' in cachedResult) {
      setResult(cachedResult.result)
    }

    if (historyScope !== 'none') {
      const cachedHistory = readCachedJson<TopBuyersDrawHistoryCache>(historyCacheKey)
      if (cachedHistory && Array.isArray(cachedHistory.results)) {
        setHistory(cachedHistory.results)
      }
    }

    const shouldFetchResult = shouldFetchAfterDays(RESULT_LAST_FETCH_KEY, FETCH_EVERY_DAYS)
    if (shouldFetchResult || !cachedResult) {
      void refreshResult()
    } else {
      setIsLoading(false)
    }

    if (historyScope !== 'none') {
      const shouldFetchHistory = shouldFetchAfterDays(historyLastFetchKey, FETCH_EVERY_DAYS)
      const hasCachedHistory = Boolean(readCachedJson<TopBuyersDrawHistoryCache>(historyCacheKey))
      if (shouldFetchHistory || !hasCachedHistory) {
        void refreshHistory()
      } else {
        setIsHistoryLoading(false)
      }
    }
  }, [historyCacheKey, historyLastFetchKey, historyScope, refreshHistory, refreshResult])

  useEffect(() => {
    if (!autoRefresh) {
      return undefined
    }

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      const shouldFetchResult = shouldFetchAfterDays(RESULT_LAST_FETCH_KEY, FETCH_EVERY_DAYS)
      if (shouldFetchResult) {
        void refreshResult()
      }
      if (historyScope !== 'none') {
        const shouldFetchHistory = shouldFetchAfterDays(historyLastFetchKey, FETCH_EVERY_DAYS)
        if (shouldFetchHistory) {
          void refreshHistory()
        }
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
  }, [autoRefresh, historyLastFetchKey, historyScope, refreshHistory, refreshResult])

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
