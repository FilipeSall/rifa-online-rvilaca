import { FieldValue, Timestamp, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID } from './constants.js'
import { getCampaignDocCached, invalidateCampaignDocCache } from './campaignDocCache.js'
import { buildMainRaffleDrawPrizeValues } from './campaignPrizes.js'
import {
  buildChunkBoundsForNumber,
  getChunkNumberView,
  getChunkPaidMeta,
  getNumberChunkRef,
  markNumberAsAwarded,
  NUMBER_CHUNK_SIZE,
  readChunkStateFromDoc,
  type NumberChunkRuntimeState,
  writeChunkStateToDoc,
} from './numberChunkStore.js'
import { readCampaignNumberRange } from './numberStateStore.js'
import { asRecord, readTimestampMillis, requireActiveUid, sanitizeString } from './shared.js'
import {
  resolveWinnerByPrefixCycleV2,
  type DrawComparisonMode,
  type DrawComparisonSide,
  type DrawRuleVersion,
  type RankedParticipant,
  type V2ResolutionAttempt,
} from './drawV2Engine.js'

const MAIN_RAFFLE_DRAW_HISTORY_COLLECTION = 'mainRaffleDrawResults'
const EXTRACTION_COUNT = 5
const EXTRACTION_DIGITS = 6
const MAX_EXTRACTION_VALUE = 999_999
const DEFAULT_PUBLIC_MAIN_HISTORY_LIMIT = 30
const MAX_PUBLIC_MAIN_HISTORY_LIMIT = 50
const CHUNK_FETCH_BATCH_SIZE = 12
const ELIGIBLE_CHUNK_QUERY_LIMIT = 60

interface PublishMainRaffleDrawInput {
  extractionNumbers?: Array<number | string>
  extractionIndex?: number
  drawPrize?: string
  drawDate?: string
}

interface MainRaffleWinner {
  userId: string
  name: string
  photoURL?: string
}

interface MainRaffleDrawAttempt {
  extractionIndex: number
  attemptIndex?: number
  sourceExtractionIndex?: number | null
  extractionNumber: string
  comparisonDigits: number
  phase?: 'exact' | 'nearest' | 'contingency'
  rawCandidateCode: string
  candidateCode: string
  nearestDirection: 'none' | 'below' | 'above'
  nearestDistance: number | null
  matchedPosition: number | null
  matchedUserId?: string | null
  matchedTicketNumber?: string | null
}

interface MainRaffleRankingItem {
  pos: number
  userId: string
  name: string
  cotas: number
  firstPurchaseAtMs: number
  photoURL: string
}

interface MainRaffleDrawResult {
  campaignId: string
  drawId: string
  drawDate: string
  drawPrize: string
  ruleVersion: DrawRuleVersion
  comparisonMode: DrawComparisonMode
  comparisonSide: DrawComparisonSide
  extractionNumbers: string[]
  participantCount: number
  comparisonDigits: number
  attempts: MainRaffleDrawAttempt[]
  winningPosition: number
  winningCode: string
  winningTicketNumber: string | null
  resolvedBy: 'federal_extraction' | 'redundancy'
  rankingSnapshot: MainRaffleRankingItem[]
  selectedExtractionIndex: number
  selectedExtractionNumber: string
  raffleRangeStart: number
  raffleRangeEnd: number
  raffleTotalNumbers: number
  moduloTargetOffset: number
  targetNumber: number
  targetNumberFormatted: string
  winningNumber: number
  winningNumberFormatted: string
  fallbackDirection: 'none' | 'above' | 'below'
  winner: MainRaffleWinner
  publishedAtMs: number
}

interface GetLatestMainRaffleDrawOutput {
  hasResult: boolean
  result: MainRaffleDrawResult | null
}

interface GetMainRaffleDrawHistoryOutput {
  results: MainRaffleDrawResult[]
}

interface GetMainRaffleDrawHistoryInput {
  limit?: number
}

type RankingAggregate = {
  cotas: number
  firstPurchaseAtMs: number
  ticketNumbers: Set<number>
}

type MainRaffleRankingBuildOutput = {
  rankingSnapshot: MainRaffleRankingItem[]
  ticketNumbersByUser: Map<string, string[]>
}

const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000

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

function buildAvailableDrawPrizes(campaignData: DocumentData | undefined): string[] {
  return buildMainRaffleDrawPrizeValues(campaignData)
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

function sanitizeOptionalDrawDate(value: unknown): string {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return formatBrazilDateId(Date.now())
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpsError('invalid-argument', 'drawDate deve estar no formato YYYY-MM-DD.')
  }

  return normalized
}

function sanitizeHistoryLimit(value: unknown, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.max(1, parsed), max)
}

function parseAttemptPhase(value: unknown): MainRaffleDrawAttempt['phase'] {
  if (value === 'nearest') {
    return 'nearest'
  }
  if (value === 'contingency') {
    return 'contingency'
  }
  return 'exact'
}

function parseNearestDirection(value: unknown): MainRaffleDrawAttempt['nearestDirection'] {
  if (value === 'below') {
    return 'below'
  }
  if (value === 'above') {
    return 'above'
  }
  return 'none'
}

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem publicar o resultado.')
  }
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

async function readAlreadyAwardedMainNumbers(db: Firestore): Promise<Set<number>> {
  const awardedNumbers = new Set<number>()
  const snapshot = await db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION)
    .select('winningNumber', 'winningNumberFormatted', 'winningTicketNumber')
    .limit(3000)
    .get()

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const winningNumber = Number(data.winningNumber)
    if (Number.isInteger(winningNumber) && winningNumber > 0) {
      awardedNumbers.add(winningNumber)
    }

    const winningTicketNumber = Number(String(data.winningTicketNumber || '').replace(/\D/g, ''))
    if (Number.isInteger(winningTicketNumber) && winningTicketNumber > 0) {
      awardedNumbers.add(winningTicketNumber)
    }

    const winningNumberFormatted = Number(String(data.winningNumberFormatted || '').replace(/\D/g, ''))
    if (Number.isInteger(winningNumberFormatted) && winningNumberFormatted > 0) {
      awardedNumbers.add(winningNumberFormatted)
    }
  }

  return awardedNumbers
}

async function buildMainRaffleRankingSnapshot(db: Firestore, raffleRange: {
  start: number
  end: number
}): Promise<MainRaffleRankingBuildOutput> {
  const awardedNumbers = await readAlreadyAwardedMainNumbers(db)
  const ordersSnapshot = await db.collection('orders')
    .where('status', '==', 'paid')
    .where('type', '==', 'deposit')
    .where('campaignId', '==', CAMPAIGN_DOC_ID)
    .select('userId', 'reservedNumbers', 'quantity', 'createdAt')
    .get()

  const aggregates = new Map<string, RankingAggregate>()
  for (const order of ordersSnapshot.docs) {
    const data = order.data()
    const userId = sanitizeString(data.userId)
    if (!userId) {
      continue
    }

    const quantity = readOrderQuantity(data)
    if (quantity <= 0) {
      continue
    }

    const purchaseAtMs = Number(readTimestampMillis(data.createdAt))
    if (!Number.isFinite(purchaseAtMs) || purchaseAtMs <= 0) {
      continue
    }

    const aggregate = aggregates.get(userId) || {
      cotas: 0,
      firstPurchaseAtMs: purchaseAtMs,
      ticketNumbers: new Set<number>(),
    }
    aggregate.cotas += quantity
    aggregate.firstPurchaseAtMs = Math.min(aggregate.firstPurchaseAtMs, purchaseAtMs)

    for (const number of readOrderNumbers(data)) {
      if (number < raffleRange.start || number > raffleRange.end) {
        continue
      }
      if (awardedNumbers.has(number)) {
        continue
      }
      aggregate.ticketNumbers.add(number)
    }

    aggregates.set(userId, aggregate)
  }

  const sorted = Array.from(aggregates.entries())
    .filter(([, aggregate]) => aggregate.ticketNumbers.size > 0)
    .sort((left, right) => {
      if (right[1].cotas !== left[1].cotas) {
        return right[1].cotas - left[1].cotas
      }

      if (left[1].firstPurchaseAtMs !== right[1].firstPurchaseAtMs) {
        return left[1].firstPurchaseAtMs - right[1].firstPurchaseAtMs
      }

      return left[0].localeCompare(right[0])
    })

  const userSnapshots = await Promise.all(sorted.map(([uid]) => db.collection('users').doc(uid).get()))

  const rankingSnapshot: MainRaffleRankingItem[] = sorted.map(([uid, aggregate], index) => {
    const userData = userSnapshots[index]?.data() || {}
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

  const ticketNumbersByUser = new Map<string, string[]>(
    sorted.map(([uid, aggregate]) => [
      uid,
      Array.from(aggregate.ticketNumbers)
        .sort((left, right) => left - right)
        .map((number) => String(number).padStart(7, '0'))
        .slice(0, 500),
    ]),
  )

  return {
    rankingSnapshot,
    ticketNumbersByUser,
  }
}

function resolveMainRaffleByRuleV2(params: {
  extractionNumbers: string[]
  rankingSnapshot: MainRaffleRankingItem[]
  ticketNumbersByUser: Map<string, string[]>
}) {
  const rankingEntries: RankedParticipant[] = params.rankingSnapshot.map((item) => ({
    pos: item.pos,
    userId: item.userId,
    tickets: params.ticketNumbersByUser.get(item.userId) || [],
  }))

  const resolution = resolveWinnerByPrefixCycleV2(params.extractionNumbers, rankingEntries)
  if (!resolution) {
    return null
  }

  const attempts: MainRaffleDrawAttempt[] = resolution.attempts.map((attempt: V2ResolutionAttempt) => ({
    extractionIndex: attempt.extractionIndex,
    attemptIndex: attempt.attemptIndex,
    sourceExtractionIndex: attempt.sourceExtractionIndex,
    extractionNumber: attempt.extractionNumber,
    comparisonDigits: attempt.comparisonDigits,
    phase: attempt.phase,
    rawCandidateCode: attempt.rawCandidateCode,
    candidateCode: attempt.candidateCode,
    nearestDirection: attempt.nearestDirection,
    nearestDistance: attempt.nearestDistance,
    matchedPosition: attempt.matchedPosition,
    matchedUserId: attempt.matchedUserId,
    matchedTicketNumber: attempt.matchedTicketNumber,
  }))

  return {
    ...resolution,
    attempts,
  }
}

type ResolvedCandidate = {
  number: number
  chunkStart: number
  chunkState: NumberChunkRuntimeState
  ownerUid: string
  paidAtMs: number | null
  fallbackDirection: 'none' | 'above' | 'below'
}

function chooseDirectionalCandidate(
  direction: 'above' | 'below',
  current: ResolvedCandidate | null,
  incoming: ResolvedCandidate | null,
): ResolvedCandidate | null {
  if (!incoming) {
    return current
  }
  if (!current) {
    return incoming
  }

  if (direction === 'above') {
    return incoming.number < current.number ? incoming : current
  }

  return incoming.number > current.number ? incoming : current
}

function findCandidateInChunkRange(params: {
  chunkState: NumberChunkRuntimeState
  chunkStart: number
  startNumber: number
  endNumber: number
  direction: 'above' | 'below'
  fallbackDirection: 'above' | 'below'
}): ResolvedCandidate | null {
  const { chunkState, chunkStart, startNumber, endNumber, direction, fallbackDirection } = params
  const step = direction === 'above' ? 1 : -1

  for (let number = startNumber; direction === 'above' ? number <= endNumber : number >= endNumber; number += step) {
    const view = getChunkNumberView(chunkState, number)
    if (view.status !== 'pago') {
      continue
    }

    const paidMeta = getChunkPaidMeta(chunkState, number)
    if (!paidMeta?.ownerUid || paidMeta.awardedDrawId) {
      continue
    }

    return {
      number,
      chunkStart,
      chunkState,
      ownerUid: paidMeta.ownerUid,
      paidAtMs: paidMeta.paidAtMs,
      fallbackDirection,
    }
  }

  return null
}

async function findNearestCandidateByDirection(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    targetNumber: number
    rangeStart: number
    rangeEnd: number
    direction: 'above' | 'below'
    nowMs: number
    chunkStateCache: Map<number, NumberChunkRuntimeState>
  },
): Promise<ResolvedCandidate | null> {
  const { campaignId, targetNumber, rangeStart, rangeEnd, direction, nowMs, chunkStateCache } = params
  const targetBounds = buildChunkBoundsForNumber({
    campaignId,
    number: targetNumber,
    rangeStart,
    rangeEnd,
  })
  const searchedChunkStarts = new Set<number>()

  const metadataChunkStarts = await listEligibleChunkStartsByDirection(transaction, db, {
    campaignId,
    rangeStart,
    rangeEnd,
    targetChunkStart: targetBounds.chunkStart,
    direction,
  })
  const prioritizedChunkStarts = [targetBounds.chunkStart, ...metadataChunkStarts]
    .filter((chunkStart, index, list) => list.indexOf(chunkStart) === index)
  for (const chunkStart of prioritizedChunkStarts) {
    searchedChunkStarts.add(chunkStart)
  }

  const indexedCandidate = await findCandidateByChunkStarts(transaction, db, {
    campaignId,
    targetNumber,
    rangeStart,
    rangeEnd,
    direction,
    fallbackDirection: direction,
    chunkStarts: prioritizedChunkStarts,
    nowMs,
    chunkStateCache,
  })
  if (indexedCandidate) {
    return indexedCandidate
  }

  const fallbackChunkStarts: number[] = []
  if (direction === 'above') {
    for (let chunkStart = targetBounds.chunkStart; chunkStart <= rangeEnd; chunkStart += NUMBER_CHUNK_SIZE) {
      if (!searchedChunkStarts.has(chunkStart)) {
        fallbackChunkStarts.push(chunkStart)
      }
    }
  } else {
    for (let chunkStart = targetBounds.chunkStart; chunkStart >= rangeStart; chunkStart -= NUMBER_CHUNK_SIZE) {
      if (!searchedChunkStarts.has(chunkStart)) {
        fallbackChunkStarts.push(chunkStart)
      }
    }
  }

  return findCandidateByChunkStarts(transaction, db, {
    campaignId,
    targetNumber,
    rangeStart,
    rangeEnd,
    direction,
    fallbackDirection: direction,
    chunkStarts: fallbackChunkStarts,
    nowMs,
    chunkStateCache,
  })
}

async function listEligibleChunkStartsByDirection(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    rangeStart: number
    rangeEnd: number
    targetChunkStart: number
    direction: 'above' | 'below'
  },
): Promise<number[]> {
  try {
    let query = db.collection('numberChunks')
      .where('campaignId', '==', params.campaignId)
      .where('hasEligiblePaidUnawarded', '==', true)

    if (params.direction === 'above') {
      query = query
        .where('chunkStart', '>', params.targetChunkStart)
        .where('chunkStart', '<=', params.rangeEnd)
        .orderBy('chunkStart', 'asc')
    } else {
      query = query
        .where('chunkStart', '>=', params.rangeStart)
        .where('chunkStart', '<', params.targetChunkStart)
        .orderBy('chunkStart', 'desc')
    }

    const snapshots = await transaction.get(query.limit(ELIGIBLE_CHUNK_QUERY_LIMIT))
    const chunkStarts: number[] = []

    for (const doc of snapshots.docs) {
      const data = doc.data()
      const chunkStart = Number(data.chunkStart)
      if (!Number.isInteger(chunkStart) || chunkStart < params.rangeStart || chunkStart > params.rangeEnd) {
        continue
      }
      chunkStarts.push(chunkStart)
    }

    return chunkStarts
  } catch (error) {
    logger.warn('listEligibleChunkStartsByDirection fallback to sequential scan', {
      direction: params.direction,
      error: String(error),
    })
    return []
  }
}

async function loadChunkStatesByStarts(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    rangeStart: number
    rangeEnd: number
    chunkStarts: number[]
    nowMs: number
    chunkStateCache: Map<number, NumberChunkRuntimeState>
  },
) {
  const toFetch = params.chunkStarts.filter((chunkStart) => !params.chunkStateCache.has(chunkStart))
  if (toFetch.length === 0) {
    return
  }

  const refs = toFetch.map((chunkStart) => getNumberChunkRef(db, params.campaignId, chunkStart))
  const snapshots = await transaction.getAll(...refs)

  for (let index = 0; index < toFetch.length; index += 1) {
    const chunkStart = toFetch[index]
    const snapshot = snapshots[index]
    const bounds = buildChunkBoundsForNumber({
      campaignId: params.campaignId,
      number: chunkStart,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
    })
    const chunkState = readChunkStateFromDoc({
      bounds,
      docData: snapshot.exists ? (snapshot.data() || null) : null,
      nowMs: params.nowMs,
    })
    params.chunkStateCache.set(chunkStart, chunkState)
  }
}

async function findCandidateByChunkStarts(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    targetNumber: number
    rangeStart: number
    rangeEnd: number
    direction: 'above' | 'below'
    fallbackDirection: 'above' | 'below'
    chunkStarts: number[]
    nowMs: number
    chunkStateCache: Map<number, NumberChunkRuntimeState>
  },
): Promise<ResolvedCandidate | null> {
  const { campaignId, targetNumber, rangeStart, rangeEnd, direction, fallbackDirection } = params
  const targetBounds = buildChunkBoundsForNumber({
    campaignId,
    number: targetNumber,
    rangeStart,
    rangeEnd,
  })

  for (let offset = 0; offset < params.chunkStarts.length; offset += CHUNK_FETCH_BATCH_SIZE) {
    const batchChunkStarts = params.chunkStarts.slice(offset, offset + CHUNK_FETCH_BATCH_SIZE)
    await loadChunkStatesByStarts(transaction, db, {
      campaignId,
      rangeStart,
      rangeEnd,
      chunkStarts: batchChunkStarts,
      nowMs: params.nowMs,
      chunkStateCache: params.chunkStateCache,
    })

    for (const chunkStart of batchChunkStarts) {
      const chunkState = params.chunkStateCache.get(chunkStart)
      if (!chunkState) {
        continue
      }

      const bounds = buildChunkBoundsForNumber({
        campaignId,
        number: chunkStart,
        rangeStart,
        rangeEnd,
      })

      const startNumber = direction === 'above'
        ? (chunkStart === targetBounds.chunkStart ? Math.max(targetNumber + 1, bounds.chunkStart) : bounds.chunkStart)
        : (chunkStart === targetBounds.chunkStart ? Math.min(targetNumber - 1, bounds.chunkEnd) : bounds.chunkEnd)
      const endNumber = direction === 'above' ? bounds.chunkEnd : bounds.chunkStart

      if ((direction === 'above' && startNumber > endNumber) || (direction === 'below' && startNumber < endNumber)) {
        continue
      }

      const candidate = findCandidateInChunkRange({
        chunkState,
        chunkStart: bounds.chunkStart,
        startNumber,
        endNumber,
        direction,
        fallbackDirection,
      })
      if (candidate) {
        return candidate
      }
    }
  }

  return null
}

async function findEligiblePaidNumber(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    targetNumber: number
    rangeStart: number
    rangeEnd: number
  },
): Promise<ResolvedCandidate | null> {
  const { campaignId, targetNumber, rangeStart, rangeEnd } = params
  const nowMs = Date.now()
  const chunkStateCache = new Map<number, NumberChunkRuntimeState>()
  const exactBounds = buildChunkBoundsForNumber({
    campaignId,
    number: targetNumber,
    rangeStart,
    rangeEnd,
  })
  await loadChunkStatesByStarts(transaction, db, {
    campaignId,
    rangeStart,
    rangeEnd,
    chunkStarts: [exactBounds.chunkStart],
    nowMs,
    chunkStateCache,
  })
  const exactChunkState = chunkStateCache.get(exactBounds.chunkStart)
  if (!exactChunkState) {
    return null
  }

  const exactView = getChunkNumberView(exactChunkState, targetNumber)
  const exactPaidMeta = getChunkPaidMeta(exactChunkState, targetNumber)
  if (exactView.status === 'pago' && exactPaidMeta?.ownerUid && !exactPaidMeta.awardedDrawId) {
    return {
      number: targetNumber,
      chunkStart: exactBounds.chunkStart,
      chunkState: exactChunkState,
      ownerUid: exactPaidMeta.ownerUid,
      paidAtMs: exactPaidMeta.paidAtMs,
      fallbackDirection: 'none',
    }
  }

  let aboveCandidate: ResolvedCandidate | null = null
  let belowCandidate: ResolvedCandidate | null = null

  const above = await findNearestCandidateByDirection(transaction, db, {
    campaignId,
    targetNumber,
    rangeStart,
    rangeEnd,
    direction: 'above',
    nowMs,
    chunkStateCache,
  })
  aboveCandidate = chooseDirectionalCandidate('above', aboveCandidate, above)

  const below = await findNearestCandidateByDirection(transaction, db, {
    campaignId,
    targetNumber,
    rangeStart,
    rangeEnd,
    direction: 'below',
    nowMs,
    chunkStateCache,
  })
  belowCandidate = chooseDirectionalCandidate('below', belowCandidate, below)

  if (belowCandidate && aboveCandidate) {
    const distanceBelow = targetNumber - belowCandidate.number
    const distanceAbove = aboveCandidate.number - targetNumber

    if (distanceBelow !== distanceAbove) {
      return distanceBelow < distanceAbove ? belowCandidate : aboveCandidate
    }

    const belowPaidAtMs = belowCandidate.paidAtMs
    const abovePaidAtMs = aboveCandidate.paidAtMs

    // Empate por distancia: prioriza quem comprou primeiro (paidAt menor).
    if (
      Number.isFinite(belowPaidAtMs)
      && Number.isFinite(abovePaidAtMs)
      && belowPaidAtMs !== abovePaidAtMs
    ) {
      return (belowPaidAtMs as number) < (abovePaidAtMs as number) ? belowCandidate : aboveCandidate
    }

    // Fallback deterministico para empate absoluto.
    return belowCandidate
  }

  if (belowCandidate) {
    return belowCandidate
  }

  if (aboveCandidate) {
    return aboveCandidate
  }

  return null
}

function parseMainRaffleResult(raw: Record<string, unknown> | null | undefined): MainRaffleDrawResult | null {
  if (!raw) {
    return null
  }

  const winnerRaw = asRecord(raw.winner)
  const ruleVersion = raw.ruleVersion === 'v2_prefix_cycle' ? 'v2_prefix_cycle' : 'legacy_modulo'
  const comparisonMode = raw.comparisonMode === 'ticket_suffix'
    ? 'ticket_suffix'
    : raw.comparisonMode === 'ticket_prefix'
      ? 'ticket_prefix'
      : 'legacy_modulo'
  const comparisonSide = raw.comparisonSide === 'left_prefix' ? 'left_prefix' : 'right_suffix'
  const extractionNumbers = Array.isArray(raw.extractionNumbers)
    ? raw.extractionNumbers.map((item) => sanitizeString(item))
    : []
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts
      .map((item) => asRecord(item))
      .map((item) => ({
        extractionIndex: Number(item.extractionIndex),
        attemptIndex: Number.isInteger(Number(item.attemptIndex)) ? Number(item.attemptIndex) : Number(item.extractionIndex),
        sourceExtractionIndex: Number.isInteger(Number(item.sourceExtractionIndex)) ? Number(item.sourceExtractionIndex) : null,
        extractionNumber: sanitizeString(item.extractionNumber),
        comparisonDigits: Number(item.comparisonDigits),
        phase: parseAttemptPhase(item.phase),
        rawCandidateCode: sanitizeString(item.rawCandidateCode),
        candidateCode: sanitizeString(item.candidateCode),
        nearestDirection: parseNearestDirection(item.nearestDirection),
        nearestDistance: Number.isFinite(Number(item.nearestDistance)) ? Number(item.nearestDistance) : null,
        matchedPosition: Number.isInteger(Number(item.matchedPosition)) ? Number(item.matchedPosition) : null,
        matchedUserId: sanitizeString(item.matchedUserId) || null,
        matchedTicketNumber: sanitizeString(item.matchedTicketNumber) || null,
      }))
      .filter((item) => Number.isInteger(item.extractionIndex) && item.extractionIndex > 0 && item.extractionNumber)
    : []
  const rankingSnapshot = Array.isArray(raw.rankingSnapshot)
    ? raw.rankingSnapshot
      .map((item) => asRecord(item))
      .map((item) => ({
        pos: Number(item.pos),
        userId: sanitizeString(item.userId),
        name: sanitizeString(item.name),
        cotas: Number(item.cotas),
        firstPurchaseAtMs: Number(item.firstPurchaseAtMs),
        photoURL: sanitizeString(item.photoURL),
      }))
      .filter((item) => Number.isInteger(item.pos) && item.pos > 0 && item.userId)
    : []

  const result: MainRaffleDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    drawDate: sanitizeString(raw.drawDate),
    drawPrize: sanitizeString(raw.drawPrize),
    ruleVersion,
    comparisonMode,
    comparisonSide,
    extractionNumbers,
    participantCount: Number(raw.participantCount) || rankingSnapshot.length,
    comparisonDigits: Number(raw.comparisonDigits),
    attempts,
    winningPosition: Number(raw.winningPosition),
    winningCode: sanitizeString(raw.winningCode),
    winningTicketNumber: sanitizeString(raw.winningTicketNumber) || null,
    resolvedBy: raw.resolvedBy === 'federal_extraction' ? 'federal_extraction' : 'redundancy',
    rankingSnapshot,
    selectedExtractionIndex: Number(raw.selectedExtractionIndex),
    selectedExtractionNumber: sanitizeString(raw.selectedExtractionNumber),
    raffleRangeStart: Number(raw.raffleRangeStart),
    raffleRangeEnd: Number(raw.raffleRangeEnd),
    raffleTotalNumbers: Number(raw.raffleTotalNumbers),
    moduloTargetOffset: Number(raw.moduloTargetOffset),
    targetNumber: Number(raw.targetNumber),
    targetNumberFormatted: sanitizeString(raw.targetNumberFormatted),
    winningNumber: Number(raw.winningNumber),
    winningNumberFormatted: sanitizeString(raw.winningNumberFormatted),
    fallbackDirection: raw.fallbackDirection === 'above'
      ? 'above'
      : raw.fallbackDirection === 'below'
        ? 'below'
        : 'none',
    winner: {
      userId: sanitizeString(winnerRaw.userId),
      name: sanitizeString(winnerRaw.name) || 'Participante',
      photoURL: sanitizeString(winnerRaw.photoURL),
    },
    publishedAtMs: Number(raw.publishedAtMs),
  }

  if (
    !result.campaignId ||
    !result.drawId ||
    !result.drawDate ||
    !result.drawPrize ||
    result.extractionNumbers.length < 1 ||
    result.extractionNumbers.length > EXTRACTION_COUNT ||
    !Number.isInteger(result.selectedExtractionIndex) ||
    result.selectedExtractionIndex < 1 ||
    result.selectedExtractionIndex > EXTRACTION_COUNT ||
    !result.selectedExtractionNumber ||
    !Number.isInteger(result.targetNumber) ||
    result.targetNumber <= 0 ||
    !Number.isInteger(result.winningNumber) ||
    result.winningNumber <= 0 ||
    !result.winner.userId ||
    !Number.isFinite(result.publishedAtMs)
  ) {
    return null
  }

  return result
}

export function createPublishMainRaffleDrawHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<MainRaffleDrawResult> => {
    const uid = requireActiveUid(request.auth)

    await assertAdminRole(db, uid)

    const payload = asRecord(request.data) as PublishMainRaffleDrawInput
    const extractionNumbers = sanitizeExtractionNumbers(payload.extractionNumbers)
    const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
    const availableDrawPrizes = buildAvailableDrawPrizes(campaignData)
    const drawPrize = sanitizeDrawPrize(payload.drawPrize, availableDrawPrizes)
    const raffleRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
    if (raffleRange.total <= 0) {
      throw new HttpsError('failed-precondition', 'Campanha sem faixa de numeros configurada.')
    }

    const drawDate = sanitizeOptionalDrawDate(payload.drawDate)
    const publishedAtMs = Date.now()
    const drawRef = db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION).doc()

    try {
      const rankingBuild = await buildMainRaffleRankingSnapshot(db, {
        start: raffleRange.start,
        end: raffleRange.end,
      })
      const rankingSnapshot = rankingBuild.rankingSnapshot
      if (rankingSnapshot.length === 0) {
        throw new HttpsError('failed-precondition', 'Nao ha participantes elegiveis para o sorteio geral.')
      }

      const winnerResolution = resolveMainRaffleByRuleV2({
        extractionNumbers,
        rankingSnapshot,
        ticketNumbersByUser: rankingBuild.ticketNumbersByUser,
      })
      if (!winnerResolution) {
        throw new HttpsError('failed-precondition', 'Nao foi possivel resolver vencedor com os dados elegiveis do ranking.')
      }

      const winner = rankingSnapshot[winnerResolution.winningPosition - 1]
      if (!winner) {
        throw new HttpsError('internal', 'Nao foi possivel identificar o ganhador no ranking geral.')
      }

      const winningTicketNumber = winnerResolution.winningTicketNumber
      const winningNumber = Number(String(winningTicketNumber || '').replace(/\D/g, ''))
      if (!Number.isInteger(winningNumber) || winningNumber <= 0) {
        throw new HttpsError('failed-precondition', 'Nao foi possivel determinar o bilhete vencedor.')
      }

      const bounds = buildChunkBoundsForNumber({
        campaignId: CAMPAIGN_DOC_ID,
        number: winningNumber,
        rangeStart: raffleRange.start,
        rangeEnd: raffleRange.end,
      })

      let result: MainRaffleDrawResult | null = null

      await db.runTransaction(async (transaction) => {
        const existingPrizeSnapshot = await transaction.get(
          db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION)
            .where('drawPrize', '==', drawPrize)
            .limit(1),
        )
        if (!existingPrizeSnapshot.empty) {
          throw new HttpsError(
            'failed-precondition',
            'Este premio ja foi sorteado em uma rodada anterior e nao pode ser reutilizado.',
          )
        }

        const winnerUserSnapshot = await transaction.get(db.collection('users').doc(winner.userId))
        const winnerUserData = asRecord(winnerUserSnapshot.data())
        const winnerName = formatPublicName(
          sanitizeString(winnerUserData.name) || sanitizeString(winnerUserData.displayName),
          winner.userId,
        )
        const winnerPhotoURL = sanitizeString(winnerUserData.photoURL)
        const winningNumberFormatted = String(winningNumber).padStart(7, '0')

        const candidateChunkRef = getNumberChunkRef(db, CAMPAIGN_DOC_ID, bounds.chunkStart)
        const candidateChunkSnapshot = await transaction.get(candidateChunkRef)
        const candidateChunkState = readChunkStateFromDoc({
          bounds,
          docData: candidateChunkSnapshot.exists ? (candidateChunkSnapshot.data() || null) : null,
          nowMs: publishedAtMs,
        })
        const candidateChunkView = getChunkNumberView(candidateChunkState, winningNumber)
        const candidatePaidMeta = getChunkPaidMeta(candidateChunkState, winningNumber)

        if (
          candidateChunkView.status !== 'pago'
          || !candidatePaidMeta?.ownerUid
          || candidatePaidMeta.ownerUid !== winner.userId
          || candidatePaidMeta.awardedDrawId
        ) {
          throw new HttpsError(
            'failed-precondition',
            'O numero vencedor nao esta mais elegivel. Tente publicar novamente.',
          )
        }

        markNumberAsAwarded({
          state: candidateChunkState,
          number: winningNumber,
          drawId: drawRef.id,
          prize: drawPrize,
          awardedAtMs: publishedAtMs,
        })

        const winnerAttempt = winnerResolution.attempts.find((attempt) => attempt.matchedPosition === winner.pos)
        const selectedExtractionIndex = Number.isInteger(winnerAttempt?.sourceExtractionIndex)
          ? Number(winnerAttempt?.sourceExtractionIndex)
          : 1
        const selectedExtractionNumber = sanitizeString(winnerAttempt?.extractionNumber) || extractionNumbers[0] || ''
        const fallbackDirection = winnerAttempt?.nearestDirection === 'above'
          ? 'above'
          : winnerAttempt?.nearestDirection === 'below'
            ? 'below'
            : 'none'

        result = {
          campaignId: CAMPAIGN_DOC_ID,
          drawId: drawRef.id,
          drawDate,
          drawPrize,
          ruleVersion: 'v2_prefix_cycle',
          comparisonMode: 'ticket_suffix',
          comparisonSide: 'right_suffix',
          extractionNumbers,
          participantCount: rankingSnapshot.length,
          comparisonDigits: winnerResolution.comparisonDigits,
          attempts: winnerResolution.attempts,
          winningPosition: winnerResolution.winningPosition,
          winningCode: winnerResolution.winningCode,
          winningTicketNumber,
          resolvedBy: winnerResolution.resolvedBy,
          rankingSnapshot,
          selectedExtractionIndex,
          selectedExtractionNumber,
          raffleRangeStart: raffleRange.start,
          raffleRangeEnd: raffleRange.end,
          raffleTotalNumbers: raffleRange.total,
          moduloTargetOffset: 0,
          targetNumber: winningNumber,
          targetNumberFormatted: winningNumberFormatted,
          winningNumber,
          winningNumberFormatted,
          fallbackDirection,
          winner: {
            userId: winner.userId,
            name: winnerName,
            photoURL: winnerPhotoURL,
          },
          publishedAtMs,
        }

        transaction.set(drawRef, {
          ...result,
          publishedByUid: uid,
          publishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        if (candidateChunkState.dirty) {
          transaction.set(candidateChunkRef, writeChunkStateToDoc(candidateChunkState), { merge: true })
        }

        transaction.set(
          db.collection('campaigns').doc(CAMPAIGN_DOC_ID),
          {
            latestMainRaffleDraw: {
              ...result,
              publishedByUid: uid,
              publishedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      })
      invalidateCampaignDocCache(CAMPAIGN_DOC_ID)

      if (!result) {
        throw new HttpsError('internal', 'Nao foi possivel concluir a apuracao.')
      }

      return result
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      const rawMessage = sanitizeString((error as { message?: unknown } | null)?.message)
      const lowerMessage = rawMessage.toLowerCase()

      if (lowerMessage.includes('index') || lowerMessage.includes('requires an index')) {
        throw new HttpsError(
          'failed-precondition',
          rawMessage
            || 'A consulta do sorteio precisa de indice no Firestore. Verifique os logs da funcao para criar o indice sugerido.',
        )
      }

      logger.error('publishMainRaffleDraw failed', {
        error: String(error),
        message: rawMessage,
      })
      throw new HttpsError(
        'internal',
        rawMessage || 'Nao foi possivel publicar o sorteio principal agora.',
      )
    }
  }
}

export function createGetLatestMainRaffleDrawHandler(db: Firestore) {
  return async (): Promise<GetLatestMainRaffleDrawOutput> => {
    try {
      const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
      const raw = asRecord(campaignData?.latestMainRaffleDraw)
      const result = parseMainRaffleResult(raw)
      if (!result) {
        return {
          hasResult: false,
          result: null,
        }
      }

      return {
        hasResult: true,
        result,
      }
    } catch (error) {
      logger.error('getLatestMainRaffleDraw failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o ultimo sorteio principal.')
    }
  }
}

export function createGetPublicMainRaffleDrawHistoryHandler(db: Firestore) {
  return async (request: { data?: unknown }): Promise<GetMainRaffleDrawHistoryOutput> => {
    const payload = asRecord(request.data) as GetMainRaffleDrawHistoryInput
    const historyLimit = sanitizeHistoryLimit(
      payload.limit,
      MAX_PUBLIC_MAIN_HISTORY_LIMIT,
      DEFAULT_PUBLIC_MAIN_HISTORY_LIMIT,
    )

    try {
      const historySnapshot = await db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION)
        .orderBy('publishedAtMs', 'desc')
        .limit(historyLimit)
        .get()

      const results = historySnapshot.docs
        .map((documentSnapshot) => parseMainRaffleResult(asRecord(documentSnapshot.data())))
        .filter((item): item is MainRaffleDrawResult => Boolean(item))

      return {
        results,
      }
    } catch (error) {
      logger.error('getPublicMainRaffleDrawHistory failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o historico do sorteio principal.')
    }
  }
}
