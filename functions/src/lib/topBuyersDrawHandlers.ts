import { FieldPath, FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID, DEFAULT_MAIN_PRIZE, DEFAULT_TOP_BUYERS_RANKING_LIMIT } from './constants.js'
import { getCampaignDocCached, invalidateCampaignDocCache } from './campaignDocCache.js'
import { asRecord, readString, readTimestampMillis, requireActiveUid, sanitizeString } from './shared.js'
import { pickTopBuyersWinningTicketNumber } from './topBuyersWinner.js'
import { buildTopBuyersDrawPrizeValues } from './campaignPrizes.js'
import {
  resolveCurrentTopBuyersRankingWindow,
  syncWeeklyTopBuyersRankingFromLatestDraw,
} from './rankingHandlers.js'

const TOP_BUYERS_DRAW_HISTORY_COLLECTION = 'topBuyersDrawResults'
const DEFAULT_PUBLIC_HISTORY_LIMIT = 30
const DEFAULT_ADMIN_HISTORY_LIMIT = 50
const MAX_PUBLIC_HISTORY_LIMIT = 50
const MAX_ADMIN_HISTORY_LIMIT = 100
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
  photoURL: string
}

interface TopBuyersDrawWinner {
  userId: string
  name: string
  cotas: number
  pos: number
  photoURL: string
}

interface ExtractionAttempt {
  extractionIndex: number
  extractionNumber: string
  comparisonDigits: number
  rawCandidateCode: string
  candidateCode: string
  nearestDirection: 'none' | 'below' | 'above'
  nearestDistance: number | null
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
  winningTicketNumber: string | null
  rankingSnapshot: TopBuyersRankingItem[]
  exactCalculation?: ExactCalculationSnapshot
  publishedAtMs: number
}

interface GetLatestTopBuyersDrawOutput {
  hasResult: boolean
  result: TopBuyersDrawResult | null
}

interface GetTopBuyersDrawHistoryOutput {
  results: TopBuyersDrawResult[]
  nextCursor: string | null
  hasMore: boolean
}

interface GetPublicTopBuyersDrawHistoryOutput {
  results: TopBuyersDrawResult[]
}

interface ExactCalculationComparisonItem {
  pos: number
  userId: string
  name: string
  ticketNumber: string | null
  ticketFinal: string | null
  isWinner: boolean
}

interface ExactCalculationAttemptOutput {
  extractionIndex: number
  extractionNumber: string
  rawCode: string
  resolvedCode: string
  nearestDirection: 'none' | 'below' | 'above'
  matchedPosition: number | null
  comparisons: ExactCalculationComparisonItem[]
}

type ExactCalculationSnapshot = {
  drawId: string
  comparisonDigits: number
  winningPosition: number
  attempts: ExactCalculationAttemptOutput[]
}

interface GetLatestTopBuyersDrawExactCalculationOutput {
  hasResult: boolean
  drawId: string | null
  result: ExactCalculationSnapshot | null
}

interface GetLatestTopBuyersDrawExactCalculationInput {
  drawId?: string
}

interface GetTopBuyersDrawHistoryInput {
  limit?: number
  cursor?: string
}

interface GetPublicTopBuyersDrawHistoryInput {
  limit?: number
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

function readTopBuyersRankingLimitFromCampaign(campaignData: DocumentData | undefined): number {
  const parsed = Number(campaignData?.topBuyersRankingLimit)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TOP_BUYERS_RANKING_LIMIT
  }

  return Math.min(parsed, DEFAULT_TOP_BUYERS_RANKING_LIMIT)
}

function sanitizeHistoryLimit(value: unknown, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.max(1, parsed), max)
}

function encodeHistoryCursor(publishedAtMs: number, docId: string): string | null {
  if (!Number.isFinite(publishedAtMs) || !docId) {
    return null
  }

  try {
    return Buffer.from(JSON.stringify({ p: Math.floor(publishedAtMs), d: docId }), 'utf8').toString('base64')
  } catch {
    return null
  }
}

function decodeHistoryCursor(value: unknown): { publishedAtMs: number, docId: string } | null {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  try {
    const decoded = Buffer.from(normalized, 'base64').toString('utf8')
    const payload = asRecord(JSON.parse(decoded))
    const publishedAtMs = Number(payload.p)
    const docId = sanitizeString(payload.d)
    if (!Number.isFinite(publishedAtMs) || !docId) {
      return null
    }

    return {
      publishedAtMs: Math.floor(publishedAtMs),
      docId,
    }
  } catch {
    return null
  }
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
  if (!Array.isArray(value) || value.length < 1 || value.length > EXTRACTION_COUNT) {
    throw new HttpsError('invalid-argument', 'Informe de 1 a 5 extracoes da Loteria Federal.')
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

function normalizeExactCalculationComparisons(value: unknown): ExactCalculationComparisonItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => asRecord(item))
    .map((item, index) => {
      const pos = Number(item.pos)
      const userId = sanitizeString(item.userId)
      return {
        pos: Number.isInteger(pos) && pos > 0 ? pos : index + 1,
        userId: userId || `pos-${index + 1}`,
        name: sanitizeString(item.name) || 'Participante',
        ticketNumber: sanitizeString(item.ticketNumber) || null,
        ticketFinal: sanitizeString(item.ticketFinal) || null,
        isWinner: item.isWinner === true,
      }
    })
    .filter((item) => item.pos > 0)
}

function normalizeExactCalculationAttempts(value: unknown): ExactCalculationAttemptOutput[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index) => {
      const raw = asRecord(item)
      const extractionIndex = Number(raw.extractionIndex)
      const extractionNumber = sanitizeString(raw.extractionNumber)

      return {
        extractionIndex: Number.isInteger(extractionIndex) && extractionIndex > 0
          ? extractionIndex
          : index + 1,
        extractionNumber: extractionNumber || '-',
        rawCode: sanitizeString(raw.rawCode) || sanitizeString(raw.rawCandidateCode),
        resolvedCode: sanitizeString(raw.resolvedCode) || sanitizeString(raw.candidateCode),
        nearestDirection: raw.nearestDirection === 'below'
          ? 'below'
          : raw.nearestDirection === 'above'
            ? 'above'
            : 'none',
        matchedPosition: Number.isInteger(Number(raw.matchedPosition))
          ? Number(raw.matchedPosition)
          : null,
        comparisons: normalizeExactCalculationComparisons(raw.comparisons),
      } satisfies ExactCalculationAttemptOutput
    })
    .filter((item) => item.extractionIndex > 0 && item.extractionNumber)
}

function parseExactCalculationSnapshot(rawResult: Record<string, unknown>, fallbackDrawId = ''): ExactCalculationSnapshot | null {
  const exactCalculationRaw = asRecord(rawResult.exactCalculation)
  if (Object.keys(exactCalculationRaw).length === 0) {
    return null
  }

  const drawId = sanitizeString(exactCalculationRaw.drawId) || sanitizeString(rawResult.drawId) || sanitizeString(fallbackDrawId)
  const comparisonDigits = Number(exactCalculationRaw.comparisonDigits)
  const winningPosition = Number(exactCalculationRaw.winningPosition)
  const attempts = normalizeExactCalculationAttempts(exactCalculationRaw.attempts)

  if (
    !drawId
    || !Number.isInteger(comparisonDigits)
    || comparisonDigits <= 0
    || !Number.isInteger(winningPosition)
    || winningPosition <= 0
    || attempts.length === 0
  ) {
    return null
  }

  const persistedWinningTicket = sanitizeString(rawResult.winningTicketNumber) || null
  const persistedWinningTicketFinal = persistedWinningTicket
    ? persistedWinningTicket.slice(-comparisonDigits).padStart(comparisonDigits, '0')
    : null

  return {
    drawId,
    comparisonDigits,
    winningPosition,
    attempts: attempts.map((attempt) => {
      const rawCode = (attempt.rawCode || attempt.extractionNumber.slice(-comparisonDigits))
        .padStart(comparisonDigits, '0')
      const resolvedCode = (attempt.resolvedCode || rawCode).padStart(comparisonDigits, '0')
      const comparisons = attempt.comparisons.map((comparison) => {
        if (!comparison.isWinner || !persistedWinningTicket || !persistedWinningTicketFinal) {
          return comparison
        }

        return {
          ...comparison,
          ticketNumber: persistedWinningTicket,
          ticketFinal: persistedWinningTicketFinal,
        }
      })

      return {
        ...attempt,
        rawCode,
        resolvedCode,
        comparisons,
      }
    }),
  }
}

function pickComparableTicketForAttempt(
  tickets: string[],
  rawCode: string,
  resolvedCode: string,
  comparisonDigits: number,
  isWinner: boolean,
  winningTicketNumber: string | null,
): string | null {
  if (tickets.length === 0) {
    return null
  }

  if (isWinner && winningTicketNumber) {
    return winningTicketNumber
  }

  if (isWinner) {
    const byResolved = tickets.find((ticket) => ticket.endsWith(resolvedCode))
    if (byResolved) {
      return byResolved
    }
  }

  const byRaw = tickets.find((ticket) => ticket.endsWith(rawCode))
  if (byRaw) {
    return byRaw
  }

  const target = Number(rawCode)
  const safeTarget = Number.isFinite(target) ? target : 0
  let selected = tickets[0]
  let selectedDistance = Number.POSITIVE_INFINITY
  let selectedFinal = Number.POSITIVE_INFINITY
  let selectedTicket = Number(selected)

  for (const ticket of tickets) {
    const suffix = ticket.slice(-comparisonDigits).padStart(comparisonDigits, '0')
    const suffixNumber = Number(suffix)
    const distance = Math.abs(suffixNumber - safeTarget)
    const ticketNumber = Number(ticket)

    if (distance < selectedDistance) {
      selected = ticket
      selectedDistance = distance
      selectedFinal = suffixNumber
      selectedTicket = ticketNumber
      continue
    }

    if (distance === selectedDistance && suffixNumber < selectedFinal) {
      selected = ticket
      selectedFinal = suffixNumber
      selectedTicket = ticketNumber
      continue
    }

    if (
      distance === selectedDistance
      && suffixNumber === selectedFinal
      && Number.isFinite(ticketNumber)
      && Number.isFinite(selectedTicket)
      && ticketNumber < selectedTicket
    ) {
      selected = ticket
      selectedTicket = ticketNumber
    }
  }

  return selected
}

function buildExactCalculationSnapshot(params: {
  drawId: string
  comparisonDigits: number
  winningPosition: number
  attempts: ExtractionAttempt[]
  rankingSnapshot: TopBuyersRankingItem[]
  ticketNumbersByUser: Map<string, string[]>
  winningTicketNumber: string | null
}): ExactCalculationSnapshot {
  const { drawId, comparisonDigits, winningPosition, attempts, rankingSnapshot, ticketNumbersByUser, winningTicketNumber } = params

  return {
    drawId,
    comparisonDigits,
    winningPosition,
    attempts: attempts.map((attempt) => {
      const rawCode = (attempt.rawCandidateCode || attempt.extractionNumber.slice(-comparisonDigits))
        .padStart(comparisonDigits, '0')
      const resolvedCode = attempt.candidateCode.padStart(comparisonDigits, '0')

      const comparisons: ExactCalculationComparisonItem[] = rankingSnapshot.map((entry) => {
        const userTickets = ticketNumbersByUser.get(entry.userId) || []
        const isWinner = attempt.matchedPosition === entry.pos
        const selectedTicket = pickComparableTicketForAttempt(
          userTickets,
          rawCode,
          resolvedCode,
          comparisonDigits,
          isWinner,
          winningTicketNumber,
        )

        return {
          pos: entry.pos,
          userId: entry.userId,
          name: entry.name,
          ticketNumber: selectedTicket,
          ticketFinal: selectedTicket
            ? selectedTicket.slice(-comparisonDigits).padStart(comparisonDigits, '0')
            : null,
          isWinner,
        }
      })

      return {
        extractionIndex: attempt.extractionIndex,
        extractionNumber: attempt.extractionNumber,
        rawCode,
        resolvedCode,
        nearestDirection: attempt.nearestDirection,
        matchedPosition: attempt.matchedPosition,
        comparisons,
      }
    }),
  }
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
  return buildTopBuyersDrawPrizeValues(campaignData)
}

function sanitizeDrawPrize(value: unknown, allowedPrizes: string[], blockedPrizes: string[] = []): string {
  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Selecione o premio vigente do sorteio.')
  }

  const normalizedKey = normalizeDrawPrizeKey(normalized)
  if (!normalizedKey) {
    throw new HttpsError('invalid-argument', 'Selecione o premio vigente do sorteio.')
  }

  const blockedPrizeKeys = new Set(
    blockedPrizes
      .map((item) => normalizeDrawPrizeKey(item))
      .filter(Boolean),
  )
  if (blockedPrizeKeys.has(normalizedKey)) {
    throw new HttpsError('invalid-argument', 'O premio principal nao pode ser utilizado no Sorteio Top.')
  }

  const allowedPrizeByKey = new Map<string, string>()
  for (const prize of allowedPrizes) {
    const key = normalizeDrawPrizeKey(prize)
    if (key && !allowedPrizeByKey.has(key)) {
      allowedPrizeByKey.set(key, prize)
    }
  }

  const canonicalPrize = allowedPrizeByKey.get(normalizedKey)
  if (!canonicalPrize) {
    throw new HttpsError('invalid-argument', 'Premio selecionado nao pertence aos premios vigentes da campanha.')
  }

  return canonicalPrize
}

function normalizeDrawPrizeKey(value: string): string {
  return value
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeResultsByPrize(results: TopBuyersDrawResult[]): TopBuyersDrawResult[] {
  const byPrizeKey = new Map<string, TopBuyersDrawResult>()
  for (const item of results) {
    const key = normalizeDrawPrizeKey(item.drawPrize) || item.drawId
    if (!byPrizeKey.has(key)) {
      byPrizeKey.set(key, item)
    }
  }

  return Array.from(byPrizeKey.values())
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
    .where('createdAt', '>=', Timestamp.fromMillis(rankingWindow.startMs))
    .where('createdAt', '<=', Timestamp.fromMillis(rankingWindow.endMs))
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt')
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

    const purchaseAtMs = readTimestampMillis(data.createdAt)

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
      photoURL: sanitizeString(userData.photoURL),
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

export function resolveWinnerByFederalRule(
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
  const availableCodes = new Set<number>()
  const rankingCodesInOrder: string[] = []

  for (const item of rankingSnapshot) {
    const code = String(item.pos).padStart(comparisonDigits, '0')
    positionByCode.set(code, item.pos)
    availableCodes.add(Number(code))
    rankingCodesInOrder.push(code)
  }

  function findMatchByHouseComparison(targetCode: string): {
    resolvedCode: string
    nearestDirection: 'none' | 'below' | 'above'
    nearestDistance: number
  } | null {
    const targetNumber = Number(targetCode)
    const maxCode = (10 ** comparisonDigits) - 1

    if (availableCodes.has(targetNumber)) {
      return {
        resolvedCode: targetCode,
        nearestDirection: 'none',
        nearestDistance: 0,
      }
    }

    for (let distance = 1; distance <= maxCode; distance += 1) {
      const below = targetNumber - distance
      const above = targetNumber + distance

      const belowCode = below >= 0 ? String(below).padStart(comparisonDigits, '0') : null
      const aboveCode = above <= maxCode ? String(above).padStart(comparisonDigits, '0') : null
      const hasBelow = Boolean(belowCode && availableCodes.has(below))
      const hasAbove = Boolean(aboveCode && availableCodes.has(above))

      if (!hasBelow && !hasAbove) {
        continue
      }

      // Regra de casas: para cada distancia, percorre jogadores em ordem de ranking.
      for (const rankingCode of rankingCodesInOrder) {
        if (hasBelow && belowCode && rankingCode === belowCode) {
          return {
            resolvedCode: belowCode,
            nearestDirection: 'below',
            nearestDistance: distance,
          }
        }
        if (hasAbove && aboveCode && rankingCode === aboveCode) {
          return {
            resolvedCode: aboveCode,
            nearestDirection: 'above',
            nearestDistance: distance,
          }
        }
      }
    }

    return null
  }

  const attempts: ExtractionAttempt[] = []

  // Fase 1: match exato apenas — sem aproximacao.
  for (let index = 0; index < extractionNumbers.length; index += 1) {
    const extractionNumber = extractionNumbers[index]
    const rawCandidateCode = extractionNumber.slice(-comparisonDigits).padStart(comparisonDigits, '0')
    const isExactMatch = availableCodes.has(Number(rawCandidateCode))
    const matchedPosition = isExactMatch ? (positionByCode.get(rawCandidateCode) ?? null) : null

    attempts.push({
      extractionIndex: index + 1,
      extractionNumber,
      comparisonDigits,
      rawCandidateCode,
      candidateCode: rawCandidateCode,
      nearestDirection: 'none',
      nearestDistance: null,
      matchedPosition,
    })

    if (matchedPosition !== null) {
      return {
        comparisonDigits,
        attempts,
        winningPosition: matchedPosition,
        winningCode: rawCandidateCode,
        resolvedBy: 'federal_extraction',
      }
    }
  }

  // Fase 2: match por proximidade — volta para extracao 1 e compara casa por casa.
  for (let index = 0; index < extractionNumbers.length; index += 1) {
    const extractionNumber = extractionNumbers[index]
    const rawCandidateCode = extractionNumber.slice(-comparisonDigits).padStart(comparisonDigits, '0')
    const nearestResolution = findMatchByHouseComparison(rawCandidateCode)
    const resolvedCandidateCode = nearestResolution?.resolvedCode ?? rawCandidateCode
    const matchedPosition = positionByCode.get(resolvedCandidateCode) ?? null

    attempts.push({
      extractionIndex: extractionNumbers.length + index + 1,
      extractionNumber,
      comparisonDigits,
      rawCandidateCode,
      candidateCode: resolvedCandidateCode,
      nearestDirection: (nearestResolution?.nearestDirection ?? 'none') as ExtractionAttempt['nearestDirection'],
      nearestDistance: nearestResolution?.nearestDistance ?? null,
      matchedPosition,
    })

    if (matchedPosition !== null) {
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
    extractionIndex: extractionNumbers.length * 2 + 1,
    extractionNumber: extractionNumbers.join('-'),
    comparisonDigits,
    rawCandidateCode: '',
    candidateCode: fallbackCode,
    nearestDirection: 'none',
    nearestDistance: null,
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
    const uid = requireActiveUid(request.auth)

    await assertAdminRole(db, uid)

    const payload = asRecord(request.data) as PublishTopBuyersDrawInput
    const extractionNumbers = sanitizeExtractionNumbers(payload.extractionNumbers)
    const requestedDrawPrize = sanitizeString(payload.drawPrize)
    const requestedDrawPrizeKey = normalizeDrawPrizeKey(requestedDrawPrize)

    const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID, { forceRefresh: true })
    const configuredRankingLimit = readTopBuyersRankingLimitFromCampaign(campaignData)
    const rankingLimit = configuredRankingLimit
    const nowMs = Date.now()
    const rankingWindow = await resolveCurrentTopBuyersRankingWindow(db, nowMs)
    const drawDate = rankingWindow.weekId

    logger.info('publishTopBuyersDraw:start', {
      campaignId: CAMPAIGN_DOC_ID,
      uid,
      rankingLimit,
      weekId: rankingWindow.weekId,
      rankingWindowStartAtMs: rankingWindow.startMs,
      rankingWindowEndAtMs: rankingWindow.endMs,
      previousCycleEndAtMs: rankingWindow.previousCycleEndAtMs,
      extractionNumbersCount: extractionNumbers.length,
      requestedDrawPrize: requestedDrawPrize || null,
      requestedDrawPrizeKey: requestedDrawPrizeKey || null,
    })

    const mainPrize = sanitizeString(campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
    const secondPrize = sanitizeString(campaignData?.secondPrize)
    const bonusPrize = sanitizeString(campaignData?.bonusPrize)
    const availableDrawPrizes = buildAvailableDrawPrizes(campaignData)
    const blockedPrizes = [mainPrize]
    const blockedPrizeKeys = blockedPrizes.map((item) => normalizeDrawPrizeKey(item)).filter(Boolean)
    const availableDrawPrizeKeys = availableDrawPrizes.map((item) => normalizeDrawPrizeKey(item)).filter(Boolean)
    logger.info('publishTopBuyersDraw:validate-prize', {
      campaignId: CAMPAIGN_DOC_ID,
      uid,
      requestedDrawPrize: requestedDrawPrize || null,
      requestedDrawPrizeKey: requestedDrawPrizeKey || null,
      campaignMainPrize: mainPrize || null,
      campaignSecondPrize: secondPrize || null,
      campaignBonusPrize: bonusPrize || null,
      availableDrawPrizes,
      availableDrawPrizeKeys,
      blockedPrizes,
      blockedPrizeKeys,
    })

    let drawPrize: string
    try {
      drawPrize = sanitizeDrawPrize(payload.drawPrize, availableDrawPrizes, blockedPrizes)
    } catch (error) {
      if (error instanceof HttpsError) {
        logger.error('publishTopBuyersDraw:validate-prize-failed', {
          campaignId: CAMPAIGN_DOC_ID,
          uid,
          requestedDrawPrize: requestedDrawPrize || null,
          requestedDrawPrizeKey: requestedDrawPrizeKey || null,
          availableDrawPrizes,
          availableDrawPrizeKeys,
          blockedPrizes,
          blockedPrizeKeys,
          errorCode: error.code,
          errorMessage: error.message,
        })
      }
      throw error
    }

    const drawPrizeKey = normalizeDrawPrizeKey(drawPrize)
    const existingPrizeByKeySnapshot = drawPrizeKey
      ? await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .where('drawPrizeKey', '==', drawPrizeKey)
        .limit(1)
        .get()
      : null
    const existingPrizeSnapshot = existingPrizeByKeySnapshot && !existingPrizeByKeySnapshot.empty
      ? existingPrizeByKeySnapshot
      : await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .where('drawPrize', '==', drawPrize)
        .limit(1)
        .get()
    if (!existingPrizeSnapshot.empty) {
      logger.warn('publishTopBuyersDraw:prize-already-used', {
        campaignId: CAMPAIGN_DOC_ID,
        uid,
        drawPrize,
        drawPrizeKey: drawPrizeKey || null,
        existingDrawId: existingPrizeSnapshot.docs[0]?.id || null,
      })
      throw new HttpsError(
        'failed-precondition',
        'Este premio ja foi sorteado em uma rodada anterior e nao pode ser reutilizado.',
      )
    }

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
      const winnerTicketNumbers = rankingBuild.winnerTicketNumbersByUser.get(winner.userId) || []
      const winningTicketNumber = pickTopBuyersWinningTicketNumber({
        winnerTicketNumbers,
        attempts: winnerResolution.attempts,
        winningPosition: winnerResolution.winningPosition,
        comparisonDigits: winnerResolution.comparisonDigits,
        winningCode: winnerResolution.winningCode,
      })
      const exactCalculation = buildExactCalculationSnapshot({
        drawId: drawRef.id,
        comparisonDigits: winnerResolution.comparisonDigits,
        winningPosition: winnerResolution.winningPosition,
        attempts: winnerResolution.attempts,
        rankingSnapshot,
        ticketNumbersByUser: rankingBuild.winnerTicketNumbersByUser,
        winningTicketNumber,
      })

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
          photoURL: winner.photoURL,
        },
        winnerTicketNumbers,
        winningTicketNumber,
        rankingSnapshot,
        exactCalculation,
        publishedAtMs,
      }

      const batch = db.batch()

      batch.set(drawRef, {
        ...result,
        drawPrizeKey,
        publishedByUid: uid,
        publishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      batch.set(
        db.collection('campaigns').doc(CAMPAIGN_DOC_ID),
        {
          latestTopBuyersDraw: {
            ...result,
            drawPrizeKey,
            publishedByUid: uid,
            publishedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      await batch.commit()
      invalidateCampaignDocCache(CAMPAIGN_DOC_ID)
      try {
        await syncWeeklyTopBuyersRankingFromLatestDraw(db, {
          targetWeekId: result.weekId,
        })
      } catch (syncError) {
        logger.warn('publishTopBuyersDraw:weekly-ranking-sync-failed', {
          campaignId: CAMPAIGN_DOC_ID,
          uid,
          drawId: result.drawId,
          weekId: result.weekId,
          error: String(syncError),
        })
      }

      return result
    } catch (error) {
      if (error instanceof HttpsError) {
        logger.warn('publishTopBuyersDraw rejected', {
          campaignId: CAMPAIGN_DOC_ID,
          uid,
          drawPrize,
          drawPrizeKey: drawPrizeKey || null,
          rankingLimit,
          weekId: rankingWindow.weekId,
          errorCode: error.code,
          errorMessage: error.message,
        })
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
      const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
      const rawResult = asRecord(campaignData?.latestTopBuyersDraw)

      const drawId = sanitizeString(rawResult.drawId)
      const drawDate = sanitizeString(rawResult.drawDate)
      const drawPrize = sanitizeString(rawResult.drawPrize) || sanitizeString(campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
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
            rawCandidateCode: sanitizeString(item.rawCandidateCode),
            candidateCode: sanitizeString(item.candidateCode),
            nearestDirection: (item.nearestDirection === 'below'
              ? 'below'
              : item.nearestDirection === 'above'
                ? 'above'
                : 'none') as ExtractionAttempt['nearestDirection'],
            nearestDistance: Number.isFinite(Number(item.nearestDistance))
              ? Number(item.nearestDistance)
              : null,
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
      let winningTicketNumber = sanitizeString(rawResult.winningTicketNumber) || null
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
        photoURL: sanitizeString(winnerRecord.photoURL),
      }

      if (winnerTicketNumbers.length === 0 && winner.userId) {
        winnerTicketNumbers = await readWinnerTicketNumbersFromOrders(
          db,
          winner.userId,
          weekStartAtMs,
          weekEndAtMs,
        )
      }
      if (!winningTicketNumber) {
        winningTicketNumber = pickTopBuyersWinningTicketNumber({
          winnerTicketNumbers,
          attempts,
          winningPosition,
          comparisonDigits,
          winningCode,
        })
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
            photoURL: sanitizeString(item.photoURL),
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
          winningTicketNumber,
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

export function createGetLatestTopBuyersDrawExactCalculationHandler(db: Firestore) {
  return async (request: { data?: unknown }): Promise<GetLatestTopBuyersDrawExactCalculationOutput> => {
    try {
      const payload = asRecord(request.data) as GetLatestTopBuyersDrawExactCalculationInput
      const requestedDrawId = sanitizeString(payload.drawId)
      logger.info('getLatestTopBuyersDrawExactCalculation:start', {
        requestedDrawId: requestedDrawId || null,
      })

      const loadRawResultByDrawId = async (drawIdToLoad: string) => {
        const snapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION).doc(drawIdToLoad).get()
        if (!snapshot.exists) {
          logger.warn('getLatestTopBuyersDrawExactCalculation:draw-not-found', {
            drawId: drawIdToLoad,
          })
          return null
        }

        const raw = asRecord(snapshot.data())
        logger.info('getLatestTopBuyersDrawExactCalculation:draw-loaded', {
          drawId: sanitizeString(raw.drawId) || drawIdToLoad,
          source: TOP_BUYERS_DRAW_HISTORY_COLLECTION,
          hasAttempts: Array.isArray(raw.attempts),
          hasRankingSnapshot: Array.isArray(raw.rankingSnapshot),
        })
        return {
          ...raw,
          drawId: sanitizeString(raw.drawId) || drawIdToLoad,
        }
      }

      let rawResult: Record<string, unknown> = {}
      if (requestedDrawId) {
        rawResult = await loadRawResultByDrawId(requestedDrawId) || {}
      } else {
        const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
        rawResult = asRecord(campaignData?.latestTopBuyersDraw)
        const latestDrawId = sanitizeString(rawResult.drawId)
        logger.info('getLatestTopBuyersDrawExactCalculation:campaign-latest', {
          latestDrawId: latestDrawId || null,
          hasExactCalculation: Object.keys(asRecord(rawResult.exactCalculation)).length > 0,
        })

        if (latestDrawId && Object.keys(asRecord(rawResult.exactCalculation)).length === 0) {
          rawResult = await loadRawResultByDrawId(latestDrawId) || rawResult
        }
      }

      const drawId = sanitizeString(rawResult.drawId) || sanitizeString(requestedDrawId) || null
      const parsedSnapshot = parseExactCalculationSnapshot(rawResult, requestedDrawId)
      if (!parsedSnapshot) {
        logger.warn('getLatestTopBuyersDrawExactCalculation:missing-snapshot', {
          requestedDrawId: requestedDrawId || null,
          resolvedDrawId: drawId,
        })
        return {
          hasResult: false,
          drawId,
          result: null,
        }
      }

      return {
        hasResult: true,
        drawId: parsedSnapshot.drawId,
        result: parsedSnapshot,
      }
    } catch (error) {
      logger.error('getLatestTopBuyersDrawExactCalculation failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o calculo exato agora.')
    }
  }
}

function parseAttempts(value: unknown): ExtractionAttempt[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => asRecord(item))
    .map((item) => ({
      extractionIndex: Number(item.extractionIndex),
      extractionNumber: sanitizeString(item.extractionNumber),
      comparisonDigits: Number(item.comparisonDigits),
      rawCandidateCode: sanitizeString(item.rawCandidateCode),
      candidateCode: sanitizeString(item.candidateCode),
      nearestDirection: (item.nearestDirection === 'below'
        ? 'below'
        : item.nearestDirection === 'above'
          ? 'above'
          : 'none') as ExtractionAttempt['nearestDirection'],
      nearestDistance: Number.isFinite(Number(item.nearestDistance))
        ? Number(item.nearestDistance)
        : null,
      matchedPosition: Number.isInteger(Number(item.matchedPosition))
        ? Number(item.matchedPosition)
        : null,
    }))
    .filter((item) => Number.isInteger(item.extractionIndex) && item.extractionIndex > 0 && item.extractionNumber)
}

function resolveWinningExtractionNumber(
  attempts: ExtractionAttempt[],
  extractionNumbers: string[],
  winningPosition: number,
): string | null {
  const winnerAttempt = attempts.find((attempt) => attempt.matchedPosition === winningPosition)
  if (winnerAttempt?.extractionNumber) {
    return winnerAttempt.extractionNumber
  }

  if (extractionNumbers.length > 0) {
    return extractionNumbers[0] || null
  }

  return null
}

function parseHistoryResultSummary(
  raw: Record<string, unknown>,
  documentId: string,
  fallbackMainPrize: string,
  options?: { maskWinnerName?: boolean },
): TopBuyersDrawResult | null {
  const drawId = sanitizeString(raw.drawId) || documentId
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
  const attempts = parseAttempts(raw.attempts)
  const winningPosition = Number(raw.winningPosition)
  const winningCode = sanitizeString(raw.winningCode)
  const resolvedBy = raw.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy'
  const publishedAtMs = Number(raw.publishedAtMs)
  const winnerRecord = asRecord(raw.winner)
  let winningTicketNumber = sanitizeString(raw.winningTicketNumber) || null
  const storedWinnerTicketNumbers = Array.isArray(raw.winnerTicketNumbers)
    ? raw.winnerTicketNumbers
      .map((item) => sanitizeString(item))
      .filter(Boolean)
      .slice(0, 300)
    : []
  const winnerUid = sanitizeString(winnerRecord.userId)
  const winnerName = sanitizeString(winnerRecord.name) || 'Participante'
  const winner: TopBuyersDrawWinner = {
    userId: winnerUid,
    name: options?.maskWinnerName ? formatPublicName(winnerName, winnerUid) : winnerName,
    cotas: Number(winnerRecord.cotas) || 0,
    pos: Number(winnerRecord.pos) || winningPosition,
    photoURL: sanitizeString(winnerRecord.photoURL),
  }

  if (!winningTicketNumber && storedWinnerTicketNumbers.length > 0) {
    winningTicketNumber = pickTopBuyersWinningTicketNumber({
      winnerTicketNumbers: storedWinnerTicketNumbers,
      attempts,
      winningPosition,
      comparisonDigits,
      winningCode,
    })
  }

  const resolvedExtractionNumber = sanitizeString(raw.resolvedExtractionNumber)
    || resolveWinningExtractionNumber(attempts, extractionNumbers, winningPosition)

  const normalizedAttempts = resolvedExtractionNumber && attempts.length === 0
    ? [{
      extractionIndex: 1,
      extractionNumber: resolvedExtractionNumber,
      comparisonDigits,
      rawCandidateCode: winningCode,
      candidateCode: winningCode,
      nearestDirection: 'none' as const,
      nearestDistance: null,
      matchedPosition: winningPosition || null,
    }]
    : attempts

  if (
    !drawId ||
    !drawDate ||
    !drawPrize ||
    !weekId ||
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
    !Number.isFinite(publishedAtMs) ||
    !winner.userId
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
    attempts: normalizedAttempts,
    winningPosition,
    winningCode,
    resolvedBy,
    winner,
    winnerTicketNumbers: [],
    winningTicketNumber,
    rankingSnapshot: [],
    publishedAtMs,
  }
}

export function createGetTopBuyersDrawHistoryHandler(db: Firestore) {
  return async (request: {
    auth?: { uid?: string | null } | null
    data?: unknown
  }): Promise<GetTopBuyersDrawHistoryOutput> => {
    const uid = requireActiveUid(request.auth)
    const payload = asRecord(request.data) as GetTopBuyersDrawHistoryInput
    const historyLimit = sanitizeHistoryLimit(
      payload.limit,
      MAX_ADMIN_HISTORY_LIMIT,
      DEFAULT_ADMIN_HISTORY_LIMIT,
    )
    const cursor = decodeHistoryCursor(payload.cursor)

    await assertAdminRole(db, uid)

    try {
      const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
      const fallbackMainPrize = sanitizeString(campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
      let historyQuery = db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .orderBy('publishedAtMs', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')

      if (cursor) {
        historyQuery = historyQuery.startAfter(cursor.publishedAtMs, cursor.docId)
      }

      const historySnapshot = await historyQuery
        .limit(historyLimit + 1)
        .get()
      const hasMore = historySnapshot.docs.length > historyLimit
      const pageDocs = hasMore ? historySnapshot.docs.slice(0, historyLimit) : historySnapshot.docs

      const rawResults = pageDocs
        .map((documentSnapshot) => parseHistoryResultSummary(
          asRecord(documentSnapshot.data()),
          documentSnapshot.id,
          fallbackMainPrize,
        ))

      const results = dedupeResultsByPrize(
        rawResults.filter((item): item is TopBuyersDrawResult => Boolean(item)),
      )

      const lastDoc = pageDocs[pageDocs.length - 1]
      const lastPublishedAtMs = Number(lastDoc?.get('publishedAtMs'))

      return {
        results,
        hasMore,
        nextCursor: hasMore && lastDoc
          ? encodeHistoryCursor(lastPublishedAtMs, lastDoc.id)
          : null,
      }
    } catch (error) {
      logger.error('getTopBuyersDrawHistory failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o historico de resultados.')
    }
  }
}

export function createGetPublicTopBuyersDrawHistoryHandler(db: Firestore) {
  return async (request: { data?: unknown }): Promise<GetPublicTopBuyersDrawHistoryOutput> => {
    const payload = asRecord(request.data) as GetPublicTopBuyersDrawHistoryInput
    const historyLimit = sanitizeHistoryLimit(
      payload.limit,
      MAX_PUBLIC_HISTORY_LIMIT,
      DEFAULT_PUBLIC_HISTORY_LIMIT,
    )

    try {
      const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
      const fallbackMainPrize = sanitizeString(campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
      const historySnapshot = await db.collection(TOP_BUYERS_DRAW_HISTORY_COLLECTION)
        .orderBy('publishedAtMs', 'desc')
        .limit(historyLimit)
        .get()

      const rawResults = historySnapshot.docs
        .map((documentSnapshot) => parseHistoryResultSummary(
          asRecord(documentSnapshot.data()),
          documentSnapshot.id,
          fallbackMainPrize,
          { maskWinnerName: true },
        ))

      const results = dedupeResultsByPrize(
        rawResults.filter((item): item is TopBuyersDrawResult => Boolean(item)),
      )

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
    const uid = requireActiveUid(request.auth)

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
      const winsByPrize = new Map<string, (typeof wins)[number]>()
      for (const item of wins) {
        const key = normalizeDrawPrizeKey(item.drawPrize) || item.drawId
        const existing = winsByPrize.get(key)
        if (!existing || item.publishedAtMs > existing.publishedAtMs) {
          winsByPrize.set(key, item)
        }
      }
      const normalizedWins = Array.from(winsByPrize.values())

      if (normalizedWins.length === 0) {
        return {
          hasWins: false,
          winsCount: 0,
          latestWin: null,
        }
      }

      const latestWin = [...normalizedWins].sort((left, right) => right.publishedAtMs - left.publishedAtMs)[0]

      return {
        hasWins: true,
        winsCount: normalizedWins.length,
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
