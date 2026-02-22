import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'

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

type RawTopBuyersDrawResult = {
  campaignId?: unknown
  drawId?: unknown
  lotteryNumber?: unknown
  requestedRankingLimit?: unknown
  participantCount?: unknown
  winningPosition?: unknown
  winner?: RawTopBuyersDrawWinner
  rankingSnapshot?: unknown
  publishedAtMs?: unknown
}

type GetLatestTopBuyersDrawOutput = {
  hasResult?: unknown
  result?: RawTopBuyersDrawResult | null
}

type PublishTopBuyersDrawInput = {
  lotteryNumber: number
  rankingLimit?: number
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

export type TopBuyersDrawResult = {
  campaignId: string
  drawId: string
  lotteryNumber: number
  requestedRankingLimit: number
  participantCount: number
  winningPosition: number
  winner: TopBuyersDrawWinner
  rankingSnapshot: TopBuyersDrawItem[]
  publishedAtMs: number
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

  const result: TopBuyersDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    lotteryNumber: sanitizeInteger(raw.lotteryNumber),
    requestedRankingLimit: sanitizeInteger(raw.requestedRankingLimit),
    participantCount: sanitizeInteger(raw.participantCount),
    winningPosition: sanitizeInteger(raw.winningPosition),
    winner,
    rankingSnapshot: normalizeRankingSnapshot(raw.rankingSnapshot),
    publishedAtMs: sanitizeNumber(raw.publishedAtMs),
  }

  if (
    !result.campaignId ||
    !result.drawId ||
    result.lotteryNumber <= 0 ||
    result.requestedRankingLimit <= 0 ||
    result.participantCount <= 0 ||
    result.winningPosition <= 0 ||
    !result.winner.userId ||
    !result.winner.name
  ) {
    return null
  }

  return result
}

export function useTopBuyersDraw(autoRefresh = true) {
  const [result, setResult] = useState<TopBuyersDrawResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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

  const refreshResult = useCallback(async () => {
    try {
      const response = await getLatestTopBuyersDraw({})
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetLatestTopBuyersDrawOutput>)
      const normalizedResult = normalizeResult(payload.result || null)
      setResult(normalizedResult)
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
      setErrorMessage(null)
      return normalized
    } finally {
      setIsPublishing(false)
    }
  }, [publishTopBuyersDraw])

  useEffect(() => {
    void refreshResult()

    if (!autoRefresh) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      void refreshResult()
    }, 45000)

    return () => window.clearInterval(intervalId)
  }, [autoRefresh, refreshResult])

  return {
    result,
    isLoading,
    isPublishing,
    errorMessage,
    refreshResult,
    publishResult,
  }
}
