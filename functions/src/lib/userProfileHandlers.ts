import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { maskUid, requireActiveUid, sanitizeString } from './shared.js'

interface EnsureUserProfileOutput {
  uid: string
  role: 'user' | 'admin'
  created: boolean
  updatedAtMs: number
}

function sanitizeRole(value: unknown): 'user' | 'admin' {
  return sanitizeString(value) === 'admin' ? 'admin' : 'user'
}

function sanitizeEmail(value: unknown): string | null {
  const normalized = sanitizeString(value).toLowerCase()
  return normalized.includes('@') ? normalized : null
}

function sanitizeCpf(value: unknown): string | null {
  const digits = sanitizeString(value).replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

function sanitizePhone(value: unknown): string | null {
  const digits = sanitizeString(value).replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) {
    return null
  }

  return digits
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buildUserSearchFields(params: {
  name?: string | null
  email?: string | null
  cpf?: string | null
  phone?: string | null
}) {
  return {
    nameSearch: params.name ? normalizeSearchText(params.name) : null,
    emailSearch: params.email ? normalizeSearchText(params.email) : null,
    cpfSearch: params.cpf ? params.cpf.replace(/\D/g, '') : null,
    phoneSearch: params.phone ? params.phone.replace(/\D/g, '') : null,
  }
}

function parseAuthCreationTime(value: string | null): Timestamp | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return Timestamp.fromDate(parsed)
}

export function createEnsureUserProfileHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null }): Promise<EnsureUserProfileOutput> => {
    const uid = requireActiveUid(request.auth)

    try {
      const userRef = db.collection('users').doc(uid)
      const [existingSnapshot, authUser] = await Promise.all([
        userRef.get(),
        getAuth().getUser(uid),
      ])

      const existingData = existingSnapshot.exists ? (existingSnapshot.data() || {}) : {}
      const role = sanitizeRole(existingData.role)
      const email = sanitizeEmail(authUser.email) || sanitizeEmail(existingData.email)
      const name =
        sanitizeString(authUser.displayName)
        || sanitizeString(existingData.name)
        || (email ? sanitizeString(email.split('@')[0]) : '')
        || 'Usuario'
      const phone = sanitizePhone(authUser.phoneNumber) || sanitizePhone(existingData.phone)
      const cpf = sanitizeCpf(existingData.cpf)

      const providerIds = Array.from(new Set(
        authUser.providerData
          .map((provider) => sanitizeString(provider.providerId))
          .filter(Boolean),
      ))

      const existingCreatedAtAuth = existingData.createdAtAuth
      const authCreatedAt = parseAuthCreationTime(authUser.metadata.creationTime || null)

      await userRef.set(
        {
          uid,
          name,
          email,
          ...(phone ? { phone } : {}),
          ...(cpf ? { cpf } : {}),
          ...buildUserSearchFields({
            name,
            email,
            cpf,
            phone,
          }),
          role,
          photoURL: sanitizeString(authUser.photoURL) || sanitizeString(existingData.photoURL) || null,
          providerIds,
          createdAtAuth: existingCreatedAtAuth || authCreatedAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastLoginAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      return {
        uid,
        role,
        created: !existingSnapshot.exists,
        updatedAtMs: Date.now(),
      }
    } catch (error) {
      logger.error('ensureUserProfile failed', {
        uid: maskUid(uid),
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel sincronizar o perfil do usuario.')
    }
  }
}
