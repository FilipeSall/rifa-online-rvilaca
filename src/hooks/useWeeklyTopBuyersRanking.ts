import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../lib/firebase'
import type { RankingItem } from '../const/home'

type GetWeeklyTopBuyersRankingOutput = {
  updatedAtMs?: number
  weekId?: string
  weekStartAtMs?: number
  weekEndAtMs?: number
  items?: RankingItem[]
}
const RANKING_LIMIT = 20
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PUBLIC_CACHE_DOC_PATH = ['draws', '_public-weekly-top-buyers-ranking'] as const

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

function normalizeRankingItems(value: unknown): RankingItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const pos = Number(item.pos)
      const cotas = Number(item.cotas)
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      return {
        pos: Number.isInteger(pos) && pos > 0 ? pos : 0,
        name: name || 'Participante',
        cotas: Number.isInteger(cotas) && cotas > 0 ? cotas : 0,
        isGold: Boolean(item.isGold),
      }
    })
    .filter((item) => item.pos > 0 && item.cotas > 0)
}

function shouldRefreshRanking(updatedAtMs: number | null, nowMs = Date.now()) {
  if (!updatedAtMs || !Number.isFinite(updatedAtMs)) {
    return true
  }

  return nowMs >= updatedAtMs + CACHE_TTL_MS
}

export function useWeeklyTopBuyersRanking() {
  const [items, setItems] = useState<RankingItem[]>([])
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null)
  const [weekId, setWeekId] = useState<string | null>(null)
  const [weekStartAtMs, setWeekStartAtMs] = useState<number | null>(null)
  const [weekEndAtMs, setWeekEndAtMs] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasCachedSnapshotRef = useRef(false)
  const isRefreshingRef = useRef(false)
  const getWeeklyRankingCallable = useMemo(
    () => httpsCallable<{ limit: number }, unknown>(functions, 'getWeeklyTopBuyersRanking'),
    [],
  )
  const rankingCacheDocRef = useMemo(
    () => doc(db, PUBLIC_CACHE_DOC_PATH[0], PUBLIC_CACHE_DOC_PATH[1]),
    [],
  )

  const refreshRanking = useCallback(async () => {
    if (isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true
    setIsLoading(true)

    try {
      const response = await getWeeklyRankingCallable({ limit: RANKING_LIMIT })
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetWeeklyTopBuyersRankingOutput>)
      const nextItems = normalizeRankingItems(payload.items)
      const nextUpdatedAtMs =
        typeof payload.updatedAtMs === 'number' && Number.isFinite(payload.updatedAtMs)
          ? payload.updatedAtMs
          : Date.now()
      const nextWeekId = typeof payload.weekId === 'string' ? payload.weekId : null
      const nextWeekStartAtMs =
        typeof payload.weekStartAtMs === 'number' && Number.isFinite(payload.weekStartAtMs)
          ? payload.weekStartAtMs
          : null
      const nextWeekEndAtMs =
        typeof payload.weekEndAtMs === 'number' && Number.isFinite(payload.weekEndAtMs)
          ? payload.weekEndAtMs
          : null

      setItems(nextItems)
      setUpdatedAtMs(nextUpdatedAtMs)
      setWeekId(nextWeekId)
      setWeekStartAtMs(nextWeekStartAtMs)
      setWeekEndAtMs(nextWeekEndAtMs)
      setErrorMessage(null)
    } catch {
      if (!hasCachedSnapshotRef.current) {
        setErrorMessage('Nao foi possivel carregar o ranking semanal agora.')
      }
    } finally {
      isRefreshingRef.current = false
      setIsLoading(false)
    }
  }, [getWeeklyRankingCallable])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      rankingCacheDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          void refreshRanking()
          return
        }

        const payload = snapshot.data() as Record<string, unknown>
        const nextItems = normalizeRankingItems(payload.items)
        const nextUpdatedAtMs =
          typeof payload.updatedAtMs === 'number' && Number.isFinite(payload.updatedAtMs)
            ? payload.updatedAtMs
            : null
        const nextWeekId = typeof payload.weekId === 'string' ? payload.weekId : null
        const nextWeekStartAtMs =
          typeof payload.weekStartAtMs === 'number' && Number.isFinite(payload.weekStartAtMs)
            ? payload.weekStartAtMs
            : null
        const nextWeekEndAtMs =
          typeof payload.weekEndAtMs === 'number' && Number.isFinite(payload.weekEndAtMs)
            ? payload.weekEndAtMs
            : null

        hasCachedSnapshotRef.current = true
        setItems(nextItems)
        setUpdatedAtMs(nextUpdatedAtMs)
        setWeekId(nextWeekId)
        setWeekStartAtMs(nextWeekStartAtMs)
        setWeekEndAtMs(nextWeekEndAtMs)
        setErrorMessage(null)
        setIsLoading(false)

        if (shouldRefreshRanking(nextUpdatedAtMs)) {
          void refreshRanking()
        }
      },
      () => {
        // Mantém fallback via callable.
        void refreshRanking()
      },
    )

    return unsubscribe
  }, [rankingCacheDocRef, refreshRanking])

  useEffect(() => {
    if (!updatedAtMs || !Number.isFinite(updatedAtMs)) {
      return
    }

    const refreshAtMs = updatedAtMs + CACHE_TTL_MS
    const delayMs = refreshAtMs - Date.now()

    if (delayMs <= 0) {
      void refreshRanking()
      return
    }

    const timer = window.setTimeout(() => {
      void refreshRanking()
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [updatedAtMs, refreshRanking])

  return {
    items,
    updatedAtMs,
    weekId,
    weekStartAtMs,
    weekEndAtMs,
    isLoading,
    errorMessage,
  }
}
