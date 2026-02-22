export type PurchaseFlowLogLevel = 'info' | 'warn' | 'error'

type LogDetails = Record<string, unknown>

const LOGGER_NAMESPACE = '[purchase-flow]'

function isDebugEnabled() {
  if (typeof window === 'undefined') {
    return true
  }

  return import.meta.env.DEV || window.localStorage.getItem('debug:purchase-flow') === '1'
}

function formatMessage(scope: string, event: string) {
  return `${LOGGER_NAMESPACE} [${scope}] ${event}`
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (!error || typeof error !== 'object') {
    return { error: String(error) }
  }

  return error
}

export function logPurchaseFlow(
  scope: string,
  event: string,
  level: PurchaseFlowLogLevel = 'info',
  details?: LogDetails,
) {
  if (!isDebugEnabled()) {
    return
  }

  const payload = {
    at: new Date().toISOString(),
    ...(details || {}),
  }

  if (level === 'error') {
    console.error(formatMessage(scope, event), payload)
    return
  }

  if (level === 'warn') {
    console.warn(formatMessage(scope, event), payload)
    return
  }

  console.info(formatMessage(scope, event), payload)
}
