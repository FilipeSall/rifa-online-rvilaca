const MS_PER_DAY = 24 * 60 * 60 * 1000

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
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
