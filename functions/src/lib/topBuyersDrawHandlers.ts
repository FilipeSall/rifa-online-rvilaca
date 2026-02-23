import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID, DEFAULT_MAIN_PRIZE } from './constants.js'
import { asRecord, readString, readTimestampMillis, sanitizeString } from './shared.js'

const TOP_BUYERS_DRAW_HISTORY_COLLECTION = 'topBuyersDrawResults'
const DEFAULT_RANKING_LIMIT = 50
const MAX_RANKING_LIMIT = 50
const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000
const EXTRACTION_COUNT = 5
const EXTRACTION_DIGITS = 6
const MAX_EXTRACTION_VALUE = 999999

interface PublishTopBuyersDrawInput {
  extractionNumbers?: Array<number | string>
  rankingLimit?: number
  drawPrize?: string
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

interface ExtractionAttempt {
  extractionIndex: number
  extractionNumber: string
  comparisonDigits: number
  candidateCode: string
  matchedPosition: number | null
}

interface TopBuyersDrawResult {
  campaignId: string
  drawId: string
  drawDate: string
  drawPrize: string
  weekId: string
  weekStartAtMs: number
  weekEndAtMs: number
  requestedRankingLimit: number
  participantCount: number
  comparisonDigits: number
  extractionNumbers: string[]
  attempts: ExtractionAttempt[]
  winningPosition: number
  winningCode: string
  resolvedBy: 'federal_extraction' | 'redundancy'
  winner: TopBuyersDrawWinner
  winnerTicketNumbers: string[]
  rankingSnapshot: TopBuyersRankingItem[]
  publishedAtMs: number
}

interface GetLatestTopBuyersDrawOutput {
  hasResult: boolean
  result: TopBuyersDrawResult | null
}

interface GetTopBuyersDrawHistoryOutput {
  results: TopBuyersDrawResult[]
}

interface GetPublicTopBuyersDrawHistoryOutput {
  results: TopBuyersDrawResult[]
}

interface GetMyTopBuyersWinningSummaryOutput {
  hasWins: boolean
  winsCount: number
  latestWin: {
    drawId: string
    drawDate: string
    drawPrize: string
    publishedAtMs: number
  } | null
}

type RankingWindow = {
  weekId: string
  startMs: number
  endMs: number
}

type RankingBuildOutput = {
  rankingSnapshot: TopBuyersRankingItem[]
  winnerTicketNumbersByUser: Map<string, string[]>
}

function sanitizeRankingLimit(value: unknown): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_RANKING_LIMIT
  }

  return Math.max(1, Math.min(parsed, MAX_RANKING_LIMIT))
}

function sanitizeExtractionNumber(value: unknown, index: number): string {
  const raw = String(value ?? '').replace(/\D/g, '')
  if (!raw) {
    throw new HttpsError('invalid-argument', `Extracao ${index + 1} invalida.`)
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_EXTRACTION_VALUE) {
    throw new HttpsError('invalid-argument', `Extracao ${index + 1} fora da faixa 000000-999999.`)
  }

  return String(parsed).padStart(EXTRACTION_DIGITS, '0')
}

function sanitizeExtractionNumbers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== EXTRACTION_COUNT) {
    throw new HttpsError('invalid-argument', 'Informe exatamente 5 extracoes da Loteria Federal.')
  }

  return value.map((item, index) => sanitizeExtractionNumber(item, index))
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

function readOrderNumbers(data: DocumentData): number[] {
  const reservedNumbers = data.reservedNumbers
  if (!Array.isArray(reservedNumbers)) {
    return []
  }

  return Array.from(new Set(
    reservedNumbers
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )).sort((left, right) => left - right)
}

async function readWinnerTicketNumbersFromOrders(
  db: Firestore,
  userId: string,
  weekStartAtMs: number,
  weekEndAtMs: number,
): Promise<string[]> {
  if (!userId || !Number.isFinite(weekStartAtMs) || !Number.isFinite(weekEndAtMs)) {
    return []
  }

  const ordersSnapshot = await db.collection('orders')
    .where('userId', '==', userId)
    .select('status', 'type', 'campaignId', 'reservedNumbers', 'createdAt', 'updatedAt')
    .get()

  const ticketNumbers = new Set<number>()

  for (const document of ordersSnapshot.docs) {
    const data = document.data()
    const status = sanitizeString(data.status).toLowerCase()
    const type = sanitizeString(data.type).toLowerCase()
    const campaignId = sanitizeString(data.campaignId)

    if (status !== 'paid' || type !== 'deposit' || campaignId !== CAMPAIGN_DOC_ID) {
      continue
    }

    const createdAtMs = readTimestampMillis(data.createdAt)
    const updatedAtMs = readTimestampMillis(data.updatedAt)
    const purchaseAtMs = createdAtMs || updatedAtMs

    if (!purchaseAtMs || purchaseAtMs < weekStartAtMs || purchaseAtMs > weekEndAtMs) {
      continue
    }

    for (const ticketNumber of readOrderNumbers(data)) {
      ticketNumbers.add(ticketNumber)
    }
  }

  return Array.from(ticketNumbers)
    .sort((left, right) => left - right)
    .map((number) => String(number).padStart(7, '0'))
    .slice(0, 300)
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

function getComparisonDigits(participantCount: number) {
  if (participantCount <= 1000) {
    return 3
  }

  if (participantCount <= 10000) {
    return 4
  }

  if (participantCount <= 100000) {
    return 5
  }

  return 6
}

function buildAvailableDrawPrizes(campaignData: DocumentData | undefined): string[] {
  const mainPrize = sanitizeString(campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
  const secondPrize = sanitizeString(campaignData?.secondPrize)
  const bonusPrize = sanitizeString(campaignData?.bonusPrize)

  const directPrizes = [mainPrize, secondPrize].filter(Boolean)
  const expandedPixPrizes: string[] = []

  const pixMatch = bonusPrize.match(/^\s*(\d+)\s*pix\b/i)
  if (bonusPrize && pixMatch) {
    const totalPix = Number(pixMatch[1])
    if (Number.isInteger(totalPix) && totalPix > 1 && totalPix <= 100) {
      for (let index = 1; index <= totalPix; index += 1) {
        expandedPixPrizes.push(`${bonusPrize} (Cota PIX ${index})`)
      }
    } else {
      expandedPixPrizes.push(bonusPrize)
    }
  } else if (bonusPrize) {
    expandedPixPrizes.push(bonusPrize)
  }

  return Array.from(new Set([...directPrizes, ...expandedPixPrizes]))
}

function sanitizeDrawPrize(value: unknown, allowedPrizes: string[]): string {
  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Selecione o premio vigente do sorteio.')
  }

  if (!allowedPrizes.includes(normalized)) {
    throw new HttpsError('invalid-argument', 'Premio selecionado nao pertence aos premios vigentes da campanha.')
  }

  return normalized
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
): Promise<RankingBuildOutput> {
  const ordersSnapshot = await db.collection('orders')
    .where('status', '==', 'paid')
    .where('type', '==', 'deposit')
    .where('campaignId', '==', CAMPAIGN_DOC_ID)
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt', 'updatedAt')
    .get()

  const totalsByUser = new Map<string, { cotas: number, firstPurchaseAtMs: number, ticketNumbers: Set<number> }>()

  for (const document of ordersSnapshot.docs) {
    const data = document.data()
    const userId = readString(data.userId)
    const quantity = readOrderQuantity(data)
    const numbers = readOrderNumbers(data)

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
        ticketNumbers: new Set(numbers),
      })
      continue
    }

    for (const number of numbers) {
      previous.ticketNumbers.add(number)
    }

    totalsByUser.set(userId, {
      cotas: previous.cotas + quantity,
      firstPurchaseAtMs: Math.min(previous.firstPurchaseAtMs, purchaseAtMs),
      ticketNumbers: previous.ticketNumbers,
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
    return {
      rankingSnapshot: [],
      winnerTicketNumbersByUser: new Map(),
    }
  }

  const usersSnapshot = await Promise.all(
    sorted.map(([uid]) => db.collection('users').doc(uid).get()),
  )

  const rankingSnapshot = sorted.map(([uid, aggregate], index) => {
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

  const winnerTicketNumbersByUser = new Map<string, string[]>(
    sorted.map(([uid, aggregate]) => [
      uid,
      Array.from(aggregate.ticketNumbers)
        .sort((left, right) => left - right)
        .map((number) => String(number).padStart(7, '0'))
        .slice(0, 300),
    ]),
  )

  return {
    rankingSnapshot,
    winnerTicketNumbersByUser,
  }
}

function resolveWinnerByFederalRule(
  extractionNumbers: string[],
  rankingSnapshot: TopBuyersRankingItem[],
): {
  comparisonDigits: number
  attempts: ExtractionAttempt[]
  winningPosition: number
  winningCode: string
  resolvedBy: 'federal_extraction' | 'redundancy'
} {
  const participantCount = rankingSnapshot.length
  const comparisonDigits = getComparisonDigits(participantCount)
  const positionByCode = new Map<string, number>()
  const firstPurchaseAtByCode = new Map<string, number>()
  const availableCodes = new Set<number>()

  for (const item of rankingSnapshot) {
    const code = String(item.pos).padStart(comparisonDigits, '0')
    positionByCode.set(code, item.pos)
    firstPurchaseAtByCode.set(code, item.firstPurchaseAtMs)
    availableCodes.add(Number(code))
  }

  function findNearestAvailableCode(targetCode: string): string | null {
    const targetNumber = Number(targetCode)
    const maxCode = (10 ** comparisonDigits) - 1

    if (availableCodes.has(targetNumber)) {
      return targetCode
    }

    for (let distance = 1; distance <= maxCode; distance += 1) {
      const below = targetNumber - distance
      const above = targetNumber + distance

      const hasBelow = below >= 0 && availableCodes.has(below)
      const hasAbove = above <= maxCode && availableCodes.has(above)

      if (hasBelow && hasAbove) {
        const belowCode = String(below).padStart(comparisonDigits, '0')
        const aboveCode = String(above).padStart(comparisonDigits, '0')
        const belowFirstPurchaseAt = Number(firstPurchaseAtByCode.get(belowCode) || 0)
        const aboveFirstPurchaseAt = Number(firstPurchaseAtByCode.get(aboveCode) || 0)

        // Empate por distancia: prioriza quem comprou primeiro (menor timestamp).
        if (belowFirstPurchaseAt > 0 && aboveFirstPurchaseAt > 0 && belowFirstPurchaseAt !== aboveFirstPurchaseAt) {
          return belowFirstPurchaseAt < aboveFirstPurchaseAt ? belowCode : aboveCode
        }

        // Fallback deterministico para empate absoluto.
        return belowCode
      }

      if (hasBelow) {
        return String(below).padStart(comparisonDigits, '0')
      }

      if (hasAbove) {
        return String(above).padStart(comparisonDigits, '0')
      }
    }

    return null
  }

  const attempts: ExtractionAttempt[] = []

  for (let index = 0; index < extractionNumbers.length; index += 1) {
    const extractionNumber = extractionNumbers[index]
    const rawCandidateCode = extractionNumber.slice(-comparisonDigits).padStart(comparisonDigits, '0')
    const resolvedCandidateCode = findNearestAvailableCode(rawCandidateCode) || rawCandidateCode
    const matchedPosition = positionByCode.get(resolvedCandidateCode) || null

    attempts.push({
      extractionIndex: index + 1,
      extractionNumber,
      comparisonDigits,
      candidateCode: resolvedCandidateCode,
      matchedPosition,
    })

    if (matchedPosition) {
      return {
        comparisonDigits,
        attempts,
        winningPosition: matchedPosition,
        winningCode: resolvedCandidateCode,
        resolvedBy: 'federal_extraction',
      }
    }
  }

  // Fallback de seguranca: garante ganhador mesmo em dados inconsistentes.
  const fallbackPosition = 1
  const fallbackCode = String(fallbackPosition).padStart(comparisonDigits, '0')

  attempts.push({
    extractionIndex: EXTRACTION_COUNT + 1,
    extractionNumber: extractionNumbers.join('-'),
    comparisonDigits,
    candidateCode: fallbackCode,
    matchedPosition: fallbackPosition,
  })

  return {
    comparisonDigits,
    attempts,
    winningPosition: fallbackPosition,
    winningCode: fallbackCode,
    resolvedBy: 'redundancy',
  }
}

export function createPublishTopBuyersDrawHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<TopBuyersDrawResult> => {
    const uid = sanitizeString(request.auth?.uid)
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticacao obrigatoria para publicar resultado.')
    }

    await assertAdminRole(db, uid)

    const payload = asRecord(request.data) as PublishTopBuyersDrawInput
    const extractionNumbers = sanitizeExtractionNumbers(payload.extractionNumbers)
    const rankingLimit = sanitizeRankingLimit(payload.rankingLimit)
    const rankingWindow = getWeeklyRankingWindow()
    const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
    const campaignData = campaignSnapshot.data()
    const availableDrawPrizes = buildAvailableDrawPrizes(campaignData)
    const drawPrize = sanitizeDrawPrize(payload.drawPrize, availableDrawPrizes)
    const existingPrizeSnapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
      .where('drawPrize', '==', drawPrize)
      .limit(1)
      .get()
    if (!existingPrizeSnapshot.empty) {
      throw new HttpsError(
        'failed-precondition',
        'Este premio ja foi sorteado em uma rodada anterior e nao pode ser reutilizado.',
      )
    }
    const drawDate = formatBrazilDateId(Date.now())

    try {
      const rankingBuild = await buildRankingSnapshot(db, rankingLimit, rankingWindow)
      const rankingSnapshot = rankingBuild.rankingSnapshot
      if (rankingSnapshot.length === 0) {
        throw new HttpsError('failed-precondition', 'Ainda nao ha participantes elegiveis para sorteio.')
      }

      const winnerResolution = resolveWinnerByFederalRule(extractionNumbers, rankingSnapshot)
      const winner = rankingSnapshot[winnerResolution.winningPosition - 1]

      if (!winner) {
        throw new HttpsError('internal', 'Nao foi possivel identificar o ganhador.')
      }

      const drawRef = db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION).doc()
      const publishedAtMs = Date.now()

      const result: TopBuyersDrawResult = {
        campaignId: CAMPAIGN_DOC_ID,
        drawId: drawRef.id,
        drawDate,
        drawPrize,
        weekId: rankingWindow.weekId,
        weekStartAtMs: rankingWindow.startMs,
        weekEndAtMs: rankingWindow.endMs,
        requestedRankingLimit: rankingLimit,
        participantCount: rankingSnapshot.length,
        comparisonDigits: winnerResolution.comparisonDigits,
        extractionNumbers,
        attempts: winnerResolution.attempts,
        winningPosition: winnerResolution.winningPosition,
        winningCode: winnerResolution.winningCode,
        resolvedBy: winnerResolution.resolvedBy,
        winner: {
          userId: winner.userId,
          name: winner.name,
          cotas: winner.cotas,
          pos: winner.pos,
        },
        winnerTicketNumbers: rankingBuild.winnerTicketNumbersByUser.get(winner.userId) || [],
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
      const drawDate = sanitizeString(rawResult.drawDate)
      const drawPrize = sanitizeString(rawResult.drawPrize) || sanitizeString(campaignSnapshot.get('mainPrize')) || DEFAULT_MAIN_PRIZE
      const weekId = sanitizeString(rawResult.weekId)
      const weekStartAtMs = Number(rawResult.weekStartAtMs)
      const weekEndAtMs = Number(rawResult.weekEndAtMs)
      const requestedRankingLimit = Number(rawResult.requestedRankingLimit)
      const participantCount = Number(rawResult.participantCount)
      const comparisonDigits = Number(rawResult.comparisonDigits)
      const extractionNumbers = Array.isArray(rawResult.extractionNumbers)
        ? rawResult.extractionNumbers.map((item) => sanitizeString(item)).filter(Boolean)
        : []
      const attempts = Array.isArray(rawResult.attempts)
        ? rawResult.attempts
          .map((item) => asRecord(item))
          .map((item) => ({
            extractionIndex: Number(item.extractionIndex),
            extractionNumber: sanitizeString(item.extractionNumber),
            comparisonDigits: Number(item.comparisonDigits),
            candidateCode: sanitizeString(item.candidateCode),
            matchedPosition: Number.isInteger(Number(item.matchedPosition))
              ? Number(item.matchedPosition)
              : null,
          }))
          .filter((item) => Number.isInteger(item.extractionIndex) && item.extractionIndex > 0 && item.extractionNumber)
        : []
      const winningPosition = Number(rawResult.winningPosition)
      const winningCode = sanitizeString(rawResult.winningCode)
      const resolvedBy = rawResult.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy'
      const publishedAtMs = Number(rawResult.publishedAtMs)
      const winnerRecord = asRecord(rawResult.winner)
      let winnerTicketNumbers = Array.isArray(rawResult.winnerTicketNumbers)
        ? rawResult.winnerTicketNumbers
          .map((item) => sanitizeString(item))
          .filter(Boolean)
          .slice(0, 300)
        : []

      if (
        !drawId ||
        !drawDate ||
        !weekId ||
        !Number.isFinite(weekStartAtMs) ||
        !Number.isFinite(weekEndAtMs) ||
        !Number.isInteger(requestedRankingLimit) ||
        requestedRankingLimit <= 0 ||
        !Number.isInteger(participantCount) ||
        participantCount <= 0 ||
        !Number.isInteger(comparisonDigits) ||
        comparisonDigits <= 0 ||
        extractionNumbers.length === 0 ||
        !Number.isInteger(winningPosition) ||
        winningPosition <= 0 ||
        !winningCode ||
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

      if (winnerTicketNumbers.length === 0 && winner.userId) {
        winnerTicketNumbers = await readWinnerTicketNumbersFromOrders(
          db,
          winner.userId,
          weekStartAtMs,
          weekEndAtMs,
        )
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
          drawDate,
          drawPrize,
          weekId,
          weekStartAtMs,
          weekEndAtMs,
          requestedRankingLimit,
          participantCount,
          comparisonDigits,
          extractionNumbers,
          attempts,
          winningPosition,
          winningCode,
          resolvedBy,
          winner,
          winnerTicketNumbers,
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

export function createGetTopBuyersDrawHistoryHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null }): Promise<GetTopBuyersDrawHistoryOutput> => {
    const uid = sanitizeString(request.auth?.uid)
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticacao obrigatoria para consultar historico.')
    }

    await assertAdminRole(db, uid)

    try {
      const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
      const fallbackMainPrize = sanitizeString(campaignSnapshot.get('mainPrize')) || DEFAULT_MAIN_PRIZE
      const historySnapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .orderBy('publishedAtMs', 'desc')
        .limit(120)
        .get()

      const rawResults = await Promise.all(historySnapshot.docs
        .map(async (documentSnapshot) => {
          const raw = asRecord(documentSnapshot.data())
          const drawId = sanitizeString(raw.drawId) || documentSnapshot.id
          const drawDate = sanitizeString(raw.drawDate)
          const drawPrize = sanitizeString(raw.drawPrize) || fallbackMainPrize
          const weekId = sanitizeString(raw.weekId)
          const weekStartAtMs = Number(raw.weekStartAtMs)
          const weekEndAtMs = Number(raw.weekEndAtMs)
          const requestedRankingLimit = Number(raw.requestedRankingLimit)
          const participantCount = Number(raw.participantCount)
          const comparisonDigits = Number(raw.comparisonDigits)
          const extractionNumbers = Array.isArray(raw.extractionNumbers)
            ? raw.extractionNumbers.map((item) => sanitizeString(item)).filter(Boolean)
            : []
          const attempts = Array.isArray(raw.attempts)
            ? raw.attempts
              .map((item) => asRecord(item))
              .map((item) => ({
                extractionIndex: Number(item.extractionIndex),
                extractionNumber: sanitizeString(item.extractionNumber),
                comparisonDigits: Number(item.comparisonDigits),
                candidateCode: sanitizeString(item.candidateCode),
                matchedPosition: Number.isInteger(Number(item.matchedPosition))
                  ? Number(item.matchedPosition)
                  : null,
              }))
              .filter((item) => Number.isInteger(item.extractionIndex) && item.extractionIndex > 0 && item.extractionNumber)
            : []
          const winningPosition = Number(raw.winningPosition)
          const winningCode = sanitizeString(raw.winningCode)
          const resolvedBy = raw.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy'
          const publishedAtMs = Number(raw.publishedAtMs)
          const winnerRecord = asRecord(raw.winner)
          let winnerTicketNumbers = Array.isArray(raw.winnerTicketNumbers)
            ? raw.winnerTicketNumbers
              .map((item) => sanitizeString(item))
              .filter(Boolean)
              .slice(0, 300)
            : []
          const winner: TopBuyersDrawWinner = {
            userId: sanitizeString(winnerRecord.userId),
            name: sanitizeString(winnerRecord.name) || 'Participante',
            cotas: Number(winnerRecord.cotas) || 0,
            pos: Number(winnerRecord.pos) || winningPosition,
          }

          if (winnerTicketNumbers.length === 0 && winner.userId) {
            winnerTicketNumbers = await readWinnerTicketNumbersFromOrders(
              db,
              winner.userId,
              weekStartAtMs,
              weekEndAtMs,
            )
          }
          const rankingSnapshot = Array.isArray(raw.rankingSnapshot)
            ? raw.rankingSnapshot
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

          if (
            !drawId ||
            !drawDate ||
            !weekId ||
            !Number.isFinite(weekStartAtMs) ||
            !Number.isFinite(weekEndAtMs) ||
            !Number.isInteger(requestedRankingLimit) ||
            requestedRankingLimit <= 0 ||
            !Number.isInteger(participantCount) ||
            participantCount <= 0 ||
            !Number.isInteger(comparisonDigits) ||
            comparisonDigits <= 0 ||
            extractionNumbers.length === 0 ||
            !Number.isInteger(winningPosition) ||
            winningPosition <= 0 ||
            !winningCode ||
            !Number.isFinite(publishedAtMs)
          ) {
            return null
          }

          return {
            campaignId: CAMPAIGN_DOC_ID,
            drawId,
            drawDate,
            drawPrize,
            weekId,
            weekStartAtMs,
            weekEndAtMs,
            requestedRankingLimit,
            participantCount,
            comparisonDigits,
            extractionNumbers,
            attempts,
            winningPosition,
            winningCode,
            resolvedBy,
            winner,
            winnerTicketNumbers,
            rankingSnapshot,
            publishedAtMs,
          }
        }))

      const results: TopBuyersDrawResult[] = rawResults.filter((item): item is TopBuyersDrawResult => Boolean(item))

      return { results }
    } catch (error) {
      logger.error('getTopBuyersDrawHistory failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o historico de resultados.')
    }
  }
}

export function createGetPublicTopBuyersDrawHistoryHandler(db: Firestore) {
  return async (): Promise<GetPublicTopBuyersDrawHistoryOutput> => {
    try {
      const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
      const fallbackMainPrize = sanitizeString(campaignSnapshot.get('mainPrize')) || DEFAULT_MAIN_PRIZE
      const historySnapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .orderBy('publishedAtMs', 'desc')
        .limit(120)
        .get()

      const rawResults = await Promise.all(historySnapshot.docs
        .map(async (documentSnapshot) => {
          const raw = asRecord(documentSnapshot.data())
          const drawId = sanitizeString(raw.drawId) || documentSnapshot.id
          const drawDate = sanitizeString(raw.drawDate)
          const drawPrize = sanitizeString(raw.drawPrize) || fallbackMainPrize
          const weekId = sanitizeString(raw.weekId)
          const weekStartAtMs = Number(raw.weekStartAtMs)
          const weekEndAtMs = Number(raw.weekEndAtMs)
          const requestedRankingLimit = Number(raw.requestedRankingLimit)
          const participantCount = Number(raw.participantCount)
          const comparisonDigits = Number(raw.comparisonDigits)
          const extractionNumbers = Array.isArray(raw.extractionNumbers)
            ? raw.extractionNumbers.map((item) => sanitizeString(item)).filter(Boolean)
            : []
          const attempts = Array.isArray(raw.attempts)
            ? raw.attempts
              .map((item) => asRecord(item))
              .map((item) => ({
                extractionIndex: Number(item.extractionIndex),
                extractionNumber: sanitizeString(item.extractionNumber),
                comparisonDigits: Number(item.comparisonDigits),
                candidateCode: sanitizeString(item.candidateCode),
                matchedPosition: Number.isInteger(Number(item.matchedPosition))
                  ? Number(item.matchedPosition)
                  : null,
              }))
              .filter((item) => Number.isInteger(item.extractionIndex) && item.extractionIndex > 0 && item.extractionNumber)
            : []
          const winningPosition = Number(raw.winningPosition)
          const winningCode = sanitizeString(raw.winningCode)
          const resolvedBy = raw.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy'
          const publishedAtMs = Number(raw.publishedAtMs)
          const winnerRecord = asRecord(raw.winner)
          let winnerTicketNumbers = Array.isArray(raw.winnerTicketNumbers)
            ? raw.winnerTicketNumbers
              .map((item) => sanitizeString(item))
              .filter(Boolean)
              .slice(0, 300)
            : []
          const winner: TopBuyersDrawWinner = {
            userId: sanitizeString(winnerRecord.userId),
            name: sanitizeString(winnerRecord.name) || 'Participante',
            cotas: Number(winnerRecord.cotas) || 0,
            pos: Number(winnerRecord.pos) || winningPosition,
          }

          if (winnerTicketNumbers.length === 0 && winner.userId) {
            winnerTicketNumbers = await readWinnerTicketNumbersFromOrders(
              db,
              winner.userId,
              weekStartAtMs,
              weekEndAtMs,
            )
          }
          const rankingSnapshot = Array.isArray(raw.rankingSnapshot)
            ? raw.rankingSnapshot
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

          if (
            !drawId ||
            !drawDate ||
            !weekId ||
            !Number.isFinite(weekStartAtMs) ||
            !Number.isFinite(weekEndAtMs) ||
            !Number.isInteger(requestedRankingLimit) ||
            requestedRankingLimit <= 0 ||
            !Number.isInteger(participantCount) ||
            participantCount <= 0 ||
            !Number.isInteger(comparisonDigits) ||
            comparisonDigits <= 0 ||
            extractionNumbers.length === 0 ||
            !Number.isInteger(winningPosition) ||
            winningPosition <= 0 ||
            !winningCode ||
            !Number.isFinite(publishedAtMs)
          ) {
            return null
          }

          return {
            campaignId: CAMPAIGN_DOC_ID,
            drawId,
            drawDate,
            drawPrize,
            weekId,
            weekStartAtMs,
            weekEndAtMs,
            requestedRankingLimit,
            participantCount,
            comparisonDigits,
            extractionNumbers,
            attempts,
            winningPosition,
            winningCode,
            resolvedBy,
            winner,
            winnerTicketNumbers,
            rankingSnapshot,
            publishedAtMs,
          }
        }))

      const results: TopBuyersDrawResult[] = rawResults.filter((item): item is TopBuyersDrawResult => Boolean(item))

      return { results }
    } catch (error) {
      logger.error('getPublicTopBuyersDrawHistory failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o historico publico de resultados.')
    }
  }
}

export function createGetMyTopBuyersWinningSummaryHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null }): Promise<GetMyTopBuyersWinningSummaryOutput> => {
    const uid = sanitizeString(request.auth?.uid)
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Autenticacao obrigatoria para consultar premiacoes.')
    }

    try {
      const winsSnapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .where('winner.userId', '==', uid)
        .select('drawId', 'drawDate', 'drawPrize', 'publishedAtMs')
        .limit(80)
        .get()

      if (winsSnapshot.empty) {
        return {
          hasWins: false,
          winsCount: 0,
          latestWin: null,
        }
      }

      const wins = winsSnapshot.docs
        .map((documentSnapshot) => {
          const data = asRecord(documentSnapshot.data())
          const drawId = sanitizeString(data.drawId) || documentSnapshot.id
          const drawDate = sanitizeString(data.drawDate)
          const drawPrize = sanitizeString(data.drawPrize)
          const publishedAtMs = Number(data.publishedAtMs)

          if (!drawId || !drawDate || !drawPrize || !Number.isFinite(publishedAtMs)) {
            return null
          }

          return {
            drawId,
            drawDate,
            drawPrize,
            publishedAtMs,
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))

      if (wins.length === 0) {
        return {
          hasWins: false,
          winsCount: 0,
          latestWin: null,
        }
      }

      const latestWin = [...wins].sort((left, right) => right.publishedAtMs - left.publishedAtMs)[0]

      return {
        hasWins: true,
        winsCount: wins.length,
        latestWin,
      }
    } catch (error) {
      logger.error('getMyTopBuyersWinningSummary failed', {
        uid,
        error: String(error),
      })

      throw new HttpsError('internal', 'Nao foi possivel carregar seu status de premiacao.')
    }
  }
}
