import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { CAMPAIGN_TOTAL_COTAS } from '../const/home'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

type PublicSalesSnapshot = {
  totalNumbers?: number
  soldNumbers?: number
  soldPercentage?: number
}
const FETCH_EVERY_DAYS = 5
const CACHE_KEY = 'rifa-online:cache:public-sales-snapshot:v1'
const LAST_FETCH_KEY = 'rifa-online:last-fetch:public-sales-snapshot:v1'

type PublicSalesSnapshotCache = {
  soldNumbers: number
  totalNumbers: number
  soldPercentage: number
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
      writeCachedJson(CACHE_KEY, {
        soldNumbers: nextSold,
        totalNumbers: nextTotal,
        soldPercentage: nextPercentage,
      } satisfies PublicSalesSnapshotCache)
      markFetchedNow(LAST_FETCH_KEY)
    } catch {
      // Keep previous values on transient network/function errors.
    } finally {
      setIsLoading(false)
    }
  }, [getPublicSalesSnapshot])

  useEffect(() => {
    const cached = readCachedJson<PublicSalesSnapshotCache>(CACHE_KEY)
    if (cached) {
      setSoldNumbers(
        typeof cached.soldNumbers === 'number' && Number.isFinite(cached.soldNumbers)
          ? Math.max(0, Math.floor(cached.soldNumbers))
          : 0,
      )
      setTotalNumbers(
        typeof cached.totalNumbers === 'number' && Number.isFinite(cached.totalNumbers)
          ? Math.max(1, Math.floor(cached.totalNumbers))
          : CAMPAIGN_TOTAL_COTAS,
      )
      setSoldPercentage(
        typeof cached.soldPercentage === 'number' && Number.isFinite(cached.soldPercentage)
          ? Math.max(0, Math.min(100, Number(cached.soldPercentage.toFixed(1))))
          : 0,
      )
    }

    const shouldFetch = shouldFetchAfterDays(LAST_FETCH_KEY, FETCH_EVERY_DAYS)
    if (shouldFetch || !cached) {
      void loadSalesSnapshot()
      return
    }

    setIsLoading(false)
  }, [loadSalesSnapshot])

  return {
    soldNumbers,
    totalNumbers,
    soldPercentage,
    isLoading,
  }
}
