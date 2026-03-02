import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID } from './constants.js'
import { asRecord, readString, readTimestampMillis, requireActiveUid, sanitizeString } from './shared.js'

interface GetChampionsRankingInput {
  limit?: number
}

interface GetWeeklyTopBuyersRankingInput {
  limit?: number
}

interface RefreshWeeklyTopBuyersRankingCacheInput {
  limit?: number
  allowFallbackToAnyDraw?: boolean
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
  items: ChampionRankingItem[]
}

interface GetWeeklyTopBuyersRankingOutput {
  campaignId: string
  updatedAtMs: number
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  items: ChampionRankingItem[]
}

interface RefreshWeeklyTopBuyersRankingCacheOutput extends GetWeeklyTopBuyersRankingOutput {
  sourceDrawId: string | null
  sourceDrawDate: string | null
  updatedBy: 'friday-auto' | 'manual' | 'bootstrap' | 'live-fallback'
}

const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000
const MAX_PUBLIC_RANKING_LIMIT = 50
const RANKING_CACHE_TTL_MS = 3 * 60 * 1000
const CHAMPIONS_PUBLIC_CACHE_DOC_ID = '_public-champions-ranking'
const WEEKLY_PUBLIC_CACHE_DOC_ID = '_public-weekly-top-buyers-ranking'
const TOP_BUYERS_DRAW_HISTORY_COLLECTION = 'topBuyersDrawResults'
const BRAZIL_FRIDAY_DAY_OF_WEEK = 5


type RankingCacheEntry = {
  updatedAtMs: number
  expiresAtMs: number
  items: ChampionRankingItem[]
}

type WeeklyLiveRankingCacheEntry = RankingCacheEntry & {
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
}

type RankingWindow = {
  weekId: string
  startMs: number
  endMs: number
}

type WeeklyTopBuyersDrawRankingSnapshot = {
  drawId: string
  drawDate: string
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  items: ChampionRankingItem[]
}

type WeeklyFrozenRankingCacheDoc = GetWeeklyTopBuyersRankingOutput & {
  sourceDrawId: string | null
  sourceDrawDate: string | null
  updatedBy: 'friday-auto' | 'manual' | 'bootstrap' | 'live-fallback'
}

type RankingAggregate = {
  cotas: number
  firstPurchaseAtMs: number
}

let championsRankingCache: RankingCacheEntry | null = null
let championsRankingInFlight: Promise<RankingCacheEntry> | null = null
let weeklyLiveRankingCache: WeeklyLiveRankingCacheEntry | null = null
let weeklyLiveRankingInFlight: Promise<WeeklyLiveRankingCacheEntry> | null = null

function sanitizeLimit(value: unknown, max = 10, fallback = 5) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.max(1, Math.min(parsed, max))
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

  const tokens = normalized.split(/\s+/).filter(Boolean)
  const firstName = tokens[0] || normalized
  const secondInitial = tokens[1]?.[0]

  if (secondInitial) {
    return `${firstName} ${secondInitial.toUpperCase()}.`
  }

  if (firstName.length <= 2) {
    return `${firstName[0] || 'P'}*`
  }

  return `${firstName.slice(0, 1).toUpperCase()}${firstName.slice(1).toLowerCase()}`
}

function toBrazilLocalDate(sourceMs: number) {
  return new Date(sourceMs + BRAZIL_OFFSET_MS)
}

function toUtcFromBrazilLocal(sourceMs: number) {
  return sourceMs - BRAZIL_OFFSET_MS
}

function formatBrazilDateId(sourceMs: number) {
  const localDate = toBrazilLocalDate(sourceMs)
  const year = localDate.getUTCFullYear()
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(localDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseBrazilDateIdToUtcMs(dateId: string): number | null {
  const normalized = sanitizeString(dateId)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const localNoonMs = Date.UTC(year, month - 1, day, 12, 0, 0, 0)
  return toUtcFromBrazilLocal(localNoonMs)
}

function getBrazilDayOfWeek(sourceMs = Date.now()) {
  return toBrazilLocalDate(sourceMs).getUTCDay()
}

function isFridayInBrazil(sourceMs = Date.now()) {
  return getBrazilDayOfWeek(sourceMs) === BRAZIL_FRIDAY_DAY_OF_WEEK
}

function isBrazilFridayDateId(dateId: string) {
  const dateMs = parseBrazilDateIdToUtcMs(dateId)
  if (!Number.isFinite(dateMs)) {
    return false
  }

  return getBrazilDayOfWeek(Number(dateMs)) === BRAZIL_FRIDAY_DAY_OF_WEEK
}

function getWeeklyRankingWindow(nowMs = Date.now()): RankingWindow {
  const localNow = toBrazilLocalDate(nowMs)
  const localDayOfWeek = localNow.getUTCDay()
  const localStartOfDayMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    0,
    0,
    0,
    0,
  )
  const localWeekStartMs = localStartOfDayMs - (localDayOfWeek * 24 * 60 * 60 * 1000)
  const localWeekEndMs = localWeekStartMs + (5 * 24 * 60 * 60 * 1000) + (24 * 60 * 60 * 1000 - 1)

  return {
    weekId: formatBrazilDateId(toUtcFromBrazilLocal(localWeekStartMs)),
    startMs: toUtcFromBrazilLocal(localWeekStartMs),
    endMs: toUtcFromBrazilLocal(localWeekEndMs),
  }
}

function isCacheFresh(cache: RankingCacheEntry | null, nowMs: number) {
  return Boolean(cache && cache.expiresAtMs > nowMs)
}

function isWeeklyLiveCacheFresh(cache: WeeklyLiveRankingCacheEntry | null, nowMs: number, rankingWindow: RankingWindow) {
  return Boolean(
    cache
    && cache.expiresAtMs > nowMs
    && cache.weekId === rankingWindow.weekId,
  )
}

function normalizeRankingSnapshotItems(value: unknown): ChampionRankingItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
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
      }
    })
    .filter((item) => item.pos > 0 && item.cotas > 0)
    .sort((left, right) => left.pos - right.pos)
    .slice(0, MAX_PUBLIC_RANKING_LIMIT)
}

function resolveRankingWindowFromDrawData(data: DocumentData, drawDate: string): RankingWindow | null {
  const weekIdRaw = sanitizeString(data.weekId)
  const weekStartAtMs = Number(data.weekStartAtMs)
  const weekEndAtMs = Number(data.weekEndAtMs)

  if (Number.isFinite(weekStartAtMs) && Number.isFinite(weekEndAtMs) && weekEndAtMs >= weekStartAtMs) {
    return {
      weekId: weekIdRaw || formatBrazilDateId(weekStartAtMs),
      startMs: weekStartAtMs,
      endMs: weekEndAtMs,
    }
  }

  const drawDateMs = parseBrazilDateIdToUtcMs(drawDate)
  if (!Number.isFinite(drawDateMs)) {
    return null
  }

  return getWeeklyRankingWindow(Number(drawDateMs))
}

function parseWeeklyFrozenRankingCacheDoc(data: DocumentData | undefined): WeeklyFrozenRankingCacheDoc | null {
  if (!data) {
    return null
  }

  const weekId = sanitizeString(data.weekId)
  const weekStartAtMs = Number(data.weekStartAtMs)
  const weekEndAtMs = Number(data.weekEndAtMs)
  const updatedAtMs = Number(data.updatedAtMs)

  if (!weekId || !Number.isFinite(weekStartAtMs) || !Number.isFinite(weekEndAtMs) || !Number.isFinite(updatedAtMs)) {
    return null
  }

  return {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs,
    weekId,
    weekStartAtMs,
    weekEndAtMs,
    items: normalizeRankingSnapshotItems(data.items),
    sourceDrawId: sanitizeString(data.sourceDrawId) || null,
    sourceDrawDate: sanitizeString(data.sourceDrawDate) || null,
    updatedBy: data.updatedBy === 'friday-auto'
      ? 'friday-auto'
      : data.updatedBy === 'manual'
        ? 'manual'
        : data.updatedBy === 'bootstrap'
          ? 'bootstrap'
          : 'live-fallback',
  }
}

async function readPublishedWeeklyFrozenRankingCache(db: Firestore): Promise<WeeklyFrozenRankingCacheDoc | null> {
  const snapshot = await db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).get()
  if (!snapshot.exists) {
    return null
  }

  return parseWeeklyFrozenRankingCacheDoc(snapshot.data() as DocumentData | undefined)
}

async function readLatestTopBuyersDrawRankingSnapshot(
  db: Firestore,
  options?: {
    fridayOnly?: boolean
    maxDocs?: number
  },
): Promise<WeeklyTopBuyersDrawRankingSnapshot | null> {
  const fridayOnly = options?.fridayOnly === true
  const maxDocs = Number.isInteger(options?.maxDocs) && Number(options?.maxDocs) > 0
    ? Number(options?.maxDocs)
    : 80

  const snapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
    .orderBy('publishedAtMs', 'desc')
    .limit(maxDocs)
    .get()

  for (const document of snapshot.docs) {
    const data = document.data() as DocumentData
    const drawDate = sanitizeString(data.drawDate)
    if (!drawDate) {
      continue
    }

    if (fridayOnly && !isBrazilFridayDateId(drawDate)) {
      continue
    }

    const items = normalizeRankingSnapshotItems(data.rankingSnapshot)
    if (items.length === 0) {
      continue
    }

    const window = resolveRankingWindowFromDrawData(data, drawDate)
    if (!window) {
      continue
    }

    const drawId = sanitizeString(data.drawId) || document.id

    return {
      drawId,
      drawDate,
      weekId: window.weekId,
      weekStartAtMs: window.startMs,
      weekEndAtMs: window.endMs,
      items,
    }
  }

  return null
}

async function publishChampionsRankingCache(db: Firestore, cache: RankingCacheEntry) {
  try {
    await db.collection('draws').doc(CHAMPIONS_PUBLIC_CACHE_DOC_ID).set({
      cacheType: 'championsRanking',
      updatedAtMs: cache.updatedAtMs,
      items: cache.items,
    }, { merge: true })
  } catch (error) {
    logger.warn('publishChampionsRankingCache failed', { error: String(error) })
  }
}

async function publishWeeklyFrozenRankingCache(
  db: Firestore,
  params: {
    ranking: WeeklyTopBuyersDrawRankingSnapshot
    updatedAtMs: number
    updatedBy: 'friday-auto' | 'manual' | 'bootstrap' | 'live-fallback'
  },
): Promise<WeeklyFrozenRankingCacheDoc> {
  const cacheDoc: WeeklyFrozenRankingCacheDoc = {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs: params.updatedAtMs,
    weekId: params.ranking.weekId,
    weekStartAtMs: params.ranking.weekStartAtMs,
    weekEndAtMs: params.ranking.weekEndAtMs,
    items: params.ranking.items,
    sourceDrawId: params.ranking.drawId,
    sourceDrawDate: params.ranking.drawDate,
    updatedBy: params.updatedBy,
  }

  await db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).set({
    cacheType: 'weeklyTopBuyersRankingFrozen',
    frozenMode: true,
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs: cacheDoc.updatedAtMs,
    weekId: cacheDoc.weekId,
    weekStartAtMs: cacheDoc.weekStartAtMs,
    weekEndAtMs: cacheDoc.weekEndAtMs,
    items: cacheDoc.items,
    sourceDrawId: cacheDoc.sourceDrawId,
    sourceDrawDate: cacheDoc.sourceDrawDate,
    updatedBy: cacheDoc.updatedBy,
  }, { merge: true })

  return cacheDoc
}

async function refreshWeeklyFrozenRankingFromDraw(
  db: Firestore,
  options: {
    updatedBy: 'friday-auto' | 'manual' | 'bootstrap'
    fridayOnly: boolean
    allowFallbackToAnyDraw?: boolean
  },
): Promise<WeeklyFrozenRankingCacheDoc | null> {
  let source = await readLatestTopBuyersDrawRankingSnapshot(db, {
    fridayOnly: options.fridayOnly,
  })

  if (!source && options.allowFallbackToAnyDraw) {
    source = await readLatestTopBuyersDrawRankingSnapshot(db, {
      fridayOnly: false,
    })
  }

  if (!source) {
    return null
  }

  return publishWeeklyFrozenRankingCache(db, {
    ranking: source,
    updatedAtMs: Date.now(),
    updatedBy: options.updatedBy,
  })
}

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem atualizar o ranking semanal.')
  }
}

async function loadChampionsRankingCached(db: Firestore): Promise<RankingCacheEntry> {
  const nowMs = Date.now()
  if (isCacheFresh(championsRankingCache, nowMs)) {
    return championsRankingCache as RankingCacheEntry
  }

  if (championsRankingInFlight) {
    return championsRankingInFlight
  }

  championsRankingInFlight = (async () => {
    const items = await buildRanking(db, MAX_PUBLIC_RANKING_LIMIT)
    const updatedAtMs = Date.now()
    const cacheEntry: RankingCacheEntry = {
      items,
      updatedAtMs,
      expiresAtMs: updatedAtMs + RANKING_CACHE_TTL_MS,
    }
    championsRankingCache = cacheEntry
    return cacheEntry
  })()

  try {
    return await championsRankingInFlight
  } finally {
    championsRankingInFlight = null
  }
}

async function loadWeeklyLiveRankingCached(
  db: Firestore,
  rankingWindow: RankingWindow,
): Promise<WeeklyLiveRankingCacheEntry> {
  const nowMs = Date.now()

  if (isWeeklyLiveCacheFresh(weeklyLiveRankingCache, nowMs, rankingWindow)) {
    return weeklyLiveRankingCache as WeeklyLiveRankingCacheEntry
  }

  if (weeklyLiveRankingInFlight) {
    return weeklyLiveRankingInFlight
  }

  weeklyLiveRankingInFlight = (async () => {
    const items = await buildRanking(db, MAX_PUBLIC_RANKING_LIMIT, {
      startMs: rankingWindow.startMs,
      endMs: rankingWindow.endMs,
    })
    const updatedAtMs = Date.now()
    const cacheEntry: WeeklyLiveRankingCacheEntry = {
      weekId: rankingWindow.weekId,
      weekStartAtMs: rankingWindow.startMs,
      weekEndAtMs: rankingWindow.endMs,
      items,
      updatedAtMs,
      expiresAtMs: updatedAtMs + RANKING_CACHE_TTL_MS,
    }

    weeklyLiveRankingCache = cacheEntry
    return cacheEntry
  })()

  try {
    return await weeklyLiveRankingInFlight
  } finally {
    weeklyLiveRankingInFlight = null
  }
}

async function buildRanking(
  db: Firestore,
  limit: number,
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

  const sorted = Array.from(totalsByUser.entries())
    .sort((left, right) => {
      if (right[1].cotas !== left[1].cotas) {
        return right[1].cotas - left[1].cotas
      }

      if (left[1].firstPurchaseAtMs !== right[1].firstPurchaseAtMs) {
        return left[1].firstPurchaseAtMs - right[1].firstPurchaseAtMs
      }

      return left[0].localeCompare(right[0])
    })
    .slice(0, limit)

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
    }
  })
}

function toWeeklyTopBuyersOutput(payload: WeeklyFrozenRankingCacheDoc, limit: number): GetWeeklyTopBuyersRankingOutput {
  return {
    campaignId: payload.campaignId,
    updatedAtMs: payload.updatedAtMs,
    weekId: payload.weekId,
    weekStartAtMs: payload.weekStartAtMs,
    weekEndAtMs: payload.weekEndAtMs,
    items: payload.items.slice(0, limit),
  }
}

function toRefreshWeeklyTopBuyersOutput(
  payload: WeeklyFrozenRankingCacheDoc,
  limit: number,
): RefreshWeeklyTopBuyersRankingCacheOutput {
  return {
    campaignId: payload.campaignId,
    updatedAtMs: payload.updatedAtMs,
    weekId: payload.weekId,
    weekStartAtMs: payload.weekStartAtMs,
    weekEndAtMs: payload.weekEndAtMs,
    items: payload.items.slice(0, limit),
    sourceDrawId: payload.sourceDrawId,
    sourceDrawDate: payload.sourceDrawDate,
    updatedBy: payload.updatedBy,
  }
}

export function createGetChampionsRankingHandler(db: Firestore) {
  return async (request: { data: unknown }): Promise<GetChampionsRankingOutput> => {
    const payload = asRecord(request.data) as GetChampionsRankingInput
    const limit = sanitizeLimit(payload.limit, MAX_PUBLIC_RANKING_LIMIT, 5)

    try {
      const cached = await loadChampionsRankingCached(db)
      await publishChampionsRankingCache(db, cached)

      return {
        campaignId: CAMPAIGN_DOC_ID,
        updatedAtMs: cached.updatedAtMs,
        items: cached.items.slice(0, limit),
      }
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
    const payload = asRecord(request.data) as GetWeeklyTopBuyersRankingInput
    const limit = sanitizeLimit(payload.limit, MAX_PUBLIC_RANKING_LIMIT, MAX_PUBLIC_RANKING_LIMIT)
    const nowMs = Date.now()
    const currentWindow = getWeeklyRankingWindow(nowMs)

    try {
      const published = await readPublishedWeeklyFrozenRankingCache(db)

      if (isFridayInBrazil(nowMs)) {
        const refreshed = await refreshWeeklyFrozenRankingFromDraw(db, {
          updatedBy: 'friday-auto',
          fridayOnly: true,
          allowFallbackToAnyDraw: false,
        })

        if (refreshed) {
          return toWeeklyTopBuyersOutput(refreshed, limit)
        }
      }

      if (published && published.items.length > 0) {
        return toWeeklyTopBuyersOutput(published, limit)
      }

      const bootstrapped = await refreshWeeklyFrozenRankingFromDraw(db, {
        updatedBy: 'bootstrap',
        fridayOnly: true,
        allowFallbackToAnyDraw: true,
      })

      if (bootstrapped) {
        return toWeeklyTopBuyersOutput(bootstrapped, limit)
      }

      const liveFallback = await loadWeeklyLiveRankingCached(db, currentWindow)
      const liveCacheDoc = await publishWeeklyFrozenRankingCache(db, {
        ranking: {
          drawId: 'live-fallback',
          drawDate: '',
          weekId: currentWindow.weekId,
          weekStartAtMs: currentWindow.startMs,
          weekEndAtMs: currentWindow.endMs,
          items: liveFallback.items,
        },
        updatedAtMs: liveFallback.updatedAtMs,
        updatedBy: 'live-fallback',
      })

      return toWeeklyTopBuyersOutput(liveCacheDoc, limit)
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
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    const payload = asRecord(request.data) as RefreshWeeklyTopBuyersRankingCacheInput
    const limit = sanitizeLimit(payload.limit, MAX_PUBLIC_RANKING_LIMIT, MAX_PUBLIC_RANKING_LIMIT)
    const allowFallbackToAnyDraw = payload.allowFallbackToAnyDraw === true

    try {
      const refreshed = await refreshWeeklyFrozenRankingFromDraw(db, {
        updatedBy: 'manual',
        fridayOnly: false,
        allowFallbackToAnyDraw,
      })

      if (!refreshed) {
        throw new HttpsError(
          'failed-precondition',
          'Nenhum snapshot de draw encontrado no banco para atualizar o ranking semanal.',
        )
      }

      return toRefreshWeeklyTopBuyersOutput(refreshed, limit)
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
