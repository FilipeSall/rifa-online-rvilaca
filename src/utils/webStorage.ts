function getStorage(getter: () => Storage) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return getter()
  } catch {
    return null
  }
}

export function getLocalStorage() {
  return getStorage(() => window.localStorage)
}

export function getSessionStorage() {
  return getStorage(() => window.sessionStorage)
}

export function safeStorageGetItem(storage: Storage | null, key: string) {
  if (!storage) {
    return null
  }

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function safeStorageSetItem(storage: Storage | null, key: string, value: string) {
  if (!storage) {
    return false
  }

  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeStorageRemoveItem(storage: Storage | null, key: string) {
  if (!storage) {
    return false
  }

  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function safeStorageKeys(storage: Storage | null) {
  if (!storage) {
    return []
  }

  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key) {
        keys.push(key)
      }
    }
    return keys
  } catch {
    return []
  }
}
