import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID } from './constants.js'
import { asRecord, readString, readTimestampMillis, sanitizeString } from './shared.js'

const TOP_BUYERS_DRAW_HISTORY_COLLECTION = 'topBuyersDrawResults'
const DEFAULT_RANKING_LIMIT = 50
const MAX_RANKING_LIMIT = 50
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000

interface PublishTopBuyersDrawInput {
  lotteryNumber?: number | string
  rankingLimit?: number
}

interface TopBuyersRankingItem {
  pos: number
  userId: string
  name: string
  cotas: number
  firstPurchaseAtMs: number
}

interface TopBuyersDrawWinner {
  userId: string
  name: string
  cotas: number
  pos: number
}

interface TopBuyersDrawResult {
  campaignId: string
  drawId: string
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  lotteryNumber: number
  requestedRankingLimit: number
  participantCount: number
  winningPosition: number
  winner: TopBuyersDrawWinner
  rankingSnapshot: TopBuyersRankingItem[]
  publishedAtMs: number
}

interface GetLatestTopBuyersDrawOutput {
  hasResult: boolean
  result: TopBuyersDrawResult | null
}

type RankingWindow = {
  weekId: string
  startMs: number
  endMs: number
}

function sanitizeRankingLimit(value: unknown): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_RANKING_LIMIT
  }

  return Math.max(1, Math.min(parsed, MAX_RANKING_LIMIT))
}

function sanitizeLotteryNumber(value: unknown): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpsError('invalid-argument', 'Informe um numero inteiro valido da Loteria Federal.')
  }

  return parsed
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

function calculateWinningPosition(lotteryNumber: number, participantCount: number): number {
  const modulo = lotteryNumber % participantCount
  if (modulo === 0) {
    return participantCount
  }
  return modulo
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

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem publicar o resultado.')
  }
}

async function buildRankingSnapshot(
  db: Firestore,
  rankingLimit: number,
  rankingWindow: RankingWindow,
): Promise<TopBuyersRankingItem[]> {
  const ordersSnapshot = await db.collection('orders')
    .where('status', '==', 'paid')
    .where('type', '==', 'deposit')
    .where('campaignId', '==', CAMPAIGN_DOC_ID)
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt', 'updatedAt')
    .get()

  const totalsByUser = new Map<string, { cotas: number, firstPurchaseAtMs: number }>()

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

    if (purchaseAtMs < rankingWindow.startMs || purchaseAtMs > rankingWindow.endMs) {
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
    .slice(0, rankingLimit)

  if (sorted.length === 0) {
    return []
  }

  const usersSnapshot = await Promise.all(
    sorted.map(([uid]) => db.collection('users').doc(uid).get()),
  )

  return sorted.map(([uid, aggregate], index) => {
    const userData = usersSnapshot[index]?.data() || {}
    const rawName = sanitizeString(userData.name) || sanitizeString(userData.displayName)

    return {
      pos: index + 1,
      userId: uid,
      name: formatPublicName(rawName, uid),
      cotas: aggregate.cotas,
      firstPurchaseAtMs: aggregate.firstPurchaseAtMs,
    }
  })
}

export function createPublishTopBuyersDrawHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<TopBuyersDrawResult> => {
    const uid = sanitizeString(request.auth?.uid)
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticacao obrigatoria para publicar resultado.')
    }

    await assertAdminRole(db, uid)

    const payload = asRecord(request.data) as PublishTopBuyersDrawInput
    const lotteryNumber = sanitizeLotteryNumber(payload.lotteryNumber)
    const rankingLimit = sanitizeRankingLimit(payload.rankingLimit)
    const rankingWindow = getWeeklyRankingWindow()

    try {
      const rankingSnapshot = await buildRankingSnapshot(db, rankingLimit, rankingWindow)
      if (rankingSnapshot.length === 0) {
        throw new HttpsError('failed-precondition', 'Ainda nao ha participantes elegiveis para sorteio.')
      }

      const participantCount = rankingSnapshot.length
      const winningPosition = calculateWinningPosition(lotteryNumber, participantCount)
      const winner = rankingSnapshot[winningPosition - 1]

      if (!winner) {
        throw new HttpsError('internal', 'Nao foi possivel identificar o ganhador.')
      }

      const drawRef = db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION).doc()
      const publishedAtMs = Date.now()

      const result: TopBuyersDrawResult = {
        campaignId: CAMPAIGN_DOC_ID,
        drawId: drawRef.id,
        weekId: rankingWindow.weekId,
        weekStartAtMs: rankingWindow.startMs,
        weekEndAtMs: rankingWindow.endMs,
        lotteryNumber,
        requestedRankingLimit: rankingLimit,
        participantCount,
        winningPosition,
        winner: {
          userId: winner.userId,
          name: winner.name,
          cotas: winner.cotas,
          pos: winner.pos,
        },
        rankingSnapshot,
        publishedAtMs,
      }

      const batch = db.batch()

      batch.set(drawRef, {
        ...result,
        publishedByUid: uid,
        publishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      batch.set(
        db.collection('campaigns').doc(CAMPAIGN_DOC_ID),
        {
          latestTopBuyersDraw: {
            ...result,
            publishedByUid: uid,
            publishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      await batch.commit()

      return result
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      logger.error('publishTopBuyersDraw failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel publicar o resultado agora.')
    }
  }
}

export function createGetLatestTopBuyersDrawHandler(db: Firestore) {
  return async (): Promise<GetLatestTopBuyersDrawOutput> => {
    try {
      const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
      const rawResult = asRecord(campaignSnapshot.get('latestTopBuyersDraw'))

      const drawId = sanitizeString(rawResult.drawId)
      const weekId = sanitizeString(rawResult.weekId)
      const weekStartAtMs = Number(rawResult.weekStartAtMs)
      const weekEndAtMs = Number(rawResult.weekEndAtMs)
      const lotteryNumber = Number(rawResult.lotteryNumber)
      const requestedRankingLimit = Number(rawResult.requestedRankingLimit)
      const participantCount = Number(rawResult.participantCount)
      const winningPosition = Number(rawResult.winningPosition)
      const publishedAtMs = Number(rawResult.publishedAtMs)
      const winnerRecord = asRecord(rawResult.winner)

      if (
        !drawId ||
        !weekId ||
        !Number.isFinite(weekStartAtMs) ||
        !Number.isFinite(weekEndAtMs) ||
        !Number.isInteger(lotteryNumber) ||
        lotteryNumber <= 0 ||
        !Number.isInteger(requestedRankingLimit) ||
        requestedRankingLimit <= 0 ||
        !Number.isInteger(participantCount) ||
        participantCount <= 0 ||
        !Number.isInteger(winningPosition) ||
        winningPosition <= 0 ||
        !Number.isFinite(publishedAtMs)
      ) {
        return {
          hasResult: false,
          result: null,
        }
      }

      const winner: TopBuyersDrawWinner = {
        userId: sanitizeString(winnerRecord.userId),
        name: sanitizeString(winnerRecord.name) || 'Participante',
        cotas: Number(winnerRecord.cotas) || 0,
        pos: Number(winnerRecord.pos) || winningPosition,
      }

      const rankingSnapshot = Array.isArray(rawResult.rankingSnapshot)
        ? rawResult.rankingSnapshot
          .map((item) => asRecord(item))
          .map((item) => ({
            pos: Number(item.pos),
            userId: sanitizeString(item.userId),
            name: sanitizeString(item.name),
            cotas: Number(item.cotas),
            firstPurchaseAtMs: Number(item.firstPurchaseAtMs),
          }))
          .filter((item) => Number.isInteger(item.pos) && item.pos > 0 && item.userId && Number.isInteger(item.cotas) && item.cotas > 0)
        : []

      return {
        hasResult: true,
        result: {
          campaignId: CAMPAIGN_DOC_ID,
          drawId,
          weekId,
          weekStartAtMs,
          weekEndAtMs,
          lotteryNumber,
          requestedRankingLimit,
          participantCount,
          winningPosition,
          winner,
          rankingSnapshot,
          publishedAtMs,
        },
      }
    } catch (error) {
      logger.error('getLatestTopBuyersDraw failed', {
        error: String(error),
      })

      throw new HttpsError('internal', 'Nao foi possivel carregar o resultado publicado.')
    }
  }
}
