import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID, DEFAULT_TOP_BUYERS_RANKING_LIMIT } from './constants.js'
import { getCampaignDocCached } from './campaignDocCache.js'
import { asRecord, readString, readTimestampMillis, requireActiveUid, sanitizeString } from './shared.js'

interface GetChampionsRankingInput {
  page?: number
}

interface GetWeeklyTopBuyersRankingInput {
  page?: number
}

interface RefreshWeeklyTopBuyersRankingCacheInput {
  forceRebuild?: boolean
}

interface ChampionRankingItem {
  pos: number
  name: string
  cotas: number
  isGold: boolean
}

interface GetChampionsRankingOutput {
  campaignId: string
  updatedAtMs: number
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  items: ChampionRankingItem[]
}

interface GetWeeklyTopBuyersRankingOutput {
  campaignId: string
  updatedAtMs: number
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  items: ChampionRankingItem[]
}

interface RefreshWeeklyTopBuyersRankingCacheOutput extends GetWeeklyTopBuyersRankingOutput {
  sourceDrawId: string | null
  sourceDrawDate: string | null
  updatedBy: 'manual' | 'payment' | 'draw-publication' | 'callable'
}

type RankingCacheEntry = {
  updatedAtMs: number
  expiresAtMs: number
  items: ChampionRankingItem[]
}

type RankingAggregate = {
  cotas: number
  firstPurchaseAtMs: number
}

type TopBuyersRankingWindow = {
  weekId: string
  startMs: number
  endMs: number
  previousCycleEndAtMs: number | null
  sourceDrawId: string | null
  sourceDrawDate: string | null
}

type ChampionsPublicCacheDoc = {
  campaignId: string
  updatedAtMs: number
  items: ChampionRankingItem[]
  dirty: boolean
  rebuiltAtMs: number
  rebuildLockUntilMs: number
}

type WeeklyLiveRankingCacheDoc = {
  campaignId: string
  updatedAtMs: number
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  items: ChampionRankingItem[]
  sourceDrawId: string | null
  sourceDrawDate: string | null
  updatedBy: 'manual' | 'payment' | 'draw-publication' | 'callable'
  dirty: boolean
  rebuiltAtMs: number
  rebuildLockUntilMs: number
}

const MAX_WEEKLY_PUBLIC_RANKING_LIMIT = 50
const PUBLIC_RANKING_PAGE_SIZE = 10
const PUBLIC_RANKING_CACHE_TTL_MS = 60 * 1000
const PUBLIC_RANKING_REBUILD_LOCK_MS = 60 * 1000
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000
const CHAMPIONS_PUBLIC_CACHE_DOC_ID = '_public-champions-ranking'
const WEEKLY_PUBLIC_CACHE_DOC_ID = '_public-weekly-top-buyers-ranking'
const TOP_BUYERS_DRAW_HISTORY_COLLECTION = 'topBuyersDrawResults'
export const CHAMPIONS_RANKING_USERS_COLLECTION = 'championsRankingUsers'

let championsRankingCache: RankingCacheEntry | null = null
let championsRankingInFlight: Promise<RankingCacheEntry> | null = null
let weeklyRankingInFlight: Promise<WeeklyLiveRankingCacheDoc> | null = null

function sanitizePage(value: unknown, fallback = 1) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function sanitizeConfiguredTopBuyersRankingLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TOP_BUYERS_RANKING_LIMIT
  }

  return Math.max(1, Math.min(parsed, MAX_WEEKLY_PUBLIC_RANKING_LIMIT))
}

function readOrderQuantity(data: DocumentData): number {
  const reservedNumbers = data.reservedNumbers

  if (Array.isArray(reservedNumbers)) {
    return reservedNumbers.filter((item) => Number.isInteger(item) && Number(item) > 0).length
  }

  const quantity = Number(data.quantity)
  if (Number.isInteger(quantity) && quantity > 0) {
    return quantity
  }

  return 0
}

function formatPublicName(name: string, uid: string): string {
  const normalized = sanitizeString(name)

  if (!normalized) {
    return `Participante ${uid.slice(-4).toUpperCase()}`
  }

  return normalized
}

function toBrazilLocalDate(sourceMs: number) {
  return new Date(sourceMs + BRAZIL_OFFSET_MS)
}

function formatBrazilDateId(sourceMs: number) {
  const localDate = toBrazilLocalDate(sourceMs)
  const year = localDate.getUTCFullYear()
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(localDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isCacheFresh(updatedAtMs: number, nowMs = Date.now()) {
  return nowMs < updatedAtMs + PUBLIC_RANKING_CACHE_TTL_MS
}

function shouldUseChampionsCache(cache: ChampionsPublicCacheDoc, nowMs = Date.now()) {
  return !cache.dirty && isCacheFresh(cache.updatedAtMs, nowMs)
}

function shouldUseWeeklyCache(cache: WeeklyLiveRankingCacheDoc, window: TopBuyersRankingWindow, nowMs = Date.now()) {
  return (
    cache.weekStartAtMs === window.startMs
    && cache.weekEndAtMs <= nowMs
    && !cache.dirty
    && isCacheFresh(cache.updatedAtMs, nowMs)
  )
}

function toRankingCacheEntry(cache: ChampionsPublicCacheDoc): RankingCacheEntry {
  return {
    updatedAtMs: cache.updatedAtMs,
    expiresAtMs: cache.updatedAtMs + PUBLIC_RANKING_CACHE_TTL_MS,
    items: cache.items,
  }
}

function parseRankingItems(value: unknown, maxItems?: number): ChampionRankingItem[] {
  const rawItems = Array.isArray(value) ? value : []

  const normalizedItems = rawItems
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const pos = Number(item.pos)
      const cotas = Number(item.cotas)
      const name = sanitizeString(item.name)

      return {
        pos: Number.isInteger(pos) && pos > 0 ? pos : 0,
        name: name || 'Participante',
        cotas: Number.isInteger(cotas) && cotas > 0 ? cotas : 0,
        isGold: Number.isInteger(pos) && pos === 1,
      } satisfies ChampionRankingItem
    })
    .filter((item) => item.pos > 0 && item.cotas > 0)
    .sort((left, right) => left.pos - right.pos)

  if (Number.isInteger(maxItems) && Number(maxItems) > 0) {
    return normalizedItems.slice(0, Number(maxItems))
  }

  return normalizedItems
}

function paginateRankingItems(
  items: ChampionRankingItem[],
  requestedPage: number,
): {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    items: ChampionRankingItem[]
  } {
  const totalItems = items.length
  const totalPages = totalItems > 0
    ? Math.ceil(totalItems / PUBLIC_RANKING_PAGE_SIZE)
    : 0
  const page = totalPages > 0
    ? Math.min(Math.max(1, requestedPage), totalPages)
    : 1
  const startIndex = (page - 1) * PUBLIC_RANKING_PAGE_SIZE

  return {
    page,
    pageSize: PUBLIC_RANKING_PAGE_SIZE,
    totalItems,
    totalPages,
    items: totalItems > 0
      ? items.slice(startIndex, startIndex + PUBLIC_RANKING_PAGE_SIZE)
      : [],
  }
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function readFiniteTimestampMs(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

async function readChampionsRankingPage(
  db: Firestore,
  requestedPage: number,
): Promise<GetChampionsRankingOutput> {
  const baseQuery = db.collection(CHAMPIONS_RANKING_USERS_COLLECTION)
    .where('campaignId', '==', CAMPAIGN_DOC_ID)
  const countSnapshot = await baseQuery.count().get()
  const totalItems = Number(countSnapshot.data().count) || 0
  const totalPages = totalItems > 0
    ? Math.ceil(totalItems / PUBLIC_RANKING_PAGE_SIZE)
    : 0
  const page = totalPages > 0
    ? Math.min(Math.max(1, requestedPage), totalPages)
    : 1
  const offset = totalPages > 0
    ? (page - 1) * PUBLIC_RANKING_PAGE_SIZE
    : 0

  if (totalItems <= 0) {
    return {
      campaignId: CAMPAIGN_DOC_ID,
      updatedAtMs: Date.now(),
      page,
      pageSize: PUBLIC_RANKING_PAGE_SIZE,
      totalItems,
      totalPages,
      items: [],
    }
  }

  const rankingSnapshot = await baseQuery
    .orderBy('cotas', 'desc')
    .orderBy('firstPurchaseAtMs', 'asc')
    .orderBy('userId', 'asc')
    .offset(offset)
    .limit(PUBLIC_RANKING_PAGE_SIZE)
    .get()

  const aggregateRows = rankingSnapshot.docs
    .map((document) => {
      const data = document.data()
      const userId = readString(data.userId) || document.id
      const cotas = readPositiveInteger(data.cotas)
      const updatedAtMs = readFiniteTimestampMs(data.updatedAtMs)

      if (!userId || !cotas) {
        return null
      }

      return {
        userId,
        cotas,
        updatedAtMs,
      }
    })
    .filter((item): item is { userId: string; cotas: number; updatedAtMs: number | null } => Boolean(item))

  const userRefs = aggregateRows.map((item) => db.collection('users').doc(item.userId))
  const userSnapshots = userRefs.length > 0 ? await db.getAll(...userRefs) : []
  const userDisplayNamesById = new Map<string, string>()

  for (let index = 0; index < aggregateRows.length; index += 1) {
    const aggregate = aggregateRows[index]
    const userData = userSnapshots[index]?.data() || {}
    const normalizedName = sanitizeString(userData.name) || sanitizeString(userData.displayName)
    userDisplayNamesById.set(aggregate.userId, normalizedName)
  }

  const items: ChampionRankingItem[] = aggregateRows.map((aggregate, index) => {
    const absolutePosition = offset + index + 1
    const name = userDisplayNamesById.get(aggregate.userId) || ''

    return {
      pos: absolutePosition,
      name: formatPublicName(name, aggregate.userId),
      cotas: aggregate.cotas,
      isGold: absolutePosition === 1,
    }
  })

  const updatedAtMs = aggregateRows.reduce((maxMs, item) => {
    if (item.updatedAtMs && item.updatedAtMs > maxMs) {
      return item.updatedAtMs
    }
    return maxMs
  }, 0) || Date.now()

  return {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs,
    page,
    pageSize: PUBLIC_RANKING_PAGE_SIZE,
    totalItems,
    totalPages,
    items,
  }
}

function parseChampionsPublicCacheDoc(data: DocumentData | undefined): ChampionsPublicCacheDoc | null {
  if (!data) {
    return null
  }

  const updatedAtMs = Number(data.updatedAtMs)
  if (!Number.isFinite(updatedAtMs)) {
    return null
  }

  const items = parseRankingItems(data.items)

  return {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs,
    items,
    dirty: data.dirty === true,
    rebuiltAtMs: Number.isFinite(Number(data.rebuiltAtMs)) ? Number(data.rebuiltAtMs) : updatedAtMs,
    rebuildLockUntilMs: Number.isFinite(Number(data.rebuildLockUntilMs)) ? Number(data.rebuildLockUntilMs) : 0,
  }
}

function parseWeeklyLiveRankingCacheDoc(data: DocumentData | undefined): WeeklyLiveRankingCacheDoc | null {
  if (!data) {
    return null
  }

  const weekId = sanitizeString(data.weekId)
  const weekStartAtMs = Number(data.weekStartAtMs)
  const weekEndAtMs = Number(data.weekEndAtMs)
  const updatedAtMs = Number(data.updatedAtMs)

  if (
    !weekId
    || !Number.isFinite(weekStartAtMs)
    || !Number.isFinite(weekEndAtMs)
    || !Number.isFinite(updatedAtMs)
  ) {
    return null
  }

  const items = parseRankingItems(data.items, MAX_WEEKLY_PUBLIC_RANKING_LIMIT)

  return {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs,
    weekId,
    weekStartAtMs,
    weekEndAtMs,
    items,
    sourceDrawId: sanitizeString(data.sourceDrawId) || null,
    sourceDrawDate: sanitizeString(data.sourceDrawDate) || null,
    updatedBy: data.updatedBy === 'manual'
      ? 'manual'
      : data.updatedBy === 'payment'
        ? 'payment'
        : data.updatedBy === 'draw-publication'
          ? 'draw-publication'
          : 'callable',
    dirty: data.dirty === true,
    rebuiltAtMs: Number.isFinite(Number(data.rebuiltAtMs)) ? Number(data.rebuiltAtMs) : updatedAtMs,
    rebuildLockUntilMs: Number.isFinite(Number(data.rebuildLockUntilMs)) ? Number(data.rebuildLockUntilMs) : 0,
  }
}

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem atualizar o ranking semanal.')
  }
}

async function readConfiguredTopBuyersRankingLimit(db: Firestore): Promise<number> {
  const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
  return sanitizeConfiguredTopBuyersRankingLimit(campaignData?.topBuyersRankingLimit)
}

export async function resolveCurrentTopBuyersRankingWindow(
  db: Firestore,
  nowMs = Date.now(),
): Promise<TopBuyersRankingWindow> {
  const latestDrawSnapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
    .orderBy('publishedAtMs', 'desc')
    .limit(1)
    .get()

  const latestDrawData = latestDrawSnapshot.docs[0]?.data() || {}
  const latestWeekEndAtMs = Number(latestDrawData.weekEndAtMs)
  const latestPublishedAtMs = Number(latestDrawData.publishedAtMs)
  const previousCycleEndAtMs = Number.isFinite(latestWeekEndAtMs)
    ? latestWeekEndAtMs
    : Number.isFinite(latestPublishedAtMs)
      ? latestPublishedAtMs
      : null

  const startMs = Number.isFinite(previousCycleEndAtMs)
    ? Math.max(0, Math.floor(Number(previousCycleEndAtMs)) + 1)
    : 0

  return {
    weekId: formatBrazilDateId(nowMs),
    startMs,
    endMs: nowMs,
    previousCycleEndAtMs,
    sourceDrawId: sanitizeString(latestDrawData.drawId) || latestDrawSnapshot.docs[0]?.id || null,
    sourceDrawDate: sanitizeString(latestDrawData.drawDate) || null,
  }
}

async function buildRanking(
  db: Firestore,
  limit: number | null,
  window: { startMs?: number, endMs?: number } = {},
): Promise<ChampionRankingItem[]> {
  const hasWindow = Number.isFinite(window.startMs) && Number.isFinite(window.endMs)
  const startMs = Number(window.startMs)
  const endMs = Number(window.endMs)

  let ordersQuery = db.collection('orders')
    .where('status', '==', 'paid')
    .where('type', '==', 'deposit')
    .where('campaignId', '==', CAMPAIGN_DOC_ID)
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt')

  if (hasWindow) {
    ordersQuery = ordersQuery
      .where('createdAt', '>=', Timestamp.fromMillis(startMs))
      .where('createdAt', '<=', Timestamp.fromMillis(endMs))
  }

  const ordersSnapshot = await ordersQuery.get()
  const totalsByUser = new Map<string, RankingAggregate>()

  for (const document of ordersSnapshot.docs) {
    const data = document.data()
    const userId = readString(data.userId)
    const quantity = readOrderQuantity(data)

    if (!userId || quantity <= 0) {
      continue
    }

    const purchaseAtMs = readTimestampMillis(data.createdAt)
    if (!purchaseAtMs) {
      continue
    }

    if (hasWindow && purchaseAtMs < startMs) {
      continue
    }

    if (hasWindow && purchaseAtMs > endMs) {
      continue
    }

    const previous = totalsByUser.get(userId)
    if (!previous) {
      totalsByUser.set(userId, {
        cotas: quantity,
        firstPurchaseAtMs: purchaseAtMs,
      })
      continue
    }

    totalsByUser.set(userId, {
      cotas: previous.cotas + quantity,
      firstPurchaseAtMs: Math.min(previous.firstPurchaseAtMs, purchaseAtMs),
    })
  }

  const sortedItems = Array.from(totalsByUser.entries())
    .sort((left, right) => {
      if (right[1].cotas !== left[1].cotas) {
        return right[1].cotas - left[1].cotas
      }

      if (left[1].firstPurchaseAtMs !== right[1].firstPurchaseAtMs) {
        return left[1].firstPurchaseAtMs - right[1].firstPurchaseAtMs
      }

      return left[0].localeCompare(right[0])
    })

  const sorted = Number.isInteger(limit) && Number(limit) > 0
    ? sortedItems.slice(0, Number(limit))
    : sortedItems

  const userRefs = sorted.map(([uid]) => db.collection('users').doc(uid))
  const usersSnapshot = userRefs.length > 0 ? await db.getAll(...userRefs) : []

  return sorted.map(([uid, aggregate], index) => {
    const userData = usersSnapshot[index]?.data() || {}
    const name = sanitizeString(userData.name) || sanitizeString(userData.displayName)

    return {
      pos: index + 1,
      name: formatPublicName(name, uid),
      cotas: aggregate.cotas,
      isGold: index === 0,
    } satisfies ChampionRankingItem
  })
}

async function readPublishedChampionsRankingCache(db: Firestore): Promise<ChampionsPublicCacheDoc | null> {
  const snapshot = await db.collection('draws').doc(CHAMPIONS_PUBLIC_CACHE_DOC_ID).get()
  if (!snapshot.exists) {
    return null
  }

  return parseChampionsPublicCacheDoc(snapshot.data() as DocumentData | undefined)
}

async function readPublishedWeeklyLiveRankingCache(db: Firestore): Promise<WeeklyLiveRankingCacheDoc | null> {
  const snapshot = await db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).get()
  if (!snapshot.exists) {
    return null
  }

  return parseWeeklyLiveRankingCacheDoc(snapshot.data() as DocumentData | undefined)
}

async function publishWeeklyLiveRankingCache(
  db: Firestore,
  params: {
    window: TopBuyersRankingWindow
    items: ChampionRankingItem[]
    updatedBy: 'manual' | 'payment' | 'draw-publication' | 'callable'
  },
): Promise<WeeklyLiveRankingCacheDoc> {
  const nowMs = Date.now()
  const cacheDoc: WeeklyLiveRankingCacheDoc = {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs: nowMs,
    weekId: params.window.weekId,
    weekStartAtMs: params.window.startMs,
    weekEndAtMs: params.window.endMs,
    items: params.items,
    sourceDrawId: params.window.sourceDrawId,
    sourceDrawDate: params.window.sourceDrawDate,
    updatedBy: params.updatedBy,
    dirty: false,
    rebuiltAtMs: nowMs,
    rebuildLockUntilMs: 0,
  }

  await db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).set({
    cacheType: 'weeklyTopBuyersRankingLive',
    campaignId: cacheDoc.campaignId,
    updatedAtMs: cacheDoc.updatedAtMs,
    weekId: cacheDoc.weekId,
    weekStartAtMs: cacheDoc.weekStartAtMs,
    weekEndAtMs: cacheDoc.weekEndAtMs,
    items: cacheDoc.items,
    sourceDrawId: cacheDoc.sourceDrawId,
    sourceDrawDate: cacheDoc.sourceDrawDate,
    updatedBy: cacheDoc.updatedBy,
    dirty: false,
    rebuiltAtMs: cacheDoc.rebuiltAtMs,
    rebuildLockUntilMs: 0,
  }, { merge: true })

  return cacheDoc
}

function toWeeklyTopBuyersOutput(
  payload: WeeklyLiveRankingCacheDoc,
  page: number,
  rankingLimit: number,
): GetWeeklyTopBuyersRankingOutput {
  const pagination = paginateRankingItems(payload.items.slice(0, rankingLimit), page)

  return {
    campaignId: payload.campaignId,
    updatedAtMs: payload.updatedAtMs,
    weekId: payload.weekId,
    weekStartAtMs: payload.weekStartAtMs,
    weekEndAtMs: payload.weekEndAtMs,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
    items: pagination.items,
  }
}

function toRefreshWeeklyTopBuyersOutput(
  payload: WeeklyLiveRankingCacheDoc,
  rankingLimit: number,
): RefreshWeeklyTopBuyersRankingCacheOutput {
  const pagination = paginateRankingItems(payload.items.slice(0, rankingLimit), 1)

  return {
    campaignId: payload.campaignId,
    updatedAtMs: payload.updatedAtMs,
    weekId: payload.weekId,
    weekStartAtMs: payload.weekStartAtMs,
    weekEndAtMs: payload.weekEndAtMs,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
    items: pagination.items,
    sourceDrawId: payload.sourceDrawId,
    sourceDrawDate: payload.sourceDrawDate,
    updatedBy: payload.updatedBy,
  }
}

async function publishChampionsRankingCache(db: Firestore, cache: RankingCacheEntry) {
  try {
    await db.collection('draws').doc(CHAMPIONS_PUBLIC_CACHE_DOC_ID).set({
      cacheType: 'championsRanking',
      campaignId: CAMPAIGN_DOC_ID,
      updatedAtMs: cache.updatedAtMs,
      items: cache.items,
      dirty: false,
      rebuiltAtMs: cache.updatedAtMs,
      rebuildLockUntilMs: 0,
    }, { merge: true })
  } catch (error) {
    logger.warn('publishChampionsRankingCache failed', { error: String(error) })
  }
}

async function tryAcquireChampionsRebuildLock(
  db: Firestore,
  nowMs: number,
  forceRebuild = false,
): Promise<{ shouldRebuild: boolean; cached: ChampionsPublicCacheDoc | null }> {
  const cacheRef = db.collection('draws').doc(CHAMPIONS_PUBLIC_CACHE_DOC_ID)

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cacheRef)
    const cached = snapshot.exists
      ? parseChampionsPublicCacheDoc(snapshot.data() as DocumentData | undefined)
      : null

    if (cached && !forceRebuild && shouldUseChampionsCache(cached, nowMs)) {
      return { shouldRebuild: false, cached }
    }

    if (cached && cached.rebuildLockUntilMs > nowMs) {
      return { shouldRebuild: false, cached }
    }

    transaction.set(cacheRef, {
      cacheType: 'championsRanking',
      campaignId: CAMPAIGN_DOC_ID,
      rebuildLockUntilMs: nowMs + PUBLIC_RANKING_REBUILD_LOCK_MS,
    }, { merge: true })

    return { shouldRebuild: true, cached }
  })
}

async function tryAcquireWeeklyRebuildLock(
  db: Firestore,
  nowMs: number,
  window: TopBuyersRankingWindow,
  forceRebuild = false,
): Promise<{ shouldRebuild: boolean; cached: WeeklyLiveRankingCacheDoc | null }> {
  const cacheRef = db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID)

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cacheRef)
    const cached = snapshot.exists
      ? parseWeeklyLiveRankingCacheDoc(snapshot.data() as DocumentData | undefined)
      : null

    if (cached && !forceRebuild && shouldUseWeeklyCache(cached, window, nowMs)) {
      return { shouldRebuild: false, cached }
    }

    if (cached && cached.rebuildLockUntilMs > nowMs) {
      return { shouldRebuild: false, cached }
    }

    transaction.set(cacheRef, {
      cacheType: 'weeklyTopBuyersRankingLive',
      campaignId: CAMPAIGN_DOC_ID,
      rebuildLockUntilMs: nowMs + PUBLIC_RANKING_REBUILD_LOCK_MS,
    }, { merge: true })

    return { shouldRebuild: true, cached }
  })
}

export async function markPublicRankingCachesDirty(
  db: Firestore,
  updatedBy: 'payment' | 'manual' | 'callable' = 'payment',
): Promise<void> {
  const dirtyAtMs = Date.now()

  await Promise.all([
    db.collection('draws').doc(CHAMPIONS_PUBLIC_CACHE_DOC_ID).set({
      cacheType: 'championsRanking',
      campaignId: CAMPAIGN_DOC_ID,
      dirty: true,
      dirtyAtMs,
      updatedBy,
      rebuildLockUntilMs: 0,
    }, { merge: true }),
    db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).set({
      cacheType: 'weeklyTopBuyersRankingLive',
      campaignId: CAMPAIGN_DOC_ID,
      dirty: true,
      dirtyAtMs,
      updatedBy,
      rebuildLockUntilMs: 0,
    }, { merge: true }),
  ])

  if (championsRankingCache) {
    championsRankingCache.expiresAtMs = 0
  }
}

export async function syncChampionsRankingLive(
  db: Firestore,
  options: { forceRebuild?: boolean } = {},
): Promise<RankingCacheEntry> {
  if (championsRankingInFlight) {
    return championsRankingInFlight
  }

  championsRankingInFlight = (async () => {
    const nowMs = Date.now()

    if (!options.forceRebuild) {
      if (championsRankingCache && championsRankingCache.expiresAtMs > nowMs) {
        return championsRankingCache
      }

      const published = await readPublishedChampionsRankingCache(db)
      if (published && shouldUseChampionsCache(published, nowMs)) {
        const cacheEntry = toRankingCacheEntry(published)
        championsRankingCache = cacheEntry
        return cacheEntry
      }
    }

    const lockResult = await tryAcquireChampionsRebuildLock(db, nowMs, options.forceRebuild === true)
    if (!lockResult.shouldRebuild && lockResult.cached) {
      const cacheEntry = toRankingCacheEntry(lockResult.cached)
      championsRankingCache = cacheEntry
      return cacheEntry
    }

    try {
      const items = await buildRanking(db, null)
      const updatedAtMs = Date.now()
      const cacheEntry: RankingCacheEntry = {
        items,
        updatedAtMs,
        expiresAtMs: updatedAtMs + PUBLIC_RANKING_CACHE_TTL_MS,
      }

      championsRankingCache = cacheEntry
      await publishChampionsRankingCache(db, cacheEntry)
      return cacheEntry
    } catch (error) {
      await db.collection('draws').doc(CHAMPIONS_PUBLIC_CACHE_DOC_ID).set({
        dirty: true,
        rebuildLockUntilMs: 0,
      }, { merge: true })
      throw error
    }
  })()

  try {
    return await championsRankingInFlight
  } finally {
    championsRankingInFlight = null
  }
}

export async function syncWeeklyTopBuyersRankingLive(
  db: Firestore,
  options: {
    updatedBy?: 'manual' | 'payment' | 'draw-publication' | 'callable'
    forceRebuild?: boolean
  } = {},
): Promise<WeeklyLiveRankingCacheDoc> {
  if (weeklyRankingInFlight) {
    return weeklyRankingInFlight
  }

  weeklyRankingInFlight = (async () => {
    const nowMs = Date.now()
    const window = await resolveCurrentTopBuyersRankingWindow(db, nowMs)

    if (!options.forceRebuild) {
      const published = await readPublishedWeeklyLiveRankingCache(db)
      if (published && shouldUseWeeklyCache(published, window, nowMs)) {
        return published
      }
    }

    const lockResult = await tryAcquireWeeklyRebuildLock(db, nowMs, window, options.forceRebuild === true)
    if (!lockResult.shouldRebuild && lockResult.cached) {
      return lockResult.cached
    }

    try {
      const items = await buildRanking(db, MAX_WEEKLY_PUBLIC_RANKING_LIMIT, {
        startMs: window.startMs,
        endMs: window.endMs,
      })

      return publishWeeklyLiveRankingCache(db, {
        window,
        items,
        updatedBy: options.updatedBy || 'callable',
      })
    } catch (error) {
      await db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).set({
        dirty: true,
        rebuildLockUntilMs: 0,
      }, { merge: true })
      throw error
    }
  })()

  try {
    return await weeklyRankingInFlight
  } finally {
    weeklyRankingInFlight = null
  }
}

export async function syncWeeklyTopBuyersRankingFromLatestDraw(
  db: Firestore,
  _options: {
    targetWeekId?: string
  } = {},
): Promise<WeeklyLiveRankingCacheDoc> {
  return syncWeeklyTopBuyersRankingLive(db, {
    updatedBy: 'draw-publication',
    forceRebuild: true,
  })
}

export function createGetChampionsRankingHandler(db: Firestore) {
  return async (request: { data: unknown }): Promise<GetChampionsRankingOutput> => {
    const payload = asRecord(request.data) as GetChampionsRankingInput
    const requestedPage = sanitizePage(payload.page, 1)

    try {
      return await readChampionsRankingPage(db, requestedPage)
    } catch (error) {
      logger.error('getChampionsRanking failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o ranking agora.')
    }
  }
}

export function createGetWeeklyTopBuyersRankingHandler(db: Firestore) {
  return async (request: { data: unknown }): Promise<GetWeeklyTopBuyersRankingOutput> => {
    const startedAtMs = Date.now()
    const payload = asRecord(request.data) as GetWeeklyTopBuyersRankingInput
    const requestedPage = sanitizePage(payload.page, 1)

    try {
      const configuredLimit = await readConfiguredTopBuyersRankingLimit(db)
      const nowMs = Date.now()
      const currentWindow = await resolveCurrentTopBuyersRankingWindow(db, nowMs)
      const published = await readPublishedWeeklyLiveRankingCache(db)

      if (published && shouldUseWeeklyCache(published, currentWindow, nowMs)) {
        return toWeeklyTopBuyersOutput(published, requestedPage, configuredLimit)
      }

      const refreshed = await syncWeeklyTopBuyersRankingLive(db, {
        updatedBy: 'callable',
      })
      const output = toWeeklyTopBuyersOutput(refreshed, requestedPage, configuredLimit)

      logger.info('getWeeklyTopBuyersRanking completed', {
        trigger: 'getWeeklyTopBuyersRanking',
        weekId: output.weekId,
        weekStartAtMs: output.weekStartAtMs,
        weekEndAtMs: output.weekEndAtMs,
        itemsCount: output.items.length,
        totalItems: output.totalItems,
        page: output.page,
        totalPages: output.totalPages,
        durationMs: Date.now() - startedAtMs,
      })

      return output
    } catch (error) {
      logger.error('getWeeklyTopBuyersRanking failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o ranking semanal agora.')
    }
  }
}

export function createRefreshWeeklyTopBuyersRankingCacheHandler(db: Firestore) {
  return async (request: {
    auth?: { uid?: string | null } | null
    data?: unknown
  }): Promise<RefreshWeeklyTopBuyersRankingCacheOutput> => {
    const startedAtMs = Date.now()
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = asRecord(request.data) as RefreshWeeklyTopBuyersRankingCacheInput

    try {
      const configuredLimit = await readConfiguredTopBuyersRankingLimit(db)
      const forceRebuild = payload.forceRebuild === true
      const nowMs = Date.now()
      const currentWindow = await resolveCurrentTopBuyersRankingWindow(db, nowMs)
      const published = await readPublishedWeeklyLiveRankingCache(db)

      if (!forceRebuild && published && shouldUseWeeklyCache(published, currentWindow, nowMs)) {
        return toRefreshWeeklyTopBuyersOutput(published, configuredLimit)
      }

      const refreshed = await syncWeeklyTopBuyersRankingLive(db, {
        updatedBy: 'manual',
        forceRebuild,
      })
      const output = toRefreshWeeklyTopBuyersOutput(refreshed, configuredLimit)

      logger.info('refreshWeeklyTopBuyersRankingCache completed', {
        trigger: 'refreshWeeklyTopBuyersRankingCache',
        weekId: output.weekId,
        weekStartAtMs: output.weekStartAtMs,
        weekEndAtMs: output.weekEndAtMs,
        itemsCount: output.items.length,
        totalItems: output.totalItems,
        durationMs: Date.now() - startedAtMs,
      })

      return output
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error('refreshWeeklyTopBuyersRankingCache failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel atualizar o ranking semanal agora.')
    }
  }
}
