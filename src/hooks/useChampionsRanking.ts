import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import type { RankingItem } from '../const/home'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

type GetChampionsRankingOutput = {
  updatedAtMs?: number
  items?: RankingItem[]
}
const RANKING_LIMIT = 20
const FETCH_EVERY_DAYS = 5
const CACHE_KEY = 'rifa-online:cache:champions-ranking:v1'
const LAST_FETCH_KEY = 'rifa-online:last-fetch:champions-ranking:v1'

type ChampionsRankingCache = {
  items: RankingItem[]
  updatedAtMs: number | null
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

export function useChampionsRanking() {
  const [items, setItems] = useState<RankingItem[]>([])
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const getRankingCallable = useMemo(
    () => httpsCallable<{ limit: number }, unknown>(functions, 'getChampionsRanking'),
    [],
  )

  const refreshRanking = useCallback(async () => {
    try {
      const response = await getRankingCallable({ limit: RANKING_LIMIT })
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetChampionsRankingOutput>)
      const nextItems = normalizeRankingItems(payload.items)
      const nextUpdatedAtMs =
        typeof payload.updatedAtMs === 'number' && Number.isFinite(payload.updatedAtMs)
          ? payload.updatedAtMs
          : Date.now()

      setItems(nextItems)
      setUpdatedAtMs(nextUpdatedAtMs)
      writeCachedJson(CACHE_KEY, { items: nextItems, updatedAtMs: nextUpdatedAtMs } satisfies ChampionsRankingCache)
      markFetchedNow(LAST_FETCH_KEY)
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar o ranking agora.')
    } finally {
      setIsLoading(false)
    }
  }, [getRankingCallable])

  useEffect(() => {
    const cached = readCachedJson<ChampionsRankingCache>(CACHE_KEY)
    if (cached) {
      setItems(Array.isArray(cached.items) ? cached.items : [])
      setUpdatedAtMs(
        typeof cached.updatedAtMs === 'number' && Number.isFinite(cached.updatedAtMs)
          ? cached.updatedAtMs
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
    isLoading,
    errorMessage,
  }
}
