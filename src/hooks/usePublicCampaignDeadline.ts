import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { CAMPAIGN_DOC_ID } from '../const/campaign'
import {
  CAMPAIGN_DEADLINE_TIMEZONE,
  PUBLIC_CAMPAIGN_DEADLINE_CACHE_KEY,
  PUBLIC_CAMPAIGN_DEADLINE_REFRESH_INTERVAL_MS,
} from '../const/publicCampaignDeadline'
import { functions } from '../lib/firebase'
import { resolveCampaignDeadlineAtMs, sanitizeCampaignDeadlineTimezone } from '../utils/campaignDeadline'
import { readCachedJson, writeCachedJson } from '../utils/fetchCache'

type CallableEnvelope<T> = T | { result?: T }

type RawPublicCampaignDeadline = {
  campaignId?: unknown
  endsAt?: unknown
  endsAtTime?: unknown
  timezone?: unknown
  updatedAtMs?: unknown
}

export type PublicCampaignDeadlineSnapshot = {
  campaignId: string
  endsAt: string | null
  endsAtTime: string | null
  timezone: string
  updatedAtMs: number
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

function sanitizeCampaignId(value: unknown) {
  if (typeof value !== 'string') {
    return CAMPAIGN_DOC_ID
  }

  const normalized = value.trim()
  return normalized || CAMPAIGN_DOC_ID
}

function sanitizeCampaignDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null
  }

  return normalized
}

function sanitizeCampaignTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    return null
  }

  return normalized
}

function sanitizeUpdatedAtMs(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return Math.floor(parsed)
}

function normalizeDeadlinePayload(raw: RawPublicCampaignDeadline | null | undefined): PublicCampaignDeadlineSnapshot {
  const payload = raw && typeof raw === 'object' ? raw : {}

  return {
    campaignId: sanitizeCampaignId(payload.campaignId),
    endsAt: sanitizeCampaignDate(payload.endsAt),
    endsAtTime: sanitizeCampaignTime(payload.endsAtTime),
    timezone: sanitizeCampaignDeadlineTimezone(payload.timezone),
    updatedAtMs: sanitizeUpdatedAtMs(payload.updatedAtMs),
  }
}

function readCampaignDeadlineCache(): PublicCampaignDeadlineSnapshot | null {
  const cached = readCachedJson<RawPublicCampaignDeadline>(PUBLIC_CAMPAIGN_DEADLINE_CACHE_KEY)
  if (!cached) {
    return null
  }

  return normalizeDeadlinePayload(cached)
}

function hasPayloadChanged(
  current: PublicCampaignDeadlineSnapshot,
  next: PublicCampaignDeadlineSnapshot,
) {
  return (
    current.campaignId !== next.campaignId
    || current.endsAt !== next.endsAt
    || current.endsAtTime !== next.endsAtTime
    || current.timezone !== next.timezone
    || current.updatedAtMs !== next.updatedAtMs
  )
}

function shouldReplaceSnapshot(
  current: PublicCampaignDeadlineSnapshot | null,
  next: PublicCampaignDeadlineSnapshot,
) {
  if (!current) {
    return true
  }

  if (next.updatedAtMs > current.updatedAtMs) {
    return true
  }

  return next.updatedAtMs === current.updatedAtMs && hasPayloadChanged(current, next)
}

export function clearPublicCampaignDeadlineCache() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(PUBLIC_CAMPAIGN_DEADLINE_CACHE_KEY)
  } catch {
    // Ignora para nao interromper o fluxo de admin.
  }
}

export function usePublicCampaignDeadline() {
  const [deadline, setDeadline] = useState<PublicCampaignDeadlineSnapshot | null>(() => readCampaignDeadlineCache())
  const [isLoading, setIsLoading] = useState(() => readCampaignDeadlineCache() === null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const getPublicCampaignDeadline = useMemo(
    () => httpsCallable<Record<string, never>, unknown>(functions, 'getPublicCampaignDeadline'),
    [],
  )

  const refreshDeadline = useCallback(async () => {
    try {
      const response = await getPublicCampaignDeadline({})
      const payload = unwrapCallableData(response.data as CallableEnvelope<RawPublicCampaignDeadline>)
      const normalized = normalizeDeadlinePayload(payload)
      setDeadline((current) => {
        if (!shouldReplaceSnapshot(current, normalized)) {
          return current
        }

        writeCachedJson(PUBLIC_CAMPAIGN_DEADLINE_CACHE_KEY, normalized)
        return normalized
      })
      setErrorMessage(null)
    } catch {
      setErrorMessage('Nao foi possivel carregar o prazo final da campanha.')
    } finally {
      setIsLoading(false)
    }
  }, [getPublicCampaignDeadline])

  useEffect(() => {
    void refreshDeadline()

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }

      void refreshDeadline()
    }

    const intervalId = window.setInterval(runRefresh, PUBLIC_CAMPAIGN_DEADLINE_REFRESH_INTERVAL_MS)
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
  }, [refreshDeadline])

  const targetTimeMs = useMemo(
    () => resolveCampaignDeadlineAtMs(deadline?.endsAt, deadline?.endsAtTime, deadline?.timezone || CAMPAIGN_DEADLINE_TIMEZONE),
    [deadline?.endsAt, deadline?.endsAtTime, deadline?.timezone],
  )
  const hasDeadline = Boolean(deadline?.endsAt && targetTimeMs !== null)
  const isExpired = Boolean(targetTimeMs !== null && Date.now() > targetTimeMs)

  return {
    deadline,
    targetTimeMs,
    hasDeadline,
    isExpired,
    isLoading,
    errorMessage,
    refreshDeadline,
  }
}
