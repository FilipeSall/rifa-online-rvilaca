import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { markFetchedNow, readCachedJson, writeCachedJson } from '../utils/fetchCache'

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
  attemptIndex?: unknown
  sourceExtractionIndex?: unknown
  extractionNumber?: unknown
  comparisonDigits?: unknown
  phase?: unknown
  rawCandidateCode?: unknown
  candidateCode?: unknown
  nearestDirection?: unknown
  nearestDistance?: unknown
  matchedPosition?: unknown
  matchedUserId?: unknown
  matchedTicketNumber?: unknown
}

type RawTopBuyersDrawResult = {
  campaignId?: unknown
  drawId?: unknown
  drawDate?: unknown
  drawPrize?: unknown
  ruleVersion?: unknown
  comparisonMode?: unknown
  comparisonSide?: unknown
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
  winningTicketNumber?: unknown
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
  nextCursor?: unknown
  hasMore?: unknown
}

type HistoryScope = 'none' | 'admin' | 'public'
const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000
const PUBLIC_HISTORY_LIMIT = 50
const ADMIN_HISTORY_LIMIT = 50
const RESULT_CACHE_KEY = 'rifa-online:cache:top-buyers:result:v2'
const RESULT_LAST_FETCH_KEY = 'rifa-online:last-fetch:top-buyers:result:v2'
const HISTORY_CACHE_KEY_PREFIX = 'rifa-online:cache:top-buyers:history'
const HISTORY_LAST_FETCH_KEY_PREFIX = 'rifa-online:last-fetch:top-buyers:history'

type PublishTopBuyersDrawInput = {
  extractionNumbers: string[]
  rankingLimit?: number
  drawPrize: string
}

type HistoryFetchInput = {
  limit?: number
  cursor?: string
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
  attemptIndex: number
  sourceExtractionIndex: number | null
  extractionNumber: string
  comparisonDigits: number
  phase: 'exact' | 'nearest' | 'contingency'
  rawCandidateCode: string
  candidateCode: string
  nearestDirection: 'none' | 'below' | 'above'
  nearestDistance: number | null
  matchedPosition: number | null
  matchedUserId: string | null
  matchedTicketNumber: string | null
}

export type TopBuyersDrawResult = {
  campaignId: string
  drawId: string
  drawDate: string
  drawPrize: string
  ruleVersion: 'v2_prefix_cycle' | 'legacy_modulo'
  comparisonMode: 'ticket_suffix' | 'ticket_prefix' | 'legacy_modulo'
  comparisonSide: 'left_prefix' | 'right_suffix'
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
  winningTicketNumber: string | null
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
  nextCursor: string | null
  hasMore: boolean
}

function mergeHistoryEntries(...collections: TopBuyersDrawResult[][]): TopBuyersDrawResult[] {
  const merged = new Map<string, TopBuyersDrawResult>()
  for (const collection of collections) {
    for (const item of collection) {
      if (!item?.drawId) {
        continue
      }
      merged.set(item.drawId, item)
    }
  }

  return Array.from(merged.values()).sort((left, right) => (right.publishedAtMs || 0) - (left.publishedAtMs || 0))
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

function parseAttemptPhase(value: unknown): TopBuyersDrawAttempt['phase'] {
  if (value === 'nearest') {
    return 'nearest'
  }
  if (value === 'contingency') {
    return 'contingency'
  }
  return 'exact'
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
      attemptIndex: sanitizeInteger(item.attemptIndex, sanitizeInteger(item.extractionIndex)),
      sourceExtractionIndex: Number.isInteger(Number(item.sourceExtractionIndex))
        ? Number(item.sourceExtractionIndex)
        : null,
      extractionNumber: sanitizeString(item.extractionNumber),
      comparisonDigits: sanitizeInteger(item.comparisonDigits),
      phase: parseAttemptPhase(item.phase),
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
      matchedUserId: sanitizeString(item.matchedUserId) || null,
      matchedTicketNumber: sanitizeString(item.matchedTicketNumber) || null,
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
  const ruleVersion = raw.ruleVersion === 'v2_prefix_cycle' ? 'v2_prefix_cycle' : 'legacy_modulo'
  const comparisonMode = raw.comparisonMode === 'ticket_suffix'
    ? 'ticket_suffix'
    : raw.comparisonMode === 'ticket_prefix'
      ? 'ticket_prefix'
      : 'legacy_modulo'
  const comparisonSide = raw.comparisonSide === 'left_prefix' ? 'left_prefix' : 'right_suffix'

  const result: TopBuyersDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    drawDate: sanitizeString(raw.drawDate),
    drawPrize: sanitizeString(raw.drawPrize),
    ruleVersion,
    comparisonMode,
    comparisonSide,
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
    winningTicketNumber: sanitizeString(raw.winningTicketNumber) || null,
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
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
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

  const historyCacheKey = `${HISTORY_CACHE_KEY_PREFIX}:${historyScope}:v2`
  const historyLastFetchKey = `${HISTORY_LAST_FETCH_KEY_PREFIX}:${historyScope}:v2`

  const refreshHistory = useCallback(async (options?: { append?: boolean }) => {
    if (historyScope === 'none') {
      setHistory([])
      setHistoryCursor(null)
      setHasMoreHistory(false)
      return
    }

    setIsHistoryLoading(true)
    try {
      const historyLimit = historyScope === 'admin' ? ADMIN_HISTORY_LIMIT : PUBLIC_HISTORY_LIMIT
      const requestCursor = historyScope === 'admin' && options?.append ? historyCursor : null
      const response = historyScope === 'admin'
        ? await getTopBuyersDrawHistory({ limit: historyLimit, cursor: requestCursor || undefined })
        : await getPublicTopBuyersDrawHistory({ limit: historyLimit })
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetTopBuyersDrawHistoryOutput>)
      const normalizedHistory = Array.isArray(payload?.results)
        ? payload.results.map((item) => normalizeResult(item as RawTopBuyersDrawResult)).filter((item): item is TopBuyersDrawResult => Boolean(item))
        : []
      const nextCursor = historyScope === 'admin'
        ? sanitizeString(payload?.nextCursor) || null
        : null
      const nextHasMore = historyScope === 'admin'
        ? payload?.hasMore === true
        : false
      setHistory((current) => {
        const base = options?.append ? current : []
        const merged = mergeHistoryEntries(base, normalizedHistory)
        writeCachedJson(historyCacheKey, {
          results: merged,
          nextCursor,
          hasMore: nextHasMore,
        } satisfies TopBuyersDrawHistoryCache)
        return merged
      })
      setHistoryCursor(nextCursor)
      setHasMoreHistory(nextHasMore)
      markFetchedNow(historyLastFetchKey)
    } catch {
      // Mantem cache e estado atual quando rede falhar.
    } finally {
      setIsHistoryLoading(false)
    }
  }, [
    getPublicTopBuyersDrawHistory,
    getTopBuyersDrawHistory,
    historyScope,
    historyCursor,
    historyCacheKey,
    historyLastFetchKey,
  ])

  const loadMoreHistory = useCallback(async () => {
    if (historyScope !== 'admin' || !hasMoreHistory || isHistoryLoading) {
      return
    }

    await refreshHistory({ append: true })
  }, [hasMoreHistory, historyScope, isHistoryLoading, refreshHistory])

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
      return normalizedResult
    } catch {
      setErrorMessage('Nao foi possivel carregar o ultimo resultado publicado.')
      return null
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
        const merged = mergeHistoryEntries(current, [normalized])
        if (historyScope !== 'none') {
          writeCachedJson(historyCacheKey, {
            results: merged,
            nextCursor: historyCursor,
            hasMore: hasMoreHistory,
          } satisfies TopBuyersDrawHistoryCache)
          markFetchedNow(historyLastFetchKey)
        }
        return merged
      })
      setErrorMessage(null)
      return normalized
    } finally {
      setIsPublishing(false)
    }
  }, [hasMoreHistory, historyCacheKey, historyCursor, historyLastFetchKey, historyScope, publishTopBuyersDraw])

  useEffect(() => {
    const cachedResult = readCachedJson<TopBuyersDrawCache>(RESULT_CACHE_KEY)
    if (cachedResult && 'result' in cachedResult) {
      setResult(cachedResult.result)
    }

    if (historyScope !== 'none') {
      const cachedHistory = readCachedJson<TopBuyersDrawHistoryCache>(historyCacheKey)
      if (cachedHistory && Array.isArray(cachedHistory.results)) {
        setHistory(cachedHistory.results)
        setHistoryCursor(typeof cachedHistory.nextCursor === 'string' ? cachedHistory.nextCursor : null)
        setHasMoreHistory(cachedHistory.hasMore === true)
      }
    }

    let isCancelled = false

    const syncFromNetwork = async () => {
      const latest = await refreshResult()
      if (isCancelled || historyScope === 'none') {
        return
      }

      const cachedHistory = readCachedJson<TopBuyersDrawHistoryCache>(historyCacheKey)
      const hasCachedHistory = Boolean(cachedHistory?.results?.length)
      const hasLatestInHistory = Boolean(
        latest?.drawId
        && cachedHistory?.results?.some((item) => item.drawId === latest.drawId),
      )
      if (!hasCachedHistory || (latest?.drawId && !hasLatestInHistory)) {
        await refreshHistory({ append: false })
      } else {
        setIsHistoryLoading(false)
      }
    }

    void syncFromNetwork()

    return () => {
      isCancelled = true
    }
  }, [historyCacheKey, historyLastFetchKey, historyScope, refreshHistory, refreshResult])

  useEffect(() => {
    if (!autoRefresh) {
      return undefined
    }

    const runRefresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      const latest = await refreshResult()
      if (historyScope !== 'none') {
        const cachedHistory = readCachedJson<TopBuyersDrawHistoryCache>(historyCacheKey)
        const hasLatestInHistory = Boolean(
          latest?.drawId
          && cachedHistory?.results?.some((item) => item.drawId === latest.drawId),
        )
        if (!cachedHistory?.results?.length || (latest?.drawId && !hasLatestInHistory)) {
          await refreshHistory({ append: false })
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void runRefresh()
    }, AUTO_REFRESH_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [autoRefresh, historyCacheKey, historyScope, refreshHistory, refreshResult])

  return {
    result,
    history,
    isLoading,
    isHistoryLoading,
    hasMoreHistory,
    isPublishing,
    errorMessage,
    refreshResult,
    refreshHistory,
    loadMoreHistory,
    publishResult,
  }
}
