import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID, DEFAULT_TOP_BUYERS_RANKING_LIMIT } from './constants.js'
import { getCampaignDocCached } from './campaignDocCache.js'
import { asRecord, readString, readTimestampMillis, requireActiveUid, sanitizeString } from './shared.js'

interface GetChampionsRankingInput {
  limit?: number
}

interface GetWeeklyTopBuyersRankingInput {
  limit?: number
}

interface RefreshWeeklyTopBuyersRankingCacheInput {
  limit?: number
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

type WeeklyLiveRankingCacheDoc = GetWeeklyTopBuyersRankingOutput & {
  sourceDrawId: string | null
  sourceDrawDate: string | null
  updatedBy: 'manual' | 'payment' | 'draw-publication' | 'callable'
}

const MAX_PUBLIC_RANKING_LIMIT = 50
const CHAMPIONS_CACHE_TTL_MS = 20 * 1000
const WEEKLY_CACHE_TTL_MS = 20 * 1000
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000
const CHAMPIONS_PUBLIC_CACHE_DOC_ID = '_public-champions-ranking'
const WEEKLY_PUBLIC_CACHE_DOC_ID = '_public-weekly-top-buyers-ranking'
const TOP_BUYERS_DRAW_HISTORY_COLLECTION = 'topBuyersDrawResults'

let championsRankingCache: RankingCacheEntry | null = null
let championsRankingInFlight: Promise<RankingCacheEntry> | null = null
let weeklyRankingInFlight: Promise<WeeklyLiveRankingCacheDoc> | null = null

function sanitizeLimit(value: unknown, max = 10, fallback = 5) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.max(1, Math.min(parsed, max))
}

function sanitizeConfiguredTopBuyersRankingLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TOP_BUYERS_RANKING_LIMIT
  }

  return Math.max(1, Math.min(parsed, MAX_PUBLIC_RANKING_LIMIT))
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

  const itemsRaw = Array.isArray(data.items) ? data.items : []
  const items = itemsRaw
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
  }
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
  const cacheDoc: WeeklyLiveRankingCacheDoc = {
    campaignId: CAMPAIGN_DOC_ID,
    updatedAtMs: Date.now(),
    weekId: params.window.weekId,
    weekStartAtMs: params.window.startMs,
    weekEndAtMs: params.window.endMs,
    items: params.items,
    sourceDrawId: params.window.sourceDrawId,
    sourceDrawDate: params.window.sourceDrawDate,
    updatedBy: params.updatedBy,
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
  }, { merge: true })

  return cacheDoc
}

function toWeeklyTopBuyersOutput(payload: WeeklyLiveRankingCacheDoc, limit: number): GetWeeklyTopBuyersRankingOutput {
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
  payload: WeeklyLiveRankingCacheDoc,
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

function isCacheFresh(updatedAtMs: number, nowMs = Date.now()) {
  return nowMs < updatedAtMs + WEEKLY_CACHE_TTL_MS
}

async function rebuildWeeklyRankingLive(
  db: Firestore,
  options: {
    updatedBy: 'manual' | 'payment' | 'draw-publication' | 'callable'
    nowMs?: number
  },
): Promise<WeeklyLiveRankingCacheDoc> {
  const nowMs = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now()
  const window = await resolveCurrentTopBuyersRankingWindow(db, nowMs)
  const items = await buildRanking(db, MAX_PUBLIC_RANKING_LIMIT, {
    startMs: window.startMs,
    endMs: window.endMs,
  })

  return publishWeeklyLiveRankingCache(db, {
    window,
    items,
    updatedBy: options.updatedBy,
  })
}

export async function syncWeeklyTopBuyersRankingLive(
  db: Firestore,
  options: {
    updatedBy?: 'manual' | 'payment' | 'draw-publication' | 'callable'
  } = {},
): Promise<WeeklyLiveRankingCacheDoc> {
  if (weeklyRankingInFlight) {
    return weeklyRankingInFlight
  }

  weeklyRankingInFlight = rebuildWeeklyRankingLive(db, {
    updatedBy: options.updatedBy || 'callable',
  })

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
  })
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

async function loadChampionsRankingCached(db: Firestore): Promise<RankingCacheEntry> {
  const nowMs = Date.now()
  if (championsRankingCache && championsRankingCache.expiresAtMs > nowMs) {
    return championsRankingCache
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
      expiresAtMs: updatedAtMs + CHAMPIONS_CACHE_TTL_MS,
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

export async function syncChampionsRankingLive(db: Firestore): Promise<RankingCacheEntry> {
  if (championsRankingInFlight) {
    return championsRankingInFlight
  }

  championsRankingInFlight = (async () => {
    const items = await buildRanking(db, MAX_PUBLIC_RANKING_LIMIT)
    const updatedAtMs = Date.now()
    const cacheEntry: RankingCacheEntry = {
      items,
      updatedAtMs,
      expiresAtMs: updatedAtMs + CHAMPIONS_CACHE_TTL_MS,
    }

    championsRankingCache = cacheEntry
    await publishChampionsRankingCache(db, cacheEntry)
    return cacheEntry
  })()

  try {
    return await championsRankingInFlight
  } finally {
    championsRankingInFlight = null
  }
}

export function createGetChampionsRankingHandler(db: Firestore) {
  return async (request: { data: unknown }): Promise<GetChampionsRankingOutput> => {
    const payload = asRecord(request.data) as GetChampionsRankingInput
    const limit = sanitizeLimit(payload.limit, MAX_PUBLIC_RANKING_LIMIT, 5)

    try {
      let cached = await loadChampionsRankingCached(db)

      // Evita prender o frontend em cache vazio quando existem novas compras pagas.
      if (cached.items.length === 0) {
        cached = await syncChampionsRankingLive(db)
      } else {
        await publishChampionsRankingCache(db, cached)
      }

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
    const startedAtMs = Date.now()
    const payload = asRecord(request.data) as GetWeeklyTopBuyersRankingInput

    try {
      const configuredLimit = await readConfiguredTopBuyersRankingLimit(db)
      const requestedLimit = sanitizeLimit(payload.limit, MAX_PUBLIC_RANKING_LIMIT, configuredLimit)
      const nowMs = Date.now()
      const currentWindow = await resolveCurrentTopBuyersRankingWindow(db, nowMs)
      const published = await readPublishedWeeklyLiveRankingCache(db)

      if (
        published
        && published.weekStartAtMs === currentWindow.startMs
        && published.weekEndAtMs <= nowMs
        && isCacheFresh(published.updatedAtMs, nowMs)
      ) {
        return toWeeklyTopBuyersOutput(published, requestedLimit)
      }

      const refreshed = await syncWeeklyTopBuyersRankingLive(db, {
        updatedBy: 'callable',
      })
      const output = toWeeklyTopBuyersOutput(refreshed, requestedLimit)

      logger.info('getWeeklyTopBuyersRanking completed', {
        trigger: 'getWeeklyTopBuyersRanking',
        weekId: output.weekId,
        weekStartAtMs: output.weekStartAtMs,
        weekEndAtMs: output.weekEndAtMs,
        itemsCount: output.items.length,
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
      const requestedLimit = sanitizeLimit(payload.limit, MAX_PUBLIC_RANKING_LIMIT, configuredLimit)
      const forceRebuild = payload.forceRebuild === true
      const nowMs = Date.now()
      const currentWindow = await resolveCurrentTopBuyersRankingWindow(db, nowMs)
      const published = await readPublishedWeeklyLiveRankingCache(db)

      if (
        !forceRebuild
        && published
        && published.weekStartAtMs === currentWindow.startMs
        && published.weekEndAtMs <= nowMs
        && isCacheFresh(published.updatedAtMs, nowMs)
      ) {
        return toRefreshWeeklyTopBuyersOutput(published, requestedLimit)
      }

      const refreshed = await syncWeeklyTopBuyersRankingLive(db, {
        updatedBy: 'manual',
      })
      const output = toRefreshWeeklyTopBuyersOutput(refreshed, requestedLimit)

      logger.info('refreshWeeklyTopBuyersRankingCache completed', {
        trigger: 'refreshWeeklyTopBuyersRankingCache',
        weekId: output.weekId,
        weekStartAtMs: output.weekStartAtMs,
        weekEndAtMs: output.weekEndAtMs,
        itemsCount: output.items.length,
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
