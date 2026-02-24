import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchWinnersFeed, type WinnerFeedItem } from '../services/winners/winnersService'

const LAST_VIEWED_DRAW_STORAGE_KEY = 'rifa-online:winners:last-viewed-draw-id'

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
      const payload = await fetchWinnersFeed()
      setWinners(payload.items)
      setLatestDrawId(payload.latestDrawId)
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
    void refreshWinners()
  }, [enabled, refreshWinners])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshWinners()
    }, 45000)

    return () => {
      window.clearInterval(intervalId)
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
