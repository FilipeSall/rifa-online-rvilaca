import { FieldPath, FieldValue, type DocumentData, type Firestore, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveUid, sanitizeString } from './shared.js'

type SearchAdminUsersInput = {
  term?: unknown
  limit?: unknown
}

type SearchAdminUsersOutput = {
  term: string
  strategy: 'prefix-indexed-fields'
  results: AdminUserSearchItem[]
}

type AdminUserSearchItem = {
  uid: string
  name: string
  email: string | null
  cpf: string | null
  phone: string | null
  role: 'user' | 'admin'
  photoURL: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
  lastLoginAtMs: number | null
  matchedFields: string[]
}

type GetAdminUserDetailsInput = {
  uid?: unknown
}

type GetAdminUserDetailsOutput = {
  user: {
    uid: string
    name: string
    email: string | null
    cpf: string | null
    phone: string | null
    role: 'user' | 'admin'
    photoURL: string | null
    createdAtMs: number | null
    updatedAtMs: number | null
    lastLoginAtMs: number | null
  }
  availableRoles: Array<'user' | 'admin'>
  orders: Array<{
    id: string
    status: string
    amount: number | null
    numbers: number[]
    payerPhone: string | null
    payerCpf: string | null
    campaignId: string | null
    createdAtMs: number | null
  }>
  purchasedNumbers: number[]
  wins: Array<{
    drawType: 'top_buyers' | 'main_raffle'
    drawId: string
    drawDate: string
    drawPrize: string
    winningLabel: string
    publishedAtMs: number
  }>
  stats: {
    totalOrders: number
    paidOrders: number
    totalPurchasedNumbers: number
    totalWins: number
  }
}

type UpdateAdminUserRoleInput = {
  uid?: unknown
  role?: unknown
}

type UpdateAdminUserRoleOutput = {
  uid: string
  role: 'user' | 'admin'
}

type CleanupLegacyUserOrdersFieldInput = {
  dryRun?: unknown
  batchSize?: unknown
}

type CleanupLegacyUserOrdersFieldOutput = {
  field: string
  scannedUsers: number
  usersWithLegacyField: number
  usersUpdated: number
}

type ClearOrderHistoryAdminInput = {
  confirmPhrase?: unknown
  dryRun?: unknown
  batchSize?: unknown
}

type ClearOrderHistoryAdminOutput = {
  dryRun: boolean
  confirmPhraseRequired: string
  scannedOrders: number
  deletedOrders: number
  deletedOrderEvents: number
  deletedOrderNumbers: number
  deletedPayments: number
  deletedSalesLedger: number
  deletedNumberChunks: number
  deletedNumberStates: number
  deletedNumberReservations: number
  deletedSalesMetricsDaily: number
  metricsSummaryReset: boolean
}

const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT = 40
const LEGACY_USER_ORDERS_FIELD = 'pedidosRealizados'
const CLEAR_ORDER_HISTORY_CONFIRM_PHRASE = 'LIMPAR_HISTORICO_PEDIDOS'
const DEFAULT_CLEANUP_BATCH_SIZE = 250
const MIN_CLEANUP_BATCH_SIZE = 50
const MAX_CLEANUP_BATCH_SIZE = 400

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function extractDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function sanitizeSearchLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return DEFAULT_SEARCH_LIMIT
  }

  return Math.max(5, Math.min(parsed, MAX_SEARCH_LIMIT))
}

function sanitizeCleanupBatchSize(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return DEFAULT_CLEANUP_BATCH_SIZE
  }

  return Math.max(MIN_CLEANUP_BATCH_SIZE, Math.min(parsed, MAX_CLEANUP_BATCH_SIZE))
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return fallback
}

async function deleteQueryDocumentsInChunks(params: {
  db: Firestore
  baseQuery: Query<DocumentData>
  batchSize: number
  dryRun: boolean
}): Promise<{ scanned: number; deleted: number }> {
  let scanned = 0
  let deleted = 0
  let lastDocId: string | null = null

  for (;;) {
    let query = params.baseQuery.orderBy(FieldPath.documentId()).limit(params.batchSize)
    if (lastDocId) {
      query = query.startAfter(lastDocId)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    scanned += snapshot.size
    lastDocId = snapshot.docs[snapshot.docs.length - 1]?.id || null

    if (!params.dryRun) {
      const batch = snapshot.docs.reduce((currentBatch, docSnapshot) => {
        currentBatch.delete(docSnapshot.ref)
        return currentBatch
      }, params.db.batch())

      await batch.commit()
      deleted += snapshot.size
    }

    if (snapshot.size < params.batchSize) {
      break
    }
  }

  return { scanned, deleted: params.dryRun ? 0 : deleted }
}

function readTimestampMillis(value: unknown): number | null {
  if (!value) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (
    typeof value === 'object'
    && value !== null
    && 'toMillis' in value
    && typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return Number((value as { toMillis: () => number }).toMillis())
    } catch {
      return null
    }
  }

  return null
}

function sanitizeRole(value: unknown): 'user' | 'admin' {
  const normalized = sanitizeString(value).toLowerCase()
  return normalized === 'admin' ? 'admin' : 'user'
}

function parseRoleInput(value: unknown): 'user' | 'admin' | null {
  const normalized = sanitizeString(value).toLowerCase()
  if (normalized === 'admin' || normalized === 'user') {
    return normalized
  }

  return null
}

function sanitizeEmail(value: unknown): string | null {
  const normalized = sanitizeString(value).toLowerCase()
  return normalized || null
}

function sanitizeName(value: unknown): string {
  const normalized = sanitizeString(value)
  return normalized || 'Usuario'
}

function sanitizePhone(value: unknown): string | null {
  const normalized = sanitizeString(value)
  return normalized || null
}

function sanitizeCpf(value: unknown): string | null {
  const digits = extractDigits(sanitizeString(value))
  return digits || null
}

function sanitizePhotoUrl(value: unknown): string | null {
  const normalized = sanitizeString(value)
  return normalized || null
}

function sanitizeNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )).sort((a, b) => a - b)
}

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeRole(userSnapshot.get('role'))

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem acessar a gestao de usuarios.')
  }
}

async function runPrefixQuery(
  db: Firestore,
  field: string,
  term: string,
  limit: number,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const normalizedTerm = sanitizeString(term)
  if (!normalizedTerm) {
    return []
  }

  try {
    const snapshot = await db.collection('users')
      .orderBy(field)
      .startAt(normalizedTerm)
      .endAt(`${normalizedTerm}\uf8ff`)
      .limit(limit)
      .get()

    return snapshot.docs
  } catch (error) {
    logger.warn('searchUsersAdmin:prefix_query_failed', {
      field,
      term: normalizedTerm.slice(0, 24),
      error: String(error),
    })
    return []
  }
}

function buildSearchItem(
  documentSnapshot: QueryDocumentSnapshot<DocumentData>,
  matchedFields: Set<string>,
): AdminUserSearchItem {
  const data = documentSnapshot.data()
  return {
    uid: documentSnapshot.id,
    name: sanitizeName(data.name),
    email: sanitizeEmail(data.email),
    cpf: sanitizeCpf(data.cpf),
    phone: sanitizePhone(data.phone),
    role: sanitizeRole(data.role),
    photoURL: sanitizePhotoUrl(data.photoURL),
    createdAtMs: readTimestampMillis(data.createdAtAuth) ?? readTimestampMillis(data.createdAt),
    updatedAtMs: readTimestampMillis(data.updatedAt),
    lastLoginAtMs: readTimestampMillis(data.lastLoginAt),
    matchedFields: Array.from(matchedFields).sort(),
  }
}

function scoreSearchResult(
  item: AdminUserSearchItem,
  normalizedTerm: string,
  digitsTerm: string,
): number {
  const normalizedName = normalizeText(item.name)
  const normalizedEmail = normalizeText(item.email || '')
  const normalizedCpf = extractDigits(item.cpf || '')
  const normalizedPhone = extractDigits(item.phone || '')

  let score = 0

  if (normalizedTerm) {
    if (normalizedEmail === normalizedTerm) score += 120
    if (normalizedName === normalizedTerm) score += 110
    if (normalizedEmail.startsWith(normalizedTerm)) score += 90
    if (normalizedName.startsWith(normalizedTerm)) score += 80
    if (normalizedEmail.includes(normalizedTerm)) score += 45
    if (normalizedName.includes(normalizedTerm)) score += 40
  }

  if (digitsTerm) {
    if (normalizedCpf === digitsTerm) score += 120
    if (normalizedPhone === digitsTerm) score += 110
    if (normalizedCpf.startsWith(digitsTerm)) score += 85
    if (normalizedPhone.startsWith(digitsTerm)) score += 80
    if (normalizedCpf.includes(digitsTerm)) score += 42
    if (normalizedPhone.includes(digitsTerm)) score += 40
  }

  score += item.matchedFields.length * 4
  return score
}

function matchesSearchTerm(
  item: AdminUserSearchItem,
  normalizedTerm: string,
  digitsTerm: string,
): boolean {
  const normalizedName = normalizeText(item.name)
  const normalizedEmail = normalizeText(item.email || '')
  const normalizedCpf = extractDigits(item.cpf || '')
  const normalizedPhone = extractDigits(item.phone || '')

  if (digitsTerm) {
    return normalizedCpf.includes(digitsTerm) || normalizedPhone.includes(digitsTerm)
  }

  return normalizedName.includes(normalizedTerm) || normalizedEmail.includes(normalizedTerm)
}

export function createSearchAdminUsersHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<SearchAdminUsersOutput> => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = (request.data && typeof request.data === 'object'
      ? request.data as SearchAdminUsersInput
      : {}) as SearchAdminUsersInput

    const rawTerm = sanitizeString(payload.term)
    const normalizedTerm = normalizeText(rawTerm)
    const digitsTerm = extractDigits(rawTerm)
    const limit = sanitizeSearchLimit(payload.limit)

    if (rawTerm.length < 2) {
      return {
        term: rawTerm,
        strategy: 'prefix-indexed-fields',
        results: [],
      }
    }

    const perFieldLimit = Math.max(6, Math.min(14, Math.ceil(limit / 2)))
    const queryPromises: Array<Promise<{ field: string; docs: QueryDocumentSnapshot<DocumentData>[] }>> = []

    if (normalizedTerm.length >= 2) {
      queryPromises.push(
        runPrefixQuery(db, 'nameSearch', normalizedTerm, perFieldLimit).then((docs) => ({ field: 'name', docs })),
        runPrefixQuery(db, 'emailSearch', normalizedTerm, perFieldLimit).then((docs) => ({ field: 'email', docs })),
      )

      // Fallback for legacy profiles that do not have normalized search fields.
      queryPromises.push(
        runPrefixQuery(db, 'name', rawTerm, 8).then((docs) => ({ field: 'name-legacy', docs })),
        runPrefixQuery(db, 'email', rawTerm.toLowerCase(), 8).then((docs) => ({ field: 'email-legacy', docs })),
      )
    }

    if (digitsTerm.length >= 2) {
      queryPromises.push(
        runPrefixQuery(db, 'cpfSearch', digitsTerm, perFieldLimit).then((docs) => ({ field: 'cpf', docs })),
        runPrefixQuery(db, 'phoneSearch', digitsTerm, perFieldLimit).then((docs) => ({ field: 'phone', docs })),
      )

      // Fallback for legacy profiles that do not have normalized search fields.
      queryPromises.push(
        runPrefixQuery(db, 'cpf', digitsTerm, 8).then((docs) => ({ field: 'cpf-legacy', docs })),
        runPrefixQuery(db, 'phone', digitsTerm, 8).then((docs) => ({ field: 'phone-legacy', docs })),
      )
    }

    const queryResults = await Promise.all(queryPromises)
    const merged = new Map<string, { snapshot: QueryDocumentSnapshot<DocumentData>; matchedFields: Set<string> }>()

    for (const { field, docs } of queryResults) {
      for (const doc of docs) {
        const existing = merged.get(doc.id)
        if (!existing) {
          merged.set(doc.id, {
            snapshot: doc,
            matchedFields: new Set([field]),
          })
          continue
        }

        existing.matchedFields.add(field)
      }
    }

    const results = Array.from(merged.values())
      .map((entry) => buildSearchItem(entry.snapshot, entry.matchedFields))
      .filter((item) => matchesSearchTerm(item, normalizedTerm, digitsTerm))
      .map((item) => ({
        item,
        score: scoreSearchResult(item, normalizedTerm, digitsTerm),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }

        return left.item.name.localeCompare(right.item.name, 'pt-BR')
      })
      .slice(0, limit)
      .map((entry) => entry.item)

    return {
      term: rawTerm,
      strategy: 'prefix-indexed-fields',
      results,
    }
  }
}

function parseTopBuyersWin(documentData: DocumentData) {
  const drawId = sanitizeString(documentData.drawId)
  if (!drawId) {
    return null
  }

  const drawDate = sanitizeString(documentData.drawDate) || '-'
  const drawPrize = sanitizeString(documentData.drawPrize) || 'Premio'
  const winningPosition = Number(documentData.winningPosition)
  const publishedAtMs = Number(documentData.publishedAtMs) || 0

  return {
    drawType: 'top_buyers' as const,
    drawId,
    drawDate,
    drawPrize,
    winningLabel: Number.isInteger(winningPosition) && winningPosition > 0
      ? `Posicao ${winningPosition}`
      : 'Top compradores',
    publishedAtMs,
  }
}

function parseMainRaffleWin(documentData: DocumentData) {
  const drawId = sanitizeString(documentData.drawId)
  if (!drawId) {
    return null
  }

  const drawDate = sanitizeString(documentData.drawDate) || '-'
  const drawPrize = sanitizeString(documentData.drawPrize) || 'Premio'
  const winningNumberFormatted = sanitizeString(documentData.winningNumberFormatted)
  const publishedAtMs = Number(documentData.publishedAtMs) || 0

  return {
    drawType: 'main_raffle' as const,
    drawId,
    drawDate,
    drawPrize,
    winningLabel: winningNumberFormatted
      ? `Numero ${winningNumberFormatted}`
      : 'Sorteio principal',
    publishedAtMs,
  }
}

export function createGetAdminUserDetailsHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<GetAdminUserDetailsOutput> => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = (request.data && typeof request.data === 'object'
      ? request.data as GetAdminUserDetailsInput
      : {}) as GetAdminUserDetailsInput

    const targetUid = sanitizeString(payload.uid)
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'uid do usuario e obrigatorio.')
    }

    const userRef = db.collection('users').doc(targetUid)
    const [userSnapshot, ordersSnapshot, topWinsSnapshot, mainWinsSnapshot] = await Promise.all([
      userRef.get(),
      db.collection('orders').where('userId', '==', targetUid).limit(120).get(),
      db.collection('topBuyersDrawResults').where('winner.userId', '==', targetUid).limit(40).get(),
      db.collection('mainRaffleDrawResults').where('winner.userId', '==', targetUid).limit(40).get(),
    ])

    if (!userSnapshot.exists) {
      throw new HttpsError('not-found', 'Usuario nao encontrado.')
    }

    const userData = userSnapshot.data() as DocumentData
    const userRole = sanitizeRole(userData.role)

    const orders = ordersSnapshot.docs
      .map((documentSnapshot) => {
        const data = documentSnapshot.data()
        const createdAtMs =
          readTimestampMillis(data.paidBusinessAppliedAt)
          ?? readTimestampMillis(data.createdAt)
          ?? readTimestampMillis(data.updatedAt)

        return {
          id: documentSnapshot.id,
          status: sanitizeString(data.status).toLowerCase() || 'pending',
          amount: Number.isFinite(Number(data.amount)) ? Number(data.amount) : null,
          numbers: sanitizeNumbers(data.reservedNumbers),
          payerPhone: sanitizePhone(data.payerPhone),
          payerCpf: sanitizeCpf(data.payerCpf),
          campaignId: sanitizeString(data.campaignId) || null,
          createdAtMs,
          type: sanitizeString(data.type).toLowerCase() || 'deposit',
        }
      })
      .filter((order) => order.type === 'deposit')
      .sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0))
      .map(({ type: _ignored, ...order }) => order)

    const paidNumbers = new Set<number>()
    let paidOrders = 0

    for (const order of orders) {
      if (order.status === 'paid') {
        paidOrders += 1
        for (const number of order.numbers) {
          paidNumbers.add(number)
        }
      }
    }

    const purchasedNumbers = Array.from(paidNumbers).sort((a, b) => a - b)
    const topWins = topWinsSnapshot.docs
      .map((documentSnapshot) => parseTopBuyersWin(documentSnapshot.data()))
      .filter((item): item is NonNullable<ReturnType<typeof parseTopBuyersWin>> => Boolean(item))
    const mainWins = mainWinsSnapshot.docs
      .map((documentSnapshot) => parseMainRaffleWin(documentSnapshot.data()))
      .filter((item): item is NonNullable<ReturnType<typeof parseMainRaffleWin>> => Boolean(item))
    const wins = [...topWins, ...mainWins]
      .sort((left, right) => right.publishedAtMs - left.publishedAtMs)
      .slice(0, 60)

    const availableRoles: Array<'user' | 'admin'> = ['user', 'admin']

    return {
      user: {
        uid: targetUid,
        name: sanitizeName(userData.name),
        email: sanitizeEmail(userData.email),
        cpf: sanitizeCpf(userData.cpf),
        phone: sanitizePhone(userData.phone),
        role: userRole,
        photoURL: sanitizePhotoUrl(userData.photoURL),
        createdAtMs: readTimestampMillis(userData.createdAtAuth) ?? readTimestampMillis(userData.createdAt),
        updatedAtMs: readTimestampMillis(userData.updatedAt),
        lastLoginAtMs: readTimestampMillis(userData.lastLoginAt),
      },
      availableRoles,
      orders,
      purchasedNumbers,
      wins,
      stats: {
        totalOrders: orders.length,
        paidOrders,
        totalPurchasedNumbers: purchasedNumbers.length,
        totalWins: wins.length,
      },
    }
  }
}

export function createUpdateAdminUserRoleHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<UpdateAdminUserRoleOutput> => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = (request.data && typeof request.data === 'object'
      ? request.data as UpdateAdminUserRoleInput
      : {}) as UpdateAdminUserRoleInput

    const targetUid = sanitizeString(payload.uid)
    const nextRole = parseRoleInput(payload.role)

    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'uid do usuario e obrigatorio.')
    }

    if (!nextRole) {
      throw new HttpsError('invalid-argument', 'role invalido. Valores permitidos: admin ou user.')
    }

    const userRef = db.collection('users').doc(targetUid)
    const targetSnapshot = await userRef.get()
    if (!targetSnapshot.exists) {
      throw new HttpsError('not-found', 'Usuario nao encontrado.')
    }

    await userRef.set(
      {
        role: nextRole,
        updatedAt: FieldValue.serverTimestamp(),
        roleUpdatedBy: uid,
      },
      { merge: true },
    )

    return {
      uid: targetUid,
      role: nextRole,
    }
  }
}

export function createCleanupLegacyUserOrdersFieldHandler(db: Firestore) {
  return async (
    request: { auth?: { uid?: string | null } | null, data: unknown },
  ): Promise<CleanupLegacyUserOrdersFieldOutput> => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = (request.data && typeof request.data === 'object'
      ? request.data as CleanupLegacyUserOrdersFieldInput
      : {}) as CleanupLegacyUserOrdersFieldInput

    const dryRun = payload.dryRun === true
    const batchSize = sanitizeCleanupBatchSize(payload.batchSize)

    let scannedUsers = 0
    let usersWithLegacyField = 0
    let usersUpdated = 0
    let lastDocument: QueryDocumentSnapshot<DocumentData> | null = null

    for (;;) {
      let query = db.collection('users')
        .orderBy(FieldPath.documentId())
        .limit(batchSize)

      if (lastDocument) {
        query = query.startAfter(lastDocument)
      }

      const snapshot = await query.get()
      if (snapshot.empty) {
        break
      }

      scannedUsers += snapshot.size
      let writesInBatch = 0
      const batch = dryRun ? null : db.batch()

      for (const documentSnapshot of snapshot.docs) {
        const data = documentSnapshot.data()
        if (!Object.prototype.hasOwnProperty.call(data, LEGACY_USER_ORDERS_FIELD)) {
          continue
        }

        usersWithLegacyField += 1
        if (!batch) {
          continue
        }

        batch.update(documentSnapshot.ref, {
          [LEGACY_USER_ORDERS_FIELD]: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        })
        writesInBatch += 1
      }

      if (batch && writesInBatch > 0) {
        await batch.commit()
        usersUpdated += writesInBatch
      }

      lastDocument = snapshot.docs[snapshot.docs.length - 1] || null
      if (snapshot.size < batchSize) {
        break
      }
    }

    return {
      field: LEGACY_USER_ORDERS_FIELD,
      scannedUsers,
      usersWithLegacyField,
      usersUpdated,
    }
  }
}

export function createClearOrderHistoryAdminHandler(db: Firestore) {
  return async (
    request: { auth?: { uid?: string | null } | null, data: unknown },
  ): Promise<ClearOrderHistoryAdminOutput> => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = (request.data && typeof request.data === 'object'
      ? request.data as ClearOrderHistoryAdminInput
      : {}) as ClearOrderHistoryAdminInput

    const confirmPhrase = sanitizeString(payload.confirmPhrase)
    if (confirmPhrase !== CLEAR_ORDER_HISTORY_CONFIRM_PHRASE) {
      throw new HttpsError(
        'failed-precondition',
        `confirmPhrase invalida. Use exatamente: ${CLEAR_ORDER_HISTORY_CONFIRM_PHRASE}`,
      )
    }

    const dryRun = sanitizeBoolean(payload.dryRun, false)
    const batchSize = sanitizeCleanupBatchSize(payload.batchSize)

    let scannedOrders = 0
    let deletedOrders = 0
    let deletedOrderEvents = 0
    let deletedOrderNumbers = 0

    let lastOrderId: string | null = null

    for (;;) {
      let ordersQuery = db.collection('orders')
        .orderBy(FieldPath.documentId())
        .limit(batchSize)

      if (lastOrderId) {
        ordersQuery = ordersQuery.startAfter(lastOrderId)
      }

      const ordersSnapshot = await ordersQuery.get()
      if (ordersSnapshot.empty) {
        break
      }

      scannedOrders += ordersSnapshot.size

      for (const orderDoc of ordersSnapshot.docs) {
        const [eventsResult, numbersResult] = await Promise.all([
          deleteQueryDocumentsInChunks({
            db,
            baseQuery: orderDoc.ref.collection('events'),
            batchSize,
            dryRun,
          }),
          deleteQueryDocumentsInChunks({
            db,
            baseQuery: orderDoc.ref.collection('numbers'),
            batchSize,
            dryRun,
          }),
        ])

        deletedOrderEvents += dryRun ? eventsResult.scanned : eventsResult.deleted
        deletedOrderNumbers += dryRun ? numbersResult.scanned : numbersResult.deleted
      }

      if (!dryRun) {
        const batch = db.batch()
        for (const orderDoc of ordersSnapshot.docs) {
          batch.delete(orderDoc.ref)
        }
        await batch.commit()
      }

      deletedOrders += dryRun ? ordersSnapshot.size : ordersSnapshot.size
      lastOrderId = ordersSnapshot.docs[ordersSnapshot.docs.length - 1]?.id || null

      if (ordersSnapshot.size < batchSize) {
        break
      }
    }

    const [paymentsResult, salesLedgerResult, numberChunksResult, numberReservationsResult, salesMetricsDailyResult] = await Promise.all([
      deleteQueryDocumentsInChunks({
        db,
        baseQuery: db.collection('payments'),
        batchSize,
        dryRun,
      }),
      deleteQueryDocumentsInChunks({
        db,
        baseQuery: db.collection('salesLedger'),
        batchSize,
        dryRun,
      }),
      deleteQueryDocumentsInChunks({
        db,
        baseQuery: db.collection('numberChunks'),
        batchSize,
        dryRun,
      }),
      deleteQueryDocumentsInChunks({
        db,
        baseQuery: db.collection('numberReservations'),
        batchSize,
        dryRun,
      }),
      deleteQueryDocumentsInChunks({
        db,
        baseQuery: db.collection('salesMetricsDaily'),
        batchSize,
        dryRun,
      }),
    ])

    let metricsSummaryReset = false
    const metricsSummaryRef = db.collection('metrics').doc('sales_summary')

    if (dryRun) {
      const metricsSummarySnapshot = await metricsSummaryRef.get()
      metricsSummaryReset = metricsSummarySnapshot.exists
    } else {
      await metricsSummaryRef.set(
        {
          totalRevenue: 0,
          paidOrders: 0,
          soldNumbers: 0,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      metricsSummaryReset = true
    }

    return {
      dryRun,
      confirmPhraseRequired: CLEAR_ORDER_HISTORY_CONFIRM_PHRASE,
      scannedOrders,
      deletedOrders,
      deletedOrderEvents,
      deletedOrderNumbers,
      deletedPayments: dryRun ? paymentsResult.scanned : paymentsResult.deleted,
      deletedSalesLedger: dryRun ? salesLedgerResult.scanned : salesLedgerResult.deleted,
      deletedNumberChunks: dryRun ? numberChunksResult.scanned : numberChunksResult.deleted,
      deletedNumberStates: dryRun ? numberChunksResult.scanned : numberChunksResult.deleted,
      deletedNumberReservations: dryRun ? numberReservationsResult.scanned : numberReservationsResult.deleted,
      deletedSalesMetricsDaily: dryRun ? salesMetricsDailyResult.scanned : salesMetricsDailyResult.deleted,
      metricsSummaryReset,
    }
  }
}
