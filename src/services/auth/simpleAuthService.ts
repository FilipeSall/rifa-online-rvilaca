import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'
import {
  getLocalStorage,
  safeStorageGetItem,
  safeStorageRemoveItem,
  safeStorageSetItem,
} from '../../utils/webStorage'

export type SimpleAccountRole = 'user' | 'admin'

export type SimpleAccountProfile = {
  uid: string
  name: string
  cpf: string | null
  phone: string | null
  role: SimpleAccountRole
}

type SimpleAuthResponse = {
  token: string
  profile: SimpleAccountProfile
}

type RegisterSimpleAccountInput = {
  name: string
  cpf: string
  phone: string
}

type LoginSimpleAccountInput = {
  identifier: string
}

type UpdateSimpleProfileInput = {
  name: string
  phone: string
  cpf?: string
}

type CallableEnvelope<T> = T | { result?: T }

export type SimpleAuthSession = {
  uid: string
  name: string
  cpf: string | null
  phone: string | null
  lastIdentifier: string
  updatedAt: number
}

export const SIMPLE_AUTH_SESSION_KEY = 'rifa-online:auth:simple-session:v1'

const registerSimpleAccountCallable = httpsCallable<RegisterSimpleAccountInput, CallableEnvelope<SimpleAuthResponse>>(
  functions,
  'registerSimpleAccount',
)

const loginSimpleAccountCallable = httpsCallable<LoginSimpleAccountInput, CallableEnvelope<SimpleAuthResponse>>(
  functions,
  'loginSimpleAccount',
)

const updateSimpleProfileCallable = httpsCallable<UpdateSimpleProfileInput, CallableEnvelope<{ profile: SimpleAccountProfile }>>(
  functions,
  'updateSimpleProfile',
)

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function sanitizeProfile(profile: unknown): SimpleAccountProfile | null {
  if (!profile || typeof profile !== 'object') {
    return null
  }

  const raw = profile as Record<string, unknown>
  const uid = typeof raw.uid === 'string' ? raw.uid.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const cpf = typeof raw.cpf === 'string' ? normalizeDigits(raw.cpf).slice(0, 11) : null
  const phone = typeof raw.phone === 'string' ? normalizeDigits(raw.phone).slice(0, 11) : null
  const role = raw.role === 'admin' ? 'admin' : 'user'

  if (!uid || !name) {
    return null
  }

  return {
    uid,
    name,
    cpf: cpf || null,
    phone: phone || null,
    role,
  }
}

export function normalizeSimpleAuthIdentifier(value: string) {
  return normalizeDigits(value)
}

export async function registerSimpleAccount(input: RegisterSimpleAccountInput): Promise<SimpleAuthResponse> {
  const payload: RegisterSimpleAccountInput = {
    name: input.name.trim(),
    cpf: normalizeDigits(input.cpf),
    phone: normalizeDigits(input.phone),
  }

  const response = await registerSimpleAccountCallable(payload)
  const data = unwrapCallableData(response.data)

  if (!data || typeof data !== 'object') {
    throw new Error('invalid-simple-auth-response')
  }

  const profile = sanitizeProfile((data as { profile?: unknown }).profile)
  const token = typeof (data as { token?: unknown }).token === 'string'
    ? (data as { token: string }).token
    : ''

  if (!token || !profile) {
    throw new Error('invalid-simple-auth-response')
  }

  return { token, profile }
}

export async function loginSimpleAccount(input: LoginSimpleAccountInput): Promise<SimpleAuthResponse> {
  const payload: LoginSimpleAccountInput = {
    identifier: normalizeDigits(input.identifier),
  }

  const response = await loginSimpleAccountCallable(payload)
  const data = unwrapCallableData(response.data)

  if (!data || typeof data !== 'object') {
    throw new Error('invalid-simple-auth-response')
  }

  const profile = sanitizeProfile((data as { profile?: unknown }).profile)
  const token = typeof (data as { token?: unknown }).token === 'string'
    ? (data as { token: string }).token
    : ''

  if (!token || !profile) {
    throw new Error('invalid-simple-auth-response')
  }

  return { token, profile }
}

export async function updateSimpleProfile(input: { name: string, phone: string, cpf?: string | null }) {
  const payload: UpdateSimpleProfileInput = {
    name: input.name.trim(),
    phone: normalizeDigits(input.phone),
    ...(input.cpf ? { cpf: normalizeDigits(input.cpf) } : {}),
  }

  const response = await updateSimpleProfileCallable(payload)
  const data = unwrapCallableData(response.data)

  if (!data || typeof data !== 'object') {
    throw new Error('invalid-simple-auth-response')
  }

  const profile = sanitizeProfile((data as { profile?: unknown }).profile)
  if (!profile) {
    throw new Error('invalid-simple-auth-response')
  }

  return { profile }
}

export function saveSimpleAuthSession(profile: SimpleAccountProfile, lastIdentifier: string) {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return
  }

  const normalizedIdentifier = normalizeDigits(lastIdentifier)
  if (!normalizedIdentifier) {
    return
  }

  const session: SimpleAuthSession = {
    uid: profile.uid,
    name: profile.name,
    cpf: profile.cpf,
    phone: profile.phone,
    lastIdentifier: normalizedIdentifier,
    updatedAt: Date.now(),
  }

  safeStorageSetItem(localStorageApi, SIMPLE_AUTH_SESSION_KEY, JSON.stringify(session))
}

export function readSimpleAuthSession(): SimpleAuthSession | null {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return null
  }

  const raw = safeStorageGetItem(localStorageApi, SIMPLE_AUTH_SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SimpleAuthSession>
    const uid = typeof parsed.uid === 'string' ? parsed.uid.trim() : ''
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    const lastIdentifier = typeof parsed.lastIdentifier === 'string' ? normalizeDigits(parsed.lastIdentifier) : ''
    const updatedAt = Number(parsed.updatedAt)

    if (!uid || !name || !lastIdentifier || !Number.isFinite(updatedAt)) {
      return null
    }

    return {
      uid,
      name,
      cpf: typeof parsed.cpf === 'string' ? normalizeDigits(parsed.cpf).slice(0, 11) || null : null,
      phone: typeof parsed.phone === 'string' ? normalizeDigits(parsed.phone).slice(0, 11) || null : null,
      lastIdentifier,
      updatedAt,
    }
  } catch {
    return null
  }
}

export function clearSimpleAuthSession() {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return
  }

  safeStorageRemoveItem(localStorageApi, SIMPLE_AUTH_SESSION_KEY)
}
