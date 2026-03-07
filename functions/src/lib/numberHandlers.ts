import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_DOC_ID,
  DEFAULT_NUMBER_WINDOW_PAGE_SIZE,
  MAX_NUMBER_WINDOW_PAGE_SIZE,
} from './constants.js'
import {
  buildChunkBoundsForChunkStart,
  buildChunkBoundsForNumber,
  getChunkPaidMeta,
  getChunkNumberView,
  getNumberChunkRef,
  mapNumbersByChunkStart,
  readChunkStateFromDoc,
  type NumberChunkPaidMetaEntry,
  type NumberChunkRuntimeState,
  listChunkStartsInWindow,
  NUMBER_CHUNK_SIZE,
} from './numberChunkStore.js'
import {
  readCampaignNumberRange,
  type NumberStateView,
} from './numberStateStore.js'
import { asRecord, sanitizeString } from './shared.js'
import { getCampaignDocCached } from './campaignDocCache.js'
import { pickTopBuyersWinningTicketNumber, type TopBuyersWinnerAttemptLike } from './topBuyersWinner.js'

interface GetNumberWindowInput {
  campaignId?: string
  pageSize?: number
  pageStart?: number
}

interface GetNumberWindowOutput {
  campaignId: string
  pageSize: number
  pageStart: number
  pageEnd: number
  rangeStart: number
  rangeEnd: number
  totalNumbers: number
  availableInPage: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  previousPageStart: number | null
  nextPageStart: number | null
  numbers: Array<{
    number: number
    status: NumberStateView['status']
    reservationExpiresAtMs: number | null
  }>
}

interface PickRandomAvailableNumbersInput {
  campaignId?: string
  quantity?: number
  excludeNumbers?: number[]
}

interface PickRandomAvailableNumbersOutput {
  campaignId: string
  quantityRequested: number
  numbers: number[]
  exhausted: boolean
}

interface GetPublicNumberLookupInput {
  campaignId?: string
  number?: number | string
}

interface GetPublicNumberLookupOutput {
  campaignId: string
  number: number
  formattedNumber: string
  status: 'disponivel' | 'reservado' | 'vendido'
  awardedPrize: string | null
  owner: {
    name: string
    city: string | null
    display: string
  } | null
}

interface GetManualNumberSelectionSnapshotInput {
  campaignId?: string
  number?: number | string
  pageSize?: number
}

interface GetManualNumberSelectionSnapshotOutput extends GetNumberWindowOutput {
  lookup: {
    number: number
    formattedNumber: string
    status: NumberStateView['status']
    reservationExpiresAtMs: number | null
  }
}

const SEARCH_BLOCK_SIZE = 240
const RANDOM_ROUNDS = 20

function sanitizeCampaignId(raw: unknown): string {
  const campaignId = sanitizeString(raw)
  return campaignId || CAMPAIGN_DOC_ID
}

function sanitizePageSize(raw: unknown): number {
  const pageSize = Number(raw)
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    return DEFAULT_NUMBER_WINDOW_PAGE_SIZE
  }

  return Math.min(pageSize, MAX_NUMBER_WINDOW_PAGE_SIZE)
}

function sanitizeOptionalPageStart(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') {
    return null
  }

  const pageStart = Number(raw)
  if (!Number.isInteger(pageStart) || pageStart <= 0) {
    throw new HttpsError('invalid-argument', 'pageStart deve ser um numero inteiro positivo')
  }

  return pageStart
}

function sanitizeQuantity(raw: unknown, maxAllowed: number): number {
  const quantity = Number(raw)

  if (!Number.isInteger(quantity)) {
    throw new HttpsError('invalid-argument', 'quantity deve ser um numero inteiro')
  }

  if (quantity <= 0 || quantity > maxAllowed) {
    throw new HttpsError(
      'invalid-argument',
      `quantity deve estar entre 1 e ${maxAllowed}`,
    )
  }

  return quantity
}

function sanitizeLookupNumber(raw: unknown, rangeStart: number, rangeEnd: number): number {
  const fromString = typeof raw === 'string' ? raw.replace(/\D/g, '') : raw
  const number = Number(fromString)

  if (!Number.isInteger(number)) {
    throw new HttpsError('invalid-argument', 'Informe um numero inteiro valido para consulta.')
  }

  if (number < rangeStart || number > rangeEnd) {
    throw new HttpsError(
      'invalid-argument',
      `Numero fora da faixa da campanha (${rangeStart} a ${rangeEnd}).`,
    )
  }

  return number
}

function sanitizeExcludeNumbers(raw: unknown, rangeStart: number, rangeEnd: number): number[] {
  if (raw === undefined || raw === null) {
    return []
  }

  if (!Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'excludeNumbers deve ser uma lista de inteiros')
  }

  return Array.from(new Set(
    raw.map((item) => {
      const number = Number(item)
      if (!Number.isInteger(number)) {
        throw new HttpsError('invalid-argument', 'excludeNumbers deve conter apenas inteiros')
      }

      if (number < rangeStart || number > rangeEnd) {
        throw new HttpsError(
          'invalid-argument',
          `excludeNumbers contem numero fora da faixa permitida: ${number}`,
        )
      }

      return number
    }),
  ))
}

function toRange(start: number, end: number): number[] {
  if (end < start) {
    return []
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function readChunkState(params: {
  campaignId: string
  rangeStart: number
  rangeEnd: number
  chunkStart: number
  snapshotData: DocumentData | null
  nowMs: number
}): NumberChunkRuntimeState {
  const bounds = buildChunkBoundsForChunkStart({
    campaignId: params.campaignId,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
    chunkStart: params.chunkStart,
  })

  const chunkState = readChunkStateFromDoc({
    bounds,
    docData: params.snapshotData,
    nowMs: params.nowMs,
  })

  return chunkState
}

async function readNumbersStateChunked(
  db: Firestore,
  params: {
    campaignId: string
    numbers: number[]
    nowMs: number
    rangeStart: number
    rangeEnd: number
  },
): Promise<NumberStateView[]> {
  const uniqueNumbers = Array.from(new Set(params.numbers)).sort((a, b) => a - b)
  if (uniqueNumbers.length === 0) {
    return []
  }

  const grouped = mapNumbersByChunkStart({
    numbers: uniqueNumbers,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
  })
  const chunkStarts = Array.from(grouped.keys()).sort((a, b) => a - b)
  const chunkRefs = chunkStarts.map((chunkStart) => getNumberChunkRef(db, params.campaignId, chunkStart))
  const chunkSnapshots = chunkRefs.length > 0 ? await db.getAll(...chunkRefs) : []
  const chunkStateByStart = new Map<number, NumberChunkRuntimeState>()

  for (let index = 0; index < chunkStarts.length; index += 1) {
    const chunkStart = chunkStarts[index]
    const snapshot = chunkSnapshots[index]
    const chunkState = readChunkState({
      campaignId: params.campaignId,
      rangeStart: params.rangeStart,
      rangeEnd: params.rangeEnd,
      chunkStart,
      snapshotData: snapshot?.exists ? (snapshot.data() || null) : null,
      nowMs: params.nowMs,
    })
    chunkStateByStart.set(chunkStart, chunkState)
  }

  return uniqueNumbers.map((number) => {
    const chunkStart = params.rangeStart + Math.floor((number - params.rangeStart) / NUMBER_CHUNK_SIZE) * NUMBER_CHUNK_SIZE
    const chunkState = chunkStateByStart.get(chunkStart)
    if (!chunkState) {
      return {
        number,
        status: 'disponivel',
        reservedBy: null,
        reservationExpiresAtMs: null,
      } satisfies NumberStateView
    }

    const view = getChunkNumberView(chunkState, number)
    return {
      number,
      status: view.status,
      reservedBy: view.reservedBy,
      reservationExpiresAtMs: view.reservationExpiresAtMs,
    } satisfies NumberStateView
  })
}

async function readNumbersState(
  db: Firestore,
  params: {
    campaignId: string
    numbers: number[]
    nowMs: number
    rangeStart: number
    rangeEnd: number
  },
): Promise<NumberStateView[]> {
  return readNumbersStateChunked(db, params)
}

async function readRangeState(
  db: Firestore,
  params: {
    campaignId: string
    start: number
    end: number
    nowMs: number
    rangeStart: number
    rangeEnd: number
  },
): Promise<NumberStateView[]> {
  return readNumbersState(db, {
    campaignId: params.campaignId,
    numbers: toRange(params.start, params.end),
    nowMs: params.nowMs,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
  })
}

function clampPageStart(pageStart: number, rangeStart: number, rangeEnd: number): number {
  if (pageStart < rangeStart) {
    return rangeStart
  }

  if (pageStart > rangeEnd) {
    return rangeEnd
  }

  return pageStart
}

async function buildNumberWindowOutput(params: {
  db: Firestore
  campaignId: string
  pageSize: number
  pageStart: number
  campaignRange: {
    start: number
    end: number
    total: number
  }
  nowMs: number
}): Promise<GetNumberWindowOutput> {
  const effectivePageStart = clampPageStart(
    params.pageStart,
    params.campaignRange.start,
    params.campaignRange.end,
  )
  const pageEnd = Math.min(effectivePageStart + params.pageSize - 1, params.campaignRange.end)
  const numbers = await readRangeState(params.db, {
    campaignId: params.campaignId,
    start: effectivePageStart,
    end: pageEnd,
    nowMs: params.nowMs,
    rangeStart: params.campaignRange.start,
    rangeEnd: params.campaignRange.end,
  })
  const availableInPage = numbers.filter((item) => item.status === 'disponivel').length
  const previousPageStart =
    effectivePageStart > params.campaignRange.start
      ? Math.max(params.campaignRange.start, effectivePageStart - params.pageSize)
      : null
  const nextPageStart = pageEnd < params.campaignRange.end ? pageEnd + 1 : null

  return {
    campaignId: params.campaignId,
    pageSize: params.pageSize,
    pageStart: effectivePageStart,
    pageEnd,
    rangeStart: params.campaignRange.start,
    rangeEnd: params.campaignRange.end,
    totalNumbers: params.campaignRange.total,
    availableInPage,
    hasPreviousPage: previousPageStart !== null,
    hasNextPage: nextPageStart !== null,
    previousPageStart,
    nextPageStart,
    numbers: numbers.map((item) => ({
      number: item.number,
      status: item.status,
      reservationExpiresAtMs: item.reservationExpiresAtMs,
    })),
  } satisfies GetNumberWindowOutput
}

function formatPublicName(name: string, uid: string): string {
  const normalized = sanitizeString(name)

  if (!normalized) {
    return `Participante ${uid.slice(-4).toUpperCase()}`
  }

  return normalized
}

function readOwnerCity(data: Record<string, unknown>): string | null {
  const cityCandidates = [
    data.city,
    data.cidade,
    data.locationCity,
    data.cityName,
  ]

  for (const candidate of cityCandidates) {
    const normalized = sanitizeString(candidate)
    if (normalized) {
      return normalized
    }
  }

  return null
}

async function resolveCampaignRange(db: Firestore, campaignId: string) {
  const campaignData = await getCampaignDocCached(db, campaignId)
  return readCampaignNumberRange(campaignData, campaignId)
}

async function readNumberStatusAndPaidMeta(params: {
  db: Firestore
  campaignId: string
  number: number
  rangeStart: number
  rangeEnd: number
  nowMs: number
}): Promise<{ state: NumberStateView; paidMeta: NumberChunkPaidMetaEntry | null }> {
  const bounds = buildChunkBoundsForNumber({
    campaignId: params.campaignId,
    number: params.number,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
  })
  const chunkRef = getNumberChunkRef(params.db, params.campaignId, bounds.chunkStart)
  const snapshot = await chunkRef.get()
  const chunkState = readChunkStateFromDoc({
    bounds,
    docData: snapshot.exists ? (snapshot.data() || null) : null,
    nowMs: params.nowMs,
  })

  const view = getChunkNumberView(chunkState, params.number)
  const paidMeta = getChunkPaidMeta(chunkState, params.number)

  return {
    state: {
      number: view.number,
      status: view.status,
      reservedBy: view.reservedBy,
      reservationExpiresAtMs: view.reservationExpiresAtMs,
    },
    paidMeta,
  }
}

function normalizeTicketDigits(raw: unknown): string | null {
  const value = sanitizeString(raw)
  if (!value) {
    return null
  }

  const digits = value.replace(/\D/g, '')
  return digits || null
}

function readTopBuyersAttempts(raw: Record<string, unknown>): TopBuyersWinnerAttemptLike[] {
  if (!Array.isArray(raw.attempts)) {
    return []
  }

  return raw.attempts
    .map((item) => asRecord(item))
    .map((item) => ({
      matchedPosition: Number.isInteger(Number(item.matchedPosition))
        ? Number(item.matchedPosition)
        : null,
      rawCandidateCode: sanitizeString(item.rawCandidateCode),
      candidateCode: sanitizeString(item.candidateCode),
    }))
}

function toComparableTicketNumber(ticket: string | null) {
  if (!ticket) {
    return null
  }

  const comparableNumber = Number(ticket)
  if (!Number.isInteger(comparableNumber) || comparableNumber <= 0) {
    return null
  }

  return comparableNumber
}

export function parseComparableWinnerTicket(raw: Record<string, unknown>): number | null {
  const winnerTicketNumbers = Array.isArray(raw.winnerTicketNumbers)
    ? raw.winnerTicketNumbers
      .map((item) => normalizeTicketDigits(item))
      .filter((item): item is string => Boolean(item))
    : []

  const comparableTicket = pickTopBuyersWinningTicketNumber({
    winningTicketNumber: sanitizeString(raw.winningTicketNumber) || null,
    winnerTicketNumbers,
    attempts: readTopBuyersAttempts(raw),
    winningPosition: Number(raw.winningPosition),
    comparisonDigits: Number(raw.comparisonDigits),
    winningCode: sanitizeString(raw.winningCode),
    comparisonSide: raw.comparisonSide === 'left_prefix' ? 'left_prefix' : 'right_suffix',
  })

  return toComparableTicketNumber(comparableTicket)
}

function readTimestampMillis(value: unknown): number {
  if (!value) {
    return 0
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : 0
  }

  const asTimestamp = value as { toMillis?: () => number }
  if (typeof asTimestamp?.toMillis === 'function') {
    const ms = asTimestamp.toMillis()
    return Number.isFinite(ms) ? ms : 0
  }

  const asRecordValue = asRecord(value)
  const seconds = Number(asRecordValue.seconds)
  const nanoseconds = Number(asRecordValue.nanoseconds)
  if (Number.isFinite(seconds)) {
    const safeNanoseconds = Number.isFinite(nanoseconds) ? nanoseconds : 0
    return (seconds * 1000) + Math.floor(safeNanoseconds / 1_000_000)
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
  campaignId: string,
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

  for (const documentSnapshot of ordersSnapshot.docs) {
    const data = documentSnapshot.data()
    const status = sanitizeString(data.status).toLowerCase()
    const type = sanitizeString(data.type).toLowerCase()
    const orderCampaignId = sanitizeString(data.campaignId)

    if (status !== 'paid' || type !== 'deposit' || orderCampaignId !== campaignId) {
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

async function resolveComparableWinnerTicket(
  db: Firestore,
  campaignId: string,
  raw: Record<string, unknown>,
): Promise<number | null> {
  const directComparable = parseComparableWinnerTicket(raw)
  if (directComparable) {
    return directComparable
  }

  const winner = asRecord(raw.winner)
  const winnerUserId = sanitizeString(winner.userId)
  const weekStartAtMs = Number(raw.weekStartAtMs)
  const weekEndAtMs = Number(raw.weekEndAtMs)
  const tickets = await readWinnerTicketNumbersFromOrders(
    db,
    campaignId,
    winnerUserId,
    weekStartAtMs,
    weekEndAtMs,
  )
  const comparableTicket = pickTopBuyersWinningTicketNumber({
    winningTicketNumber: sanitizeString(raw.winningTicketNumber) || null,
    winnerTicketNumbers: tickets,
    attempts: readTopBuyersAttempts(raw),
    winningPosition: Number(raw.winningPosition),
    comparisonDigits: Number(raw.comparisonDigits),
    winningCode: sanitizeString(raw.winningCode),
    comparisonSide: raw.comparisonSide === 'left_prefix' ? 'left_prefix' : 'right_suffix',
  })
  return toComparableTicketNumber(comparableTicket)
}

async function resolveAwardedPrizeFromTopBuyersFallback(
  db: Firestore,
  campaignId: string,
  number: number,
): Promise<string | null> {
  const campaignData = await getCampaignDocCached(db, campaignId)
  const latestTopBuyersDraw = asRecord(campaignData?.latestTopBuyersDraw)
  const latestTopBuyersPrize = sanitizeString(latestTopBuyersDraw.drawPrize)
  const latestTopBuyersNumber = await resolveComparableWinnerTicket(db, campaignId, latestTopBuyersDraw)

  if (latestTopBuyersPrize && latestTopBuyersNumber === number) {
    return latestTopBuyersPrize
  }

  const historySnapshot = await db.collection('topBuyersDrawResults')
    .orderBy('publishedAtMs', 'desc')
    .limit(120)
    .get()

  for (const documentSnapshot of historySnapshot.docs) {
    const data = asRecord(documentSnapshot.data())
    const historyCampaignId = sanitizeString(data.campaignId) || CAMPAIGN_DOC_ID
    if (historyCampaignId !== campaignId) {
      continue
    }

    const prize = sanitizeString(data.drawPrize)
    const comparableNumber = parseComparableWinnerTicket(data)
    if (prize && comparableNumber === number) {
      return prize
    }
  }

  return null
}

export function createGetNumberWindowHandler(db: Firestore) {
  return async (request: { data: unknown }) => {
    const startedAtMs = Date.now()
    try {
      const payload = asRecord(request.data) as Partial<GetNumberWindowInput>
      const campaignId = sanitizeCampaignId(payload.campaignId)
      const pageSize = sanitizePageSize(payload.pageSize)
      const requestedPageStart = sanitizeOptionalPageStart(payload.pageStart)
      const campaignRange = await resolveCampaignRange(db, campaignId)

      if (campaignRange.total <= 0) {
        throw new HttpsError('failed-precondition', 'Campanha sem faixa de numeros configurada')
      }

      const nowMs = Date.now()
      const pageStart = requestedPageStart ?? campaignRange.start
      const output = await buildNumberWindowOutput({
        db,
        campaignId,
        pageSize,
        pageStart,
        campaignRange,
        nowMs,
      })
      const chunksRead = listChunkStartsInWindow({
        pageStart: output.pageStart,
        pageSize,
        rangeStart: campaignRange.start,
        rangeEnd: campaignRange.end,
      }).length
      const durationMs = Date.now() - startedAtMs

      logger.info('getNumberWindow succeeded', {
        campaignId,
        pageSize,
        requestedPageStart,
        effectivePageStart: output.pageStart,
        pageEnd: output.pageEnd,
        availableInPage: output.availableInPage,
        numbersRequested: output.numbers.length,
        conflictsCount: 0,
        transactionAttempts: 0,
        chunksRead,
        chunksWritten: 0,
        durationMs,
      })

      return output
    } catch (error) {
      const durationMs = Date.now() - startedAtMs
      logger.error('getNumberWindow failed', {
        error: String(error),
        numbersRequested: 0,
        conflictsCount: 0,
        transactionAttempts: 0,
        chunksRead: 0,
        chunksWritten: 0,
        durationMs,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao carregar numeros da pagina.')
    }
  }
}

export function createGetNumberChunkWindowHandler(db: Firestore) {
  return createGetNumberWindowHandler(db)
}

function randomIntInclusive(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function buildRandomCandidates(params: {
  start: number
  end: number
  size: number
  excluded: Set<number>
}): number[] {
  const candidateSet = new Set<number>()
  const total = params.end - params.start + 1

  while (candidateSet.size < params.size && candidateSet.size + params.excluded.size < total) {
    const value = randomIntInclusive(params.start, params.end)
    if (params.excluded.has(value)) {
      continue
    }
    candidateSet.add(value)
  }

  return Array.from(candidateSet)
}

export function createPickRandomAvailableNumbersHandler(db: Firestore) {
  return async (request: { data: unknown }) => {
    const startedAtMs = Date.now()
    try {
      const payload = asRecord(request.data) as Partial<PickRandomAvailableNumbersInput>
      const campaignId = sanitizeCampaignId(payload.campaignId)
      const campaignRange = await resolveCampaignRange(db, campaignId)
      const quantity = sanitizeQuantity(payload.quantity, campaignRange.total)
      const excludedNumbers = new Set(
        sanitizeExcludeNumbers(payload.excludeNumbers, campaignRange.start, campaignRange.end),
      )
      const nowMs = Date.now()
      const selectedNumbers = new Set<number>()
      const blockedNumbers = new Set<number>()
      const randomBatchSize = Math.max(40, Math.min(200, quantity * 4))

      for (let round = 0; round < RANDOM_ROUNDS && selectedNumbers.size < quantity; round += 1) {
        const candidates = buildRandomCandidates({
          start: campaignRange.start,
          end: campaignRange.end,
          size: randomBatchSize,
          excluded: new Set([...selectedNumbers, ...blockedNumbers, ...excludedNumbers]),
        })

        if (candidates.length === 0) {
          break
        }

        const states = await readNumbersState(db, {
          campaignId,
          numbers: candidates,
          nowMs,
          rangeStart: campaignRange.start,
          rangeEnd: campaignRange.end,
        })

        for (const state of states) {
          if (state.status === 'disponivel') {
            selectedNumbers.add(state.number)
            if (selectedNumbers.size >= quantity) {
              break
            }
          } else {
            blockedNumbers.add(state.number)
          }
        }
      }

      if (selectedNumbers.size < quantity) {
        for (
          let blockStart = campaignRange.start;
          blockStart <= campaignRange.end && selectedNumbers.size < quantity;
          blockStart += SEARCH_BLOCK_SIZE
        ) {
          const blockEnd = Math.min(blockStart + SEARCH_BLOCK_SIZE - 1, campaignRange.end)
          const states = await readRangeState(db, {
            campaignId,
            start: blockStart,
            end: blockEnd,
            nowMs,
            rangeStart: campaignRange.start,
            rangeEnd: campaignRange.end,
          })

          for (const state of states) {
            if (
              state.status !== 'disponivel'
              || selectedNumbers.has(state.number)
              || excludedNumbers.has(state.number)
            ) {
              continue
            }

            selectedNumbers.add(state.number)
            if (selectedNumbers.size >= quantity) {
              break
            }
          }
        }
      }

      const numbers = Array.from(selectedNumbers).sort((a, b) => a - b)
      const durationMs = Date.now() - startedAtMs

      logger.info('pickRandomAvailableNumbers succeeded', {
        campaignId,
        quantityRequested: quantity,
        quantitySelected: numbers.length,
        excludedCount: excludedNumbers.size,
        numbersRequested: quantity,
        conflictsCount: 0,
        transactionAttempts: 0,
        chunksRead: 0,
        chunksWritten: 0,
        durationMs,
      })

      return {
        campaignId,
        quantityRequested: quantity,
        numbers,
        exhausted: numbers.length < quantity,
      } satisfies PickRandomAvailableNumbersOutput
    } catch (error) {
      const durationMs = Date.now() - startedAtMs
      logger.error('pickRandomAvailableNumbers failed', {
        error: String(error),
        numbersRequested: 0,
        conflictsCount: 0,
        transactionAttempts: 0,
        chunksRead: 0,
        chunksWritten: 0,
        durationMs,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao selecionar numeros automaticamente.')
    }
  }
}

export function createGetPublicNumberLookupHandler(db: Firestore) {
  return async (request: { data: unknown }) => {
    try {
      const payload = asRecord(request.data) as Partial<GetPublicNumberLookupInput>
      const campaignId = sanitizeCampaignId(payload.campaignId)
      const campaignRange = await resolveCampaignRange(db, campaignId)
      const number = sanitizeLookupNumber(payload.number, campaignRange.start, campaignRange.end)
      const nowMs = Date.now()
      const { state, paidMeta } = await readNumberStatusAndPaidMeta({
        db,
        campaignId,
        number,
        nowMs,
        rangeStart: campaignRange.start,
        rangeEnd: campaignRange.end,
      })

      if (state.status !== 'pago') {
        return {
          campaignId,
          number,
          formattedNumber: String(number).padStart(7, '0'),
          status: state.status === 'reservado' ? 'reservado' : 'disponivel',
          awardedPrize: null,
          owner: null,
        } satisfies GetPublicNumberLookupOutput
      }

      const ownerUid = paidMeta?.ownerUid || null
      let awardedPrize = paidMeta?.awardedPrize || null
      if (!awardedPrize) {
        awardedPrize = await resolveAwardedPrizeFromTopBuyersFallback(db, campaignId, number)
      }
      if (!ownerUid) {
        return {
          campaignId,
          number,
          formattedNumber: String(number).padStart(7, '0'),
          status: 'vendido',
          awardedPrize,
          owner: null,
        } satisfies GetPublicNumberLookupOutput
      }

      const ownerSnapshot = await db.collection('users').doc(ownerUid).get()
      const ownerData = asRecord(ownerSnapshot.data())
      const ownerName = formatPublicName(
        sanitizeString(ownerData.name) || sanitizeString(ownerData.displayName),
        ownerUid,
      )
      const ownerCity = readOwnerCity(ownerData)

      return {
        campaignId,
        number,
        formattedNumber: String(number).padStart(7, '0'),
        status: 'vendido',
        awardedPrize,
        owner: {
          name: ownerName,
          city: ownerCity,
          display: ownerCity ? `${ownerName} - ${ownerCity}` : ownerName,
        },
      } satisfies GetPublicNumberLookupOutput
    } catch (error) {
      logger.error('getPublicNumberLookup failed', {
        error: String(error),
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao consultar o numero agora.')
    }
  }
}

export function createGetManualNumberSelectionSnapshotHandler(db: Firestore) {
  return async (request: { data: unknown }) => {
    const startedAtMs = Date.now()

    try {
      const payload = asRecord(request.data) as Partial<GetManualNumberSelectionSnapshotInput>
      const campaignId = sanitizeCampaignId(payload.campaignId)
      const campaignRange = await resolveCampaignRange(db, campaignId)
      const number = sanitizeLookupNumber(payload.number, campaignRange.start, campaignRange.end)
      const pageSize = sanitizePageSize(payload.pageSize)
      const nowMs = Date.now()
      const pageStart = campaignRange.start + (Math.floor((number - campaignRange.start) / pageSize) * pageSize)
      const output = await buildNumberWindowOutput({
        db,
        campaignId,
        pageSize,
        pageStart,
        campaignRange,
        nowMs,
      })

      const lookup = output.numbers.find((item) => item.number === number)
      if (!lookup) {
        throw new HttpsError('internal', 'Numero consultado nao encontrado na pagina retornada.')
      }

      const chunksRead = listChunkStartsInWindow({
        pageStart: output.pageStart,
        pageSize,
        rangeStart: campaignRange.start,
        rangeEnd: campaignRange.end,
      }).length
      const durationMs = Date.now() - startedAtMs

      logger.info('getManualNumberSelectionSnapshot succeeded', {
        campaignId,
        number,
        pageSize,
        pageStart: output.pageStart,
        pageEnd: output.pageEnd,
        lookupStatus: lookup.status,
        availableInPage: output.availableInPage,
        numbersRequested: output.numbers.length,
        conflictsCount: 0,
        transactionAttempts: 0,
        chunksRead,
        chunksWritten: 0,
        durationMs,
      })

      return {
        ...output,
        lookup: {
          number,
          formattedNumber: String(number).padStart(7, '0'),
          status: lookup.status,
          reservationExpiresAtMs: lookup.reservationExpiresAtMs,
        },
      } satisfies GetManualNumberSelectionSnapshotOutput
    } catch (error) {
      const durationMs = Date.now() - startedAtMs
      logger.error('getManualNumberSelectionSnapshot failed', {
        error: String(error),
        numbersRequested: 0,
        conflictsCount: 0,
        transactionAttempts: 0,
        chunksRead: 0,
        chunksWritten: 0,
        durationMs,
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao consultar e carregar a pagina do numero.')
    }
  }
}
