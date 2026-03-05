import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { markFetchedNow, readCachedJson, writeCachedJson } from '../utils/fetchCache'

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
  ruleVersion?: unknown
  comparisonMode?: unknown
  comparisonSide?: unknown
  extractionNumbers?: unknown
  participantCount?: unknown
  comparisonDigits?: unknown
  attempts?: unknown
  winningPosition?: unknown
  winningCode?: unknown
  winningTicketNumber?: unknown
  resolvedBy?: unknown
  rankingSnapshot?: unknown
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
const HISTORY_LIMIT = 50
const RESULT_CACHE_KEY = 'rifa-online:cache:main-raffle:result:v2'
const HISTORY_CACHE_KEY = 'rifa-online:cache:main-raffle:history:v2'
const RESULT_LAST_FETCH_KEY = 'rifa-online:last-fetch:main-raffle:result:v2'
const HISTORY_LAST_FETCH_KEY = 'rifa-online:last-fetch:main-raffle:history:v2'

type PublishMainRaffleDrawInput = {
  extractionNumbers: string[]
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
  ruleVersion: 'v2_prefix_cycle' | 'legacy_modulo'
  comparisonMode: 'ticket_suffix' | 'ticket_prefix' | 'legacy_modulo'
  comparisonSide: 'left_prefix' | 'right_suffix'
  extractionNumbers: string[]
  participantCount: number
  comparisonDigits: number
  attempts: Array<{
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
  }>
  winningPosition: number
  winningCode: string
  winningTicketNumber: string | null
  resolvedBy: 'federal_extraction' | 'redundancy'
  rankingSnapshot: Array<{
    pos: number
    userId: string
    name: string
    cotas: number
    firstPurchaseAtMs: number
    photoURL: string
  }>
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

function mergeHistoryEntries(...collections: MainRaffleDrawResult[][]): MainRaffleDrawResult[] {
  const merged = new Map<string, MainRaffleDrawResult>()
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

function parseAttemptPhase(
  value: unknown,
): MainRaffleDrawResult['attempts'][number]['phase'] {
  if (value === 'nearest') {
    return 'nearest'
  }
  if (value === 'contingency') {
    return 'contingency'
  }
  return 'exact'
}

function parseNearestDirection(
  value: unknown,
): MainRaffleDrawResult['attempts'][number]['nearestDirection'] {
  if (value === 'below') {
    return 'below'
  }
  if (value === 'above') {
    return 'above'
  }
  return 'none'
}

function normalizeResult(raw: RawMainRaffleResult | null | undefined): MainRaffleDrawResult | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const extractionNumbers = Array.isArray(raw.extractionNumbers)
    ? raw.extractionNumbers.map((item) => sanitizeString(item))
    : []
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts
      .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
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
        nearestDirection: parseNearestDirection(item.nearestDirection),
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
    : []
  const rankingSnapshot = Array.isArray(raw.rankingSnapshot)
    ? raw.rankingSnapshot
      .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        pos: sanitizeInteger(item.pos),
        userId: sanitizeString(item.userId),
        name: sanitizeString(item.name, 'Participante'),
        cotas: sanitizeInteger(item.cotas),
        firstPurchaseAtMs: sanitizeNumber(item.firstPurchaseAtMs),
        photoURL: sanitizeString(item.photoURL),
      }))
      .filter((item) => item.pos > 0 && item.userId.length > 0)
    : []
  const winnerRaw = raw.winner || {}
  const fallbackDirection = raw.fallbackDirection === 'above'
    ? 'above'
    : raw.fallbackDirection === 'below'
      ? 'below'
      : 'none'
  const ruleVersion = raw.ruleVersion === 'v2_prefix_cycle' ? 'v2_prefix_cycle' : 'legacy_modulo'
  const comparisonMode = raw.comparisonMode === 'ticket_suffix'
    ? 'ticket_suffix'
    : raw.comparisonMode === 'ticket_prefix'
      ? 'ticket_prefix'
      : 'legacy_modulo'
  const comparisonSide = raw.comparisonSide === 'left_prefix' ? 'left_prefix' : 'right_suffix'
  const resolvedBy = raw.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy'

  const result: MainRaffleDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    drawDate: sanitizeString(raw.drawDate),
    drawPrize: sanitizeString(raw.drawPrize),
    ruleVersion,
    comparisonMode,
    comparisonSide,
    extractionNumbers,
    participantCount: sanitizeInteger(raw.participantCount, rankingSnapshot.length),
    comparisonDigits: sanitizeInteger(raw.comparisonDigits),
    attempts,
    winningPosition: sanitizeInteger(raw.winningPosition),
    winningCode: sanitizeString(raw.winningCode),
    winningTicketNumber: sanitizeString(raw.winningTicketNumber) || null,
    resolvedBy,
    rankingSnapshot,
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
    result.extractionNumbers.length < 1 ||
    result.extractionNumbers.length > 5 ||
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
      return normalized
    } catch {
      setErrorMessage('Nao foi possivel carregar o ultimo sorteio principal.')
      return null
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
      setHistory((current) => {
        const cachedHistory = readCachedJson<MainRaffleHistoryCache>(HISTORY_CACHE_KEY)
        const merged = mergeHistoryEntries(
          cachedHistory?.results || [],
          current,
          normalizedHistory,
        )
        writeCachedJson(HISTORY_CACHE_KEY, { results: merged } satisfies MainRaffleHistoryCache)
        return merged
      })
      markFetchedNow(HISTORY_LAST_FETCH_KEY)
    } catch {
      // Mantem cache e estado atual quando rede falhar.
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
        const merged = mergeHistoryEntries(current, [normalized])
        writeCachedJson(HISTORY_CACHE_KEY, { results: merged } satisfies MainRaffleHistoryCache)
        markFetchedNow(HISTORY_LAST_FETCH_KEY)
        return merged
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

    let isCancelled = false

    const syncFromNetwork = async () => {
      const latest = await refreshResult()
      if (isCancelled) {
        return
      }

      const cached = readCachedJson<MainRaffleHistoryCache>(HISTORY_CACHE_KEY)
      const hasCachedHistory = Boolean(cached?.results?.length)
      const hasLatestInHistory = Boolean(
        latest?.drawId
        && cached?.results?.some((item) => item.drawId === latest.drawId),
      )
      if (!hasCachedHistory || (latest?.drawId && !hasLatestInHistory)) {
        await refreshHistory()
      } else {
        setIsHistoryLoading(false)
      }
    }

    void syncFromNetwork()

    return () => {
      isCancelled = true
    }
  }, [refreshHistory, refreshResult])

  useEffect(() => {
    if (!autoRefresh) {
      return
    }

    const runRefresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      const latest = await refreshResult()
      const cached = readCachedJson<MainRaffleHistoryCache>(HISTORY_CACHE_KEY)
      const hasLatestInHistory = Boolean(
        latest?.drawId
        && cached?.results?.some((item) => item.drawId === latest.drawId),
      )
      if (!cached?.results?.length || (latest?.drawId && !hasLatestInHistory)) {
        await refreshHistory()
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
