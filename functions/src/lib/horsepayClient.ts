import axios from 'axios'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { asRecord, getTopLevelKeys, getValueShape, readString } from './shared.js'

interface HorsePayAuthResponse {
  access_token?: string
  token?: string
}

function extractHorsePayMessage(data: unknown): string | null {
  if (!data) {
    return null
  }

  if (typeof data === 'string') {
    return data
  }

  const payload = asRecord(data)
  return readString(payload.message) || readString(payload.error) || readString(payload.msg) || null
}

export function toHttpsError(error: unknown, fallbackMessage: string): HttpsError {
  if (error instanceof HttpsError) {
    return error
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as { response?: { status?: number; data?: unknown } }
    const status = axiosError.response?.status || 500
    const message = extractHorsePayMessage(axiosError.response?.data) || fallbackMessage

    if (status === 400) {
      return new HttpsError('invalid-argument', message)
    }

    if (status === 401) {
      return new HttpsError('unauthenticated', message)
    }

    if (status === 403) {
      return new HttpsError('permission-denied', message)
    }

    if (status === 404) {
      return new HttpsError('not-found', message)
    }

    if (status === 429) {
      return new HttpsError('resource-exhausted', message)
    }

    if (status >= 500) {
      return new HttpsError('internal', `[HorsePay ${status}] ${message}`)
    }

    return new HttpsError('internal', message)
  }

  return new HttpsError('internal', fallbackMessage)
}

export async function horsePayRequest<T>({
  baseUrl,
  method,
  path,
  token,
  data,
}: {
  baseUrl: string
  method: 'get' | 'post'
  path: string
  token?: string
  data?: unknown
}): Promise<T> {
  try {
    const response = await axios.request<T>({
      method,
      url: `${baseUrl}${path}`,
      data,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    logger.info('HorsePay request success', {
      path,
      method,
      statusCode: response.status,
      topLevelKeys: getTopLevelKeys(response.data),
    })

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || null
      const responseData = error.response?.data
      logger.error('HorsePay request failed', {
        path,
        method,
        statusCode,
        responseTopLevelKeys: getTopLevelKeys(responseData),
        responseShape: getValueShape(responseData),
        horsePayMessage: extractHorsePayMessage(responseData),
      })
    } else {
      logger.error('HorsePay request failed (non-axios)', {
        path,
        method,
        error: String(error),
      })
    }

    throw error
  }
}

export async function getHorsePayToken({
  baseUrl,
  clientKey,
  clientSecret,
}: {
  baseUrl: string
  clientKey: string
  clientSecret: string
}): Promise<string> {
  if (!clientKey || !clientSecret) {
    throw new HttpsError('internal', 'Secrets da HorsePay nao configurados')
  }

  const tokenResponse = await horsePayRequest<HorsePayAuthResponse>({
    baseUrl,
    method: 'post',
    path: '/auth/token',
    data: {
      client_key: clientKey,
      client_secret: clientSecret,
    },
  })

  const accessToken = tokenResponse.access_token || tokenResponse.token
  if (!accessToken) {
    throw new HttpsError('internal', 'HorsePay nao retornou access_token')
  }

  logger.info('HorsePay token generated', {
    hasAccessToken: Boolean(accessToken),
    topLevelKeys: getTopLevelKeys(tokenResponse),
  })

  return accessToken
}
