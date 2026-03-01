import { type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID } from './constants.js'
import { asRecord, readString, readTimestampMillis, sanitizeString } from './shared.js'

interface GetChampionsRankingInput {
  limit?: number
}

interface GetWeeklyTopBuyersRankingInput {
  limit?: number
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

const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000
const MAX_PUBLIC_RANKING_LIMIT = 50
const RANKING_CACHE_TTL_MS = 3 * 60 * 1000
const MAX_WEEKLY_FALLBACK_LOOKBACK = 8
const CHAMPIONS_PUBLIC_CACHE_DOC_ID = '_public-champions-ranking'
const WEEKLY_PUBLIC_CACHE_DOC_ID = '_public-weekly-top-buyers-ranking'

type RankingCacheEntry = {
  updatedAtMs: number
  expiresAtMs: number
  items: ChampionRankingItem[]
}

let championsRankingCache: RankingCacheEntry | null = null
let championsRankingInFlight: Promise<RankingCacheEntry> | null = null
const weeklyRankingCache = new Map<string, RankingCacheEntry>()
const weeklyRankingInFlight = new Map<string, Promise<RankingCacheEntry>>()

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

type RankingAggregate = {
  cotas: number
  firstPurchaseAtMs: number
}

type RankingWindow = {
  weekId: string
  startMs: number
  endMs: number
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

function shiftRankingWindowByWeeks(baseWindow: RankingWindow, weeksBack: number): RankingWindow {
  const stepMs = 7 * 24 * 60 * 60 * 1000
  const shiftedStartMs = baseWindow.startMs - (weeksBack * stepMs)
  const shiftedEndMs = baseWindow.endMs - (weeksBack * stepMs)

  return {
    weekId: formatBrazilDateId(shiftedStartMs),
    startMs: shiftedStartMs,
    endMs: shiftedEndMs,
  }
}

function isCacheFresh(cache: RankingCacheEntry | null, nowMs: number) {
  return Boolean(cache && cache.expiresAtMs > nowMs)
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

async function publishWeeklyRankingCache(
  db: Firestore,
  rankingWindow: RankingWindow,
  cache: RankingCacheEntry,
) {
  try {
    await db.collection('draws').doc(WEEKLY_PUBLIC_CACHE_DOC_ID).set({
      cacheType: 'weeklyTopBuyersRanking',
      weekId: rankingWindow.weekId,
      weekStartAtMs: rankingWindow.startMs,
      weekEndAtMs: rankingWindow.endMs,
      updatedAtMs: cache.updatedAtMs,
      items: cache.items,
    }, { merge: true })
  } catch (error) {
    logger.warn('publishWeeklyRankingCache failed', { error: String(error) })
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

async function loadWeeklyRankingCached(
  db: Firestore,
  rankingWindow: RankingWindow,
): Promise<RankingCacheEntry> {
  const nowMs = Date.now()
  const cacheKey = rankingWindow.weekId
  const currentCache = weeklyRankingCache.get(cacheKey) || null

  if (isCacheFresh(currentCache, nowMs)) {
    return currentCache as RankingCacheEntry
  }

  const inFlight = weeklyRankingInFlight.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const promise = (async () => {
    const items = await buildRanking(db, MAX_PUBLIC_RANKING_LIMIT, {
      startMs: rankingWindow.startMs,
      endMs: rankingWindow.endMs,
    })
    const updatedAtMs = Date.now()
    const cacheEntry: RankingCacheEntry = {
      items,
      updatedAtMs,
      expiresAtMs: updatedAtMs + RANKING_CACHE_TTL_MS,
    }

    for (const existingKey of weeklyRankingCache.keys()) {
      if (existingKey !== cacheKey) {
        weeklyRankingCache.delete(existingKey)
      }
    }
    weeklyRankingCache.set(cacheKey, cacheEntry)
    return cacheEntry
  })()

  weeklyRankingInFlight.set(cacheKey, promise)

  try {
    return await promise
  } finally {
    weeklyRankingInFlight.delete(cacheKey)
  }
}

async function buildRanking(
  db: Firestore,
  limit: number,
  window: { startMs?: number, endMs?: number } = {},
): Promise<ChampionRankingItem[]> {
  const ordersSnapshot = await db.collection('orders')
    .where('status', '==', 'paid')
    .where('type', '==', 'deposit')
    .where('campaignId', '==', CAMPAIGN_DOC_ID)
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt', 'updatedAt')
    .get()

  const totalsByUser = new Map<string, RankingAggregate>()

  for (const document of ordersSnapshot.docs) {
    const data = document.data()
    const userId = readString(data.userId)
    const quantity = readOrderQuantity(data)

    if (!userId || quantity <= 0) {
      continue
    }

    const createdAtMs = readTimestampMillis(data.createdAt)
    const updatedAtMs = readTimestampMillis(data.updatedAt)
    const purchaseAtMs = createdAtMs || updatedAtMs

    if (!purchaseAtMs) {
      continue
    }

    if (window.startMs && purchaseAtMs < window.startMs) {
      continue
    }

    if (window.endMs && purchaseAtMs > window.endMs) {
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

  const usersSnapshot = await Promise.all(
    sorted.map(([uid]) => db.collection('users').doc(uid).get()),
  )

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
    const rankingWindow = getWeeklyRankingWindow()

    try {
      let selectedWindow = rankingWindow
      let cached = await loadWeeklyRankingCached(db, selectedWindow)

      if (cached.items.length === 0) {
        for (let weeksBack = 1; weeksBack <= MAX_WEEKLY_FALLBACK_LOOKBACK; weeksBack += 1) {
          const fallbackWindow = shiftRankingWindowByWeeks(rankingWindow, weeksBack)
          const fallbackCache = await loadWeeklyRankingCached(db, fallbackWindow)

          if (fallbackCache.items.length > 0) {
            selectedWindow = fallbackWindow
            cached = fallbackCache
            logger.info('getWeeklyTopBuyersRanking using fallback window', {
              currentWeekId: rankingWindow.weekId,
              fallbackWeekId: fallbackWindow.weekId,
              fallbackWeeksBack: weeksBack,
              itemsCount: fallbackCache.items.length,
            })
            break
          }
        }
      }

      await publishWeeklyRankingCache(db, selectedWindow, cached)

      return {
        campaignId: CAMPAIGN_DOC_ID,
        updatedAtMs: cached.updatedAtMs,
        weekId: selectedWindow.weekId,
        weekStartAtMs: selectedWindow.startMs,
        weekEndAtMs: selectedWindow.endMs,
        items: cached.items.slice(0, limit),
      }
    } catch (error) {
      logger.error('getWeeklyTopBuyersRanking failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o ranking semanal agora.')
    }
  }
}
