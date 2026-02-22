import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import type { RankingItem } from '../const/home'

type GetWeeklyTopBuyersRankingOutput = {
  updatedAtMs?: number
  weekId?: string
  weekStartAtMs?: number
  weekEndAtMs?: number
  items?: RankingItem[]
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
      const response = await getWeeklyRankingCallable({ limit: 50 })
      const payload = unwrapCallableData(response.data as CallableEnvelope<GetWeeklyTopBuyersRankingOutput>)
      setItems(normalizeRankingItems(payload.items))
      setUpdatedAtMs(
        typeof payload.updatedAtMs === 'number' && Number.isFinite(payload.updatedAtMs)
          ? payload.updatedAtMs
          : Date.now(),
      )
      setWeekId(typeof payload.weekId === 'string' ? payload.weekId : null)
      setWeekStartAtMs(
        typeof payload.weekStartAtMs === 'number' && Number.isFinite(payload.weekStartAtMs)
          ? payload.weekStartAtMs
          : null,
      )
      setWeekEndAtMs(
        typeof payload.weekEndAtMs === 'number' && Number.isFinite(payload.weekEndAtMs)
          ? payload.weekEndAtMs
          : null,
      )
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar o ranking semanal agora.')
    } finally {
      setIsLoading(false)
    }
  }, [getWeeklyRankingCallable])

  useEffect(() => {
    void refreshRanking()
    const intervalId = window.setInterval(() => {
      void refreshRanking()
    }, 30000)

    return () => window.clearInterval(intervalId)
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
