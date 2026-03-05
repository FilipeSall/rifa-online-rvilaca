import { httpsCallable } from 'firebase/functions'
import { functions, useFirebaseEmulators } from '../lib/firebase'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEV_FUNCTIONS_RUNTIME_KEY = 'rifa-online:dev:functions-runtime-started-at'
const CACHE_KEY_PREFIXES = ['rifa-online:', 'purchase-numbers-window-cache:', 'purchase-numbers-paid-cache:'] as const
const RUNTIME_SYNC_TIMEOUT_MS = 2500
let emulatorRuntimeSyncPromise: Promise<void> | null = null

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isLocalHost() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function isAppCacheKey(key: string) {
  return CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function clearAppCacheKeys() {
  if (!canUseStorage()) {
    return
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (!key || key === DEV_FUNCTIONS_RUNTIME_KEY) {
      continue
    }
    if (!isAppCacheKey(key)) {
      continue
    }
    window.localStorage.removeItem(key)
  }
}

export function readCachedJson<T>(key: string): T | null {
  if (!canUseStorage()) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeCachedJson(key: string, value: unknown) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignora falhas de storage para não interromper o fluxo.
  }
}

export function shouldFetchAfterDays(lastFetchKey: string, days: number) {
  if (!canUseStorage() || days <= 0) {
    return true
  }

  try {
    const raw = window.localStorage.getItem(lastFetchKey)
    if (!raw) {
      return true
    }

    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return true
    }

    const ttlMs = days * MS_PER_DAY
    return Date.now() - parsed >= ttlMs
  } catch {
    return true
  }
}

export function markFetchedNow(lastFetchKey: string) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(lastFetchKey, String(Date.now()))
  } catch {
    // Ignora falhas de storage para não interromper o fluxo.
  }
}

export async function syncCachesWithEmulatorRuntime() {
  if (!canUseStorage() || !useFirebaseEmulators || !isLocalHost()) {
    return
  }

  if (emulatorRuntimeSyncPromise) {
    return emulatorRuntimeSyncPromise
  }

  emulatorRuntimeSyncPromise = (async () => {
    try {
      const getFunctionsRuntimeInfo = httpsCallable<Record<string, never>, { startedAtMs?: unknown }>(
        functions,
        'getFunctionsRuntimeInfo',
      )

      const timeoutPromise = new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), RUNTIME_SYNC_TIMEOUT_MS)
      })

      const response = await Promise.race([
        getFunctionsRuntimeInfo({}),
        timeoutPromise,
      ])

      if (!response || !('data' in response)) {
        return
      }

      const runtimeStartedAtMs = Number((response.data as { startedAtMs?: unknown }).startedAtMs)
      if (!Number.isFinite(runtimeStartedAtMs) || runtimeStartedAtMs <= 0) {
        return
      }

      const previousRuntime = Number(window.localStorage.getItem(DEV_FUNCTIONS_RUNTIME_KEY))
      if (Number.isFinite(previousRuntime) && previousRuntime > 0 && previousRuntime !== runtimeStartedAtMs) {
        clearAppCacheKeys()
      }

      window.localStorage.setItem(DEV_FUNCTIONS_RUNTIME_KEY, String(runtimeStartedAtMs))
    } catch {
      // Emulador offline/iniciando: ignora.
    } finally {
      emulatorRuntimeSyncPromise = null
    }
  })()

  return emulatorRuntimeSyncPromise
}
