import { httpsCallable } from 'firebase/functions'
import { functions, useFirebaseEmulators } from '../lib/firebase'
import {
  getLocalStorage,
  safeStorageGetItem,
  safeStorageKeys,
  safeStorageRemoveItem,
  safeStorageSetItem,
} from './webStorage'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEV_FUNCTIONS_RUNTIME_KEY = 'rifa-online:dev:functions-runtime-started-at'
const CACHE_KEY_PREFIXES = ['rifa-online:', 'purchase-numbers-window-cache:', 'purchase-numbers-paid-cache:'] as const
const RUNTIME_SYNC_TIMEOUT_MS = 2500
let emulatorRuntimeSyncPromise: Promise<void> | null = null

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
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return
  }

  for (const key of safeStorageKeys(localStorageApi)) {
    if (!key || key === DEV_FUNCTIONS_RUNTIME_KEY) {
      continue
    }
    if (!isAppCacheKey(key)) {
      continue
    }
    safeStorageRemoveItem(localStorageApi, key)
  }
}

export function readCachedJson<T>(key: string): T | null {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return null
  }

  try {
    const raw = safeStorageGetItem(localStorageApi, key)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeCachedJson(key: string, value: unknown) {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return
  }

  try {
    safeStorageSetItem(localStorageApi, key, JSON.stringify(value))
  } catch {
    // Ignora falhas de storage para não interromper o fluxo.
  }
}

export function shouldFetchAfterDays(lastFetchKey: string, days: number) {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi || days <= 0) {
    return true
  }

  try {
    const raw = safeStorageGetItem(localStorageApi, lastFetchKey)
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
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return
  }

  try {
    safeStorageSetItem(localStorageApi, lastFetchKey, String(Date.now()))
  } catch {
    // Ignora falhas de storage para não interromper o fluxo.
  }
}

export async function syncCachesWithEmulatorRuntime() {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi || !useFirebaseEmulators || !isLocalHost()) {
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

      const previousRuntime = Number(safeStorageGetItem(localStorageApi, DEV_FUNCTIONS_RUNTIME_KEY))
      if (Number.isFinite(previousRuntime) && previousRuntime > 0 && previousRuntime !== runtimeStartedAtMs) {
        clearAppCacheKeys()
      }

      safeStorageSetItem(localStorageApi, DEV_FUNCTIONS_RUNTIME_KEY, String(runtimeStartedAtMs))
    } catch {
      // Emulador offline/iniciando: ignora.
    } finally {
      emulatorRuntimeSyncPromise = null
    }
  })()

  return emulatorRuntimeSyncPromise
}
