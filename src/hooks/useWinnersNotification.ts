import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchWinnersFeed, type WinnerFeedItem } from '../services/winners/winnersService'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

const LAST_VIEWED_DRAW_STORAGE_KEY = 'rifa-online:winners:last-viewed-draw-id'
const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000
const FETCH_EVERY_DAYS = 5
const HISTORY_LIMIT = 12
const WINNERS_CACHE_KEY = 'rifa-online:cache:winners-feed:v1'
const WINNERS_LAST_FETCH_KEY = 'rifa-online:last-fetch:winners-feed:v1'

type WinnersFeedCache = {
  items: WinnerFeedItem[]
  latestDrawId: string | null
}

function readLastViewedDrawId() {
  try {
    return window.localStorage.getItem(LAST_VIEWED_DRAW_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistLastViewedDrawId(value: string) {
  try {
    window.localStorage.setItem(LAST_VIEWED_DRAW_STORAGE_KEY, value)
  } catch {
    // Intencional: falha no storage nao deve quebrar o fluxo principal.
  }
}

export function useWinnersNotification(enabled = true) {
  const [winners, setWinners] = useState<WinnerFeedItem[]>([])
  const [latestDrawId, setLatestDrawId] = useState<string | null>(null)
  const [lastViewedDrawId, setLastViewedDrawId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshWinners = useCallback(async () => {
    if (!enabled) {
      return
    }

    try {
      const payload = await fetchWinnersFeed({ historyLimit: HISTORY_LIMIT })
      setWinners(payload.items)
      setLatestDrawId(payload.latestDrawId)
      writeCachedJson(WINNERS_CACHE_KEY, {
        items: payload.items,
        latestDrawId: payload.latestDrawId,
      } satisfies WinnersFeedCache)
      markFetchedNow(WINNERS_LAST_FETCH_KEY)
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar os ganhadores no momento.')
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  const markLatestAsViewed = useCallback(() => {
    if (!latestDrawId) {
      return
    }

    persistLastViewedDrawId(latestDrawId)
    setLastViewedDrawId(latestDrawId)
  }, [latestDrawId])

  const openModal = useCallback(() => {
    setIsModalOpen(true)
    markLatestAsViewed()
  }, [markLatestAsViewed])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  const isFabVisible = useMemo(
    () => enabled && !isModalOpen && Boolean(latestDrawId) && latestDrawId !== lastViewedDrawId,
    [enabled, isModalOpen, lastViewedDrawId, latestDrawId],
  )

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      setIsModalOpen(false)
      return
    }

    setIsLoading(true)
    setLastViewedDrawId(readLastViewedDrawId())

    const cached = readCachedJson<WinnersFeedCache>(WINNERS_CACHE_KEY)
    if (cached) {
      setWinners(Array.isArray(cached.items) ? cached.items : [])
      setLatestDrawId(typeof cached.latestDrawId === 'string' ? cached.latestDrawId : null)
    }

    const shouldFetch = shouldFetchAfterDays(WINNERS_LAST_FETCH_KEY, FETCH_EVERY_DAYS)
    if (shouldFetch || !cached) {
      void refreshWinners()
      return
    }

    setIsLoading(false)
  }, [enabled, refreshWinners])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      if (shouldFetchAfterDays(WINNERS_LAST_FETCH_KEY, FETCH_EVERY_DAYS)) {
        void refreshWinners()
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
  }, [enabled, refreshWinners])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LAST_VIEWED_DRAW_STORAGE_KEY) {
        return
      }

      setLastViewedDrawId(event.newValue)
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  return {
    winners,
    isLoading,
    errorMessage,
    isFabVisible,
    isModalOpen,
    openModal,
    closeModal,
    refreshWinners,
  }
}
