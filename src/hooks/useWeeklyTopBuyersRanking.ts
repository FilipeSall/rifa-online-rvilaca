import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import type { RankingItem } from '../const/home'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

type GetWeeklyTopBuyersRankingOutput = {
  updatedAtMs?: number
  weekId?: string
  weekStartAtMs?: number
  weekEndAtMs?: number
  items?: RankingItem[]
}
const RANKING_LIMIT = 20
const FETCH_EVERY_DAYS = 5
const CACHE_KEY = 'rifa-online:cache:weekly-top-buyers-ranking:v1'
const LAST_FETCH_KEY = 'rifa-online:last-fetch:weekly-top-buyers-ranking:v1'

type WeeklyRankingCache = {
  items: RankingItem[]
  updatedAtMs: number | null
  weekId: string | null
  weekStartAtMs: number | null
  weekEndAtMs: number | null
}

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

export function useWeeklyTopBuyersRanking() {
  const [items, setItems] = useState<RankingItem[]>([])
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null)
  const [weekId, setWeekId] = useState<string | null>(null)
  const [weekStartAtMs, setWeekStartAtMs] = useState<number | null>(null)
  const [weekEndAtMs, setWeekEndAtMs] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const getWeeklyRankingCallable = useMemo(
    () => httpsCallable<{ limit: number }, unknown>(functions, 'getWeeklyTopBuyersRanking'),
    [],
  )

  const refreshRanking = useCallback(async () => {
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
      writeCachedJson(CACHE_KEY, {
        items: nextItems,
        updatedAtMs: nextUpdatedAtMs,
        weekId: nextWeekId,
        weekStartAtMs: nextWeekStartAtMs,
        weekEndAtMs: nextWeekEndAtMs,
      } satisfies WeeklyRankingCache)
      markFetchedNow(LAST_FETCH_KEY)
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar o ranking semanal agora.')
    } finally {
      setIsLoading(false)
    }
  }, [getWeeklyRankingCallable])

  useEffect(() => {
    const cached = readCachedJson<WeeklyRankingCache>(CACHE_KEY)
    if (cached) {
      setItems(Array.isArray(cached.items) ? cached.items : [])
      setUpdatedAtMs(
        typeof cached.updatedAtMs === 'number' && Number.isFinite(cached.updatedAtMs)
          ? cached.updatedAtMs
          : null,
      )
      setWeekId(typeof cached.weekId === 'string' ? cached.weekId : null)
      setWeekStartAtMs(
        typeof cached.weekStartAtMs === 'number' && Number.isFinite(cached.weekStartAtMs)
          ? cached.weekStartAtMs
          : null,
      )
      setWeekEndAtMs(
        typeof cached.weekEndAtMs === 'number' && Number.isFinite(cached.weekEndAtMs)
          ? cached.weekEndAtMs
          : null,
      )
    }

    const shouldFetch = shouldFetchAfterDays(LAST_FETCH_KEY, FETCH_EVERY_DAYS)
    if (shouldFetch || !cached) {
      void refreshRanking()
      return
    }

    setIsLoading(false)
  }, [refreshRanking])

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
