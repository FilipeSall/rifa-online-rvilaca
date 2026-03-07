import { getAuth, type UserRecord } from 'firebase-admin/auth'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { asRecord, requireActiveUid, sanitizeString } from './shared.js'

type SimpleAccountRole = 'user' | 'admin'

type SimpleAccountProfile = {
  uid: string
  name: string
  cpf: string | null
  phone: string | null
  role: SimpleAccountRole
}

type RegisterSimpleAccountInput = {
  name?: unknown
  cpf?: unknown
  phone?: unknown
}

type RegisterSimpleAccountOutput = {
  token: string
  profile: SimpleAccountProfile
}

type LoginSimpleAccountInput = {
  identifier?: unknown
}

type LoginSimpleAccountOutput = {
  token: string
  profile: SimpleAccountProfile
}

type UpdateSimpleProfileInput = {
  name?: unknown
  phone?: unknown
  cpf?: unknown
}

type UpdateSimpleProfileOutput = {
  profile: SimpleAccountProfile
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

function sanitizeRole(value: unknown): SimpleAccountRole {
  return sanitizeString(value) === 'admin' ? 'admin' : 'user'
}

function sanitizeName(value: unknown): string {
  return sanitizeString(value).slice(0, 80)
}

function sanitizeEmail(value: unknown): string | null {
  const normalized = sanitizeString(value).toLowerCase()
  return normalized.includes('@') ? normalized : null
}

function sanitizeDigits(value: unknown): string {
  return sanitizeString(value).replace(/\D/g, '')
}

function sanitizeCpf(value: unknown): string | null {
  const digits = sanitizeDigits(value)
  return digits.length === 11 ? digits : null
}

function sanitizePhone(value: unknown): string | null {
  const digits = sanitizeDigits(value)
  if (digits.length < 10 || digits.length > 11) {
    return null
  }

  return digits
}

function sanitizeIdentifier(value: unknown): string {
  return sanitizeDigits(value)
}

function readProviderIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => sanitizeString(item))
      .filter(Boolean),
  ))
}

function collectAuthProviderIds(authUser?: UserRecord | null): string[] {
  if (!authUser) {
    return []
  }

  return Array.from(new Set(
    authUser.providerData
      .map((provider) => sanitizeString(provider.providerId))
      .filter(Boolean),
  ))
}

function buildProviderIds(existingProviderIds: unknown, authUser?: UserRecord | null, includeCustom = false): string[] {
  return Array.from(new Set(
    [
      ...readProviderIds(existingProviderIds),
      ...collectAuthProviderIds(authUser),
      ...(includeCustom ? ['custom'] : []),
    ].filter(Boolean),
  ))
}

function readRegistryUid(value: unknown): string | null {
  const record = asRecord(value)
  const uid = sanitizeString(record.uid)
  return uid || null
}

function buildProfile(params: {
  uid: string
  name: string
  cpf: string | null
  phone: string | null
  role: SimpleAccountRole
}): SimpleAccountProfile {
  return {
    uid: params.uid,
    name: params.name,
    cpf: params.cpf,
    phone: params.phone,
    role: params.role,
  }
}

async function resolveUidFromUsersField(db: Firestore, field: 'cpfSearch' | 'phoneSearch', value: string): Promise<string | null> {
  const snapshot = await db.collection('users')
    .where(field, '==', value)
    .limit(2)
    .get()

  if (snapshot.empty) {
    return null
  }

  if (snapshot.size > 1) {
    throw new HttpsError('failed-precondition', 'Existe mais de uma conta para este identificador.')
  }

  return snapshot.docs[0].id
}

export function createRegisterSimpleAccountHandler(db: Firestore) {
  return async (request: { data?: unknown }): Promise<RegisterSimpleAccountOutput> => {
    const payload = asRecord(request.data) as RegisterSimpleAccountInput
    const name = sanitizeName(payload.name)
    const cpf = sanitizeCpf(payload.cpf)
    const phone = sanitizePhone(payload.phone)

    if (name.length < 2) {
      throw new HttpsError('invalid-argument', 'Informe um nome valido para criar a conta.')
    }

    if (!cpf) {
      throw new HttpsError('invalid-argument', 'Informe um CPF valido com 11 digitos.')
    }

    if (!phone) {
      throw new HttpsError('invalid-argument', 'Informe um telefone valido com DDD.')
    }

    let createdUid: string | null = null

    try {
      const createdUser = await getAuth().createUser({ displayName: name })
      createdUid = createdUser.uid

      const userRef = db.collection('users').doc(createdUid)
      const cpfRef = db.collection('cpfRegistry').doc(cpf)
      const phoneRef = db.collection('phoneRegistry').doc(phone)

      await db.runTransaction(async (transaction) => {
        const [cpfSnapshot, phoneSnapshot, userSnapshot] = await Promise.all([
          transaction.get(cpfRef),
          transaction.get(phoneRef),
          transaction.get(userRef),
        ])

        const existingCpfUid = readRegistryUid(cpfSnapshot.exists ? cpfSnapshot.data() : null)
        const existingPhoneUid = readRegistryUid(phoneSnapshot.exists ? phoneSnapshot.data() : null)

        if (existingCpfUid && existingCpfUid !== createdUid) {
          throw new HttpsError('already-exists', 'CPF ja cadastrado em outra conta.')
        }

        if (existingPhoneUid && existingPhoneUid !== createdUid) {
          throw new HttpsError('already-exists', 'Telefone ja cadastrado em outra conta.')
        }

        const existingUserData = userSnapshot.exists ? userSnapshot.data() || {} : {}
        const profileName = sanitizeName(existingUserData.name) || name
        const profileCpf = sanitizeCpf(existingUserData.cpf) || cpf
        const profilePhone = sanitizePhone(existingUserData.phone) || phone
        const profileEmail = sanitizeEmail(existingUserData.email) || sanitizeEmail(createdUser.email)

        transaction.set(cpfRef, {
          uid: createdUid,
          cpf,
          createdAt: FieldValue.serverTimestamp(),
        })

        transaction.set(phoneRef, {
          uid: createdUid,
          phone,
          createdAt: FieldValue.serverTimestamp(),
        })

        transaction.set(
          userRef,
          {
            uid: createdUid,
            name: profileName,
            cpf: profileCpf,
            phone: profilePhone,
            email: profileEmail,
            ...buildUserSearchFields({
              name: profileName,
              email: profileEmail,
              cpf: profileCpf,
              phone: profilePhone,
            }),
            role: 'user',
            providerIds: buildProviderIds(existingUserData.providerIds, createdUser, true),
            createdAtAuth: existingUserData.createdAtAuth || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastLoginAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      })

      const token = await getAuth().createCustomToken(createdUid)

      return {
        token,
        profile: buildProfile({
          uid: createdUid,
          name,
          cpf,
          phone,
          role: 'user',
        }),
      }
    } catch (error) {
      if (createdUid) {
        try {
          await getAuth().deleteUser(createdUid)
        } catch (rollbackError) {
          logger.error('registerSimpleAccount rollback failed', {
            uid: createdUid,
            error: String(rollbackError),
          })
        }
      }

      if (error instanceof HttpsError) {
        throw error
      }

      logger.error('registerSimpleAccount failed', {
        error: String(error),
      })

      throw new HttpsError('internal', 'Nao foi possivel criar sua conta agora.')
    }
  }
}

export function createLoginSimpleAccountHandler(db: Firestore) {
  return async (request: { data?: unknown }): Promise<LoginSimpleAccountOutput> => {
    const payload = asRecord(request.data) as LoginSimpleAccountInput
    const identifier = sanitizeIdentifier(payload.identifier)

    if (identifier.length !== 10 && identifier.length !== 11) {
      throw new HttpsError('invalid-argument', 'Informe um CPF ou telefone valido para entrar.')
    }

    try {
      let resolvedUid: string | null = null
      let resolvedCpf: string | null = null
      let resolvedPhone: string | null = null

      if (identifier.length === 11) {
        const cpfSnapshot = await db.collection('cpfRegistry').doc(identifier).get()
        const cpfUid = readRegistryUid(cpfSnapshot.exists ? cpfSnapshot.data() : null)
        if (cpfUid) {
          resolvedUid = cpfUid
          resolvedCpf = identifier
        }
      }

      if (!resolvedUid && identifier.length === 11) {
        const uidFromCpfSearch = await resolveUidFromUsersField(db, 'cpfSearch', identifier)
        if (uidFromCpfSearch) {
          resolvedUid = uidFromCpfSearch
          resolvedCpf = identifier
        }
      }

      if (!resolvedUid) {
        const phoneSnapshot = await db.collection('phoneRegistry').doc(identifier).get()
        const phoneUid = readRegistryUid(phoneSnapshot.exists ? phoneSnapshot.data() : null)
        if (phoneUid) {
          resolvedUid = phoneUid
          resolvedPhone = identifier
        }
      }

      if (!resolvedUid) {
        const uidFromPhoneSearch = await resolveUidFromUsersField(db, 'phoneSearch', identifier)
        if (uidFromPhoneSearch) {
          resolvedUid = uidFromPhoneSearch
          resolvedPhone = identifier
        }
      }

      if (!resolvedUid) {
        throw new HttpsError('not-found', 'Conta nao encontrada para este CPF/telefone.')
      }

      const userRef = db.collection('users').doc(resolvedUid)
      const userSnapshot = await userRef.get()
      if (!userSnapshot.exists) {
        throw new HttpsError('not-found', 'Conta nao encontrada para este CPF/telefone.')
      }

      const existingUserData = userSnapshot.data() || {}
      const name = sanitizeName(existingUserData.name) || 'Usuario'
      const cpf = sanitizeCpf(existingUserData.cpf) || resolvedCpf
      const phone = sanitizePhone(existingUserData.phone) || resolvedPhone
      const role = sanitizeRole(existingUserData.role)
      const email = sanitizeEmail(existingUserData.email)

      if (cpf) {
        await db.collection('cpfRegistry').doc(cpf).set({
          uid: resolvedUid,
          cpf,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }

      if (phone) {
        await db.collection('phoneRegistry').doc(phone).set({
          uid: resolvedUid,
          phone,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }

      await userRef.set(
        {
          uid: resolvedUid,
          name,
          ...(cpf ? { cpf } : {}),
          ...(phone ? { phone } : {}),
          email,
          ...buildUserSearchFields({
            name,
            email,
            cpf,
            phone,
          }),
          role,
          providerIds: buildProviderIds(existingUserData.providerIds, null, true),
          createdAtAuth: existingUserData.createdAtAuth || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastLoginAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      const token = await getAuth().createCustomToken(resolvedUid)

      return {
        token,
        profile: buildProfile({
          uid: resolvedUid,
          name,
          cpf,
          phone,
          role,
        }),
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error('loginSimpleAccount failed', {
        error: String(error),
      })

      throw new HttpsError('internal', 'Nao foi possivel entrar na conta agora.')
    }
  }
}

export function createUpdateSimpleProfileHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data?: unknown }): Promise<UpdateSimpleProfileOutput> => {
    const uid = requireActiveUid(request.auth)
    const payload = asRecord(request.data) as UpdateSimpleProfileInput

    const name = sanitizeName(payload.name)
    const phone = sanitizePhone(payload.phone)
    const hasCpfInPayload = Object.prototype.hasOwnProperty.call(payload, 'cpf')
    const requestedCpf = hasCpfInPayload ? sanitizeCpf(payload.cpf) : null

    if (name.length < 2) {
      throw new HttpsError('invalid-argument', 'Informe um nome valido para atualizar o perfil.')
    }

    if (!phone) {
      throw new HttpsError('invalid-argument', 'Informe um telefone valido com DDD.')
    }

    if (hasCpfInPayload && !requestedCpf) {
      throw new HttpsError('invalid-argument', 'Informe um CPF valido com 11 digitos.')
    }

    try {
      const userRef = db.collection('users').doc(uid)
      const [existingUserSnapshot, authUser] = await Promise.all([
        userRef.get(),
        getAuth().getUser(uid),
      ])

      const existingUserData = existingUserSnapshot.exists ? existingUserSnapshot.data() || {} : {}
      const role = sanitizeRole(existingUserData.role)
      const email = sanitizeEmail(existingUserData.email) || sanitizeEmail(authUser.email)
      const existingCpf = sanitizeCpf(existingUserData.cpf)
      const existingPhone = sanitizePhone(existingUserData.phone)

      if (existingCpf && requestedCpf && existingCpf !== requestedCpf) {
        throw new HttpsError('failed-precondition', 'CPF ja definido e nao pode ser alterado.')
      }

      if (existingPhone && existingPhone !== phone) {
        throw new HttpsError('failed-precondition', 'Telefone ja definido e nao pode ser alterado.')
      }

      const finalCpf = existingCpf || requestedCpf || null
      const providerIds = buildProviderIds(existingUserData.providerIds, authUser, false)

      await db.runTransaction(async (transaction) => {
        const phoneRef = db.collection('phoneRegistry').doc(phone)
        const cpfRef = finalCpf ? db.collection('cpfRegistry').doc(finalCpf) : null

        const [newPhoneSnapshot, cpfSnapshot] = await Promise.all([
          transaction.get(phoneRef),
          cpfRef ? transaction.get(cpfRef) : Promise.resolve(null),
        ])

        const existingPhoneUid = readRegistryUid(newPhoneSnapshot.exists ? newPhoneSnapshot.data() : null)
        if (existingPhoneUid && existingPhoneUid !== uid) {
          throw new HttpsError('already-exists', 'Telefone ja cadastrado em outra conta.')
        }

        if (cpfSnapshot && finalCpf) {
          const existingCpfUid = readRegistryUid(cpfSnapshot.exists ? cpfSnapshot.data() : null)
          if (existingCpfUid && existingCpfUid !== uid) {
            throw new HttpsError('already-exists', 'CPF ja cadastrado em outra conta.')
          }
        }

        transaction.set(phoneRef, {
          uid,
          phone,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true })

        if (finalCpf && cpfRef) {
          transaction.set(cpfRef, {
            uid,
            cpf: finalCpf,
            createdAt: FieldValue.serverTimestamp(),
          }, { merge: true })
        }

        transaction.set(
          userRef,
          {
            uid,
            name,
            phone,
            ...(finalCpf ? { cpf: finalCpf } : {}),
            email,
            ...buildUserSearchFields({
              name,
              email,
              cpf: finalCpf,
              phone,
            }),
            role,
            providerIds,
            createdAtAuth: existingUserData.createdAtAuth || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      })

      await getAuth().updateUser(uid, { displayName: name })

      return {
        profile: buildProfile({
          uid,
          name,
          cpf: finalCpf,
          phone,
          role,
        }),
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error('updateSimpleProfile failed', {
        uid,
        error: String(error),
      })

      throw new HttpsError('internal', 'Nao foi possivel atualizar seu perfil agora.')
    }
  }
}
