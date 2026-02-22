import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { CAMPAIGN_TOTAL_COTAS } from '../const/home'

type PublicSalesSnapshot = {
  totalNumbers?: number
  soldNumbers?: number
  soldPercentage?: number
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

function normalizePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function normalizePercentage(value: unknown, soldNumbers: number, totalNumbers: number) {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(100, Number(parsed.toFixed(1)))
  }

  return Number(((soldNumbers / Math.max(totalNumbers, 1)) * 100).toFixed(1))
}

export function usePublicSalesSnapshot() {
  const [soldNumbers, setSoldNumbers] = useState(0)
  const [totalNumbers, setTotalNumbers] = useState(CAMPAIGN_TOTAL_COTAS)
  const [soldPercentage, setSoldPercentage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const getPublicSalesSnapshot = useMemo(
    () => httpsCallable<Record<string, never>, unknown>(functions, 'getPublicSalesSnapshot'),
    [],
  )

  const loadSalesSnapshot = useCallback(async () => {
    try {
      const response = await getPublicSalesSnapshot({})
      const payload = unwrapCallableData(response.data as CallableEnvelope<PublicSalesSnapshot>)
      const nextTotal = normalizePositiveInt(payload.totalNumbers, CAMPAIGN_TOTAL_COTAS)
      const nextSold = Math.min(normalizePositiveInt(payload.soldNumbers, 0), nextTotal)
      const nextPercentage = normalizePercentage(payload.soldPercentage, nextSold, nextTotal)

      setTotalNumbers(nextTotal)
      setSoldNumbers(nextSold)
      setSoldPercentage(nextPercentage)
    } catch {
      // Keep previous values on transient network/function errors.
    } finally {
      setIsLoading(false)
    }
  }, [getPublicSalesSnapshot])

  useEffect(() => {
    void loadSalesSnapshot()

    const intervalId = window.setInterval(() => {
      void loadSalesSnapshot()
    }, 20000)

    return () => window.clearInterval(intervalId)
  }, [loadSalesSnapshot])

  return {
    soldNumbers,
    totalNumbers,
    soldPercentage,
    isLoading,
  }
}
