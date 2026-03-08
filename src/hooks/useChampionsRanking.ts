import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import type { RankingItem } from '../const/home'

type GetChampionsRankingOutput = {
  updatedAtMs?: number
  page?: number
  pageSize?: number
  totalItems?: number
  totalPages?: number
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

function sanitizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export function useChampionsRanking(page: number) {
  const [items, setItems] = useState<RankingItem[]>([])
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const getRankingCallable = useMemo(
    () => httpsCallable<{ page: number }, unknown>(functions, 'getChampionsRanking'),
    [],
  )

  useEffect(() => {
    let isCancelled = false
    const requestedPage = sanitizePositiveInteger(page, 1)

    const load = async () => {
      setIsLoading(true)

      try {
        const response = await getRankingCallable({ page: requestedPage })
        if (isCancelled) {
          return
        }

        const payload = unwrapCallableData(response.data as CallableEnvelope<GetChampionsRankingOutput>)
        const nextItems = normalizeRankingItems(payload.items)
        const nextUpdatedAtMs =
          typeof payload.updatedAtMs === 'number' && Number.isFinite(payload.updatedAtMs)
            ? payload.updatedAtMs
            : Date.now()
        const nextPage = sanitizePositiveInteger(payload.page, requestedPage)
        const nextPageSize = sanitizePositiveInteger(payload.pageSize, 10)
        const nextTotalItems = Number.isInteger(payload.totalItems) && Number(payload.totalItems) >= 0
          ? Number(payload.totalItems)
          : nextItems.length
        const nextTotalPages = Number.isInteger(payload.totalPages) && Number(payload.totalPages) >= 0
          ? Number(payload.totalPages)
          : (nextTotalItems > 0 ? Math.ceil(nextTotalItems / nextPageSize) : 0)

        setItems(nextItems)
        setUpdatedAtMs(nextUpdatedAtMs)
        setCurrentPage(nextPage)
        setPageSize(nextPageSize)
        setTotalItems(nextTotalItems)
        setTotalPages(nextTotalPages)
        setErrorMessage(null)
      } catch {
        if (!isCancelled) {
          setErrorMessage('Nao foi possivel carregar o ranking agora.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [getRankingCallable, page])

  return {
    items,
    updatedAtMs,
    isLoading,
    errorMessage,
    page: currentPage,
    pageSize,
    totalItems,
    totalPages,
  }
}
