import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_DOC_ID,
  DEFAULT_NUMBER_WINDOW_PAGE_SIZE,
  MAX_NUMBER_WINDOW_PAGE_SIZE,
} from './constants.js'
import {
  buildNumberStateView,
  getNumberStateRef,
  readCampaignNumberRange,
  type NumberStateView,
} from './numberStateStore.js'
import { asRecord, sanitizeString } from './shared.js'

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
  smallestAvailableNumber: number | null
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

async function readNumbersState(
  db: Firestore,
  params: {
    campaignId: string
    numbers: number[]
    nowMs: number
  },
): Promise<NumberStateView[]> {
  const uniqueNumbers = Array.from(new Set(params.numbers)).sort((a, b) => a - b)
  if (uniqueNumbers.length === 0) {
    return []
  }

  const numberStateRefs = uniqueNumbers.map((number) =>
    getNumberStateRef(db, params.campaignId, number),
  )
  const numberStateSnapshots = await db.getAll(...numberStateRefs)
  const stateDataByNumber = new Map<number, DocumentData>()

  numberStateSnapshots.forEach((snapshot, index) => {
    const number = uniqueNumbers[index]
    if (!snapshot.exists) {
      return
    }

    stateDataByNumber.set(number, snapshot.data() || {})
  })

  return uniqueNumbers.map((number) =>
    buildNumberStateView({
      number,
      nowMs: params.nowMs,
      numberStateData: stateDataByNumber.get(number) || null,
    }),
  )
}

async function readRangeState(
  db: Firestore,
  params: {
    campaignId: string
    start: number
    end: number
    nowMs: number
  },
): Promise<NumberStateView[]> {
  return readNumbersState(db, {
    campaignId: params.campaignId,
    numbers: toRange(params.start, params.end),
    nowMs: params.nowMs,
  })
}

async function findSmallestAvailableNumber(
  db: Firestore,
  params: {
    campaignId: string
    rangeStart: number
    rangeEnd: number
    nowMs: number
  },
): Promise<number | null> {
  for (
    let blockStart = params.rangeStart;
    blockStart <= params.rangeEnd;
    blockStart += SEARCH_BLOCK_SIZE
  ) {
    const blockEnd = Math.min(blockStart + SEARCH_BLOCK_SIZE - 1, params.rangeEnd)
    const blockStates = await readRangeState(db, {
      campaignId: params.campaignId,
      start: blockStart,
      end: blockEnd,
      nowMs: params.nowMs,
    })
    const firstAvailable = blockStates.find((item) => item.status === 'disponivel')
    if (firstAvailable) {
      return firstAvailable.number
    }
  }

  return null
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
  const campaignSnapshot = await db.collection('campaigns').doc(campaignId).get()
  const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
  return readCampaignNumberRange(campaignData, campaignId)
}

function normalizeTicketDigits(raw: unknown): string | null {
  const value = sanitizeString(raw)
  if (!value) {
    return null
  }

  const digits = value.replace(/\D/g, '')
  return digits || null
}

function parseComparableWinnerTicket(raw: Record<string, unknown>): number | null {
  const winningCode = sanitizeString(raw.winningCode)
  const winnerTicketNumbers = Array.isArray(raw.winnerTicketNumbers)
    ? raw.winnerTicketNumbers
      .map((item) => normalizeTicketDigits(item))
      .filter((item): item is string => Boolean(item))
    : []

  if (winnerTicketNumbers.length === 0) {
    return null
  }

  const matched = winningCode
    ? winnerTicketNumbers.find((ticket) => ticket.endsWith(winningCode))
    : null
  const comparableTicket = matched || winnerTicketNumbers[0]
  const comparableNumber = Number(comparableTicket)

  if (!Number.isInteger(comparableNumber) || comparableNumber <= 0) {
    return null
  }

  return comparableNumber
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

function pickComparableTicketByWinningCode(tickets: string[], winningCode: string): number | null {
  if (tickets.length === 0) {
    return null
  }

  const matched = winningCode
    ? tickets.find((ticket) => ticket.endsWith(winningCode))
    : null
  const comparableTicket = matched || tickets[0]
  const comparableNumber = Number(comparableTicket)

  if (!Number.isInteger(comparableNumber) || comparableNumber <= 0) {
    return null
  }

  return comparableNumber
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
  const winningCode = sanitizeString(raw.winningCode)
  const tickets = await readWinnerTicketNumbersFromOrders(
    db,
    campaignId,
    winnerUserId,
    weekStartAtMs,
    weekEndAtMs,
  )
  return pickComparableTicketByWinningCode(tickets, winningCode)
}

async function resolveAwardedPrizeFromTopBuyersFallback(
  db: Firestore,
  campaignId: string,
  number: number,
): Promise<string | null> {
  const campaignSnapshot = await db.collection('campaigns').doc(campaignId).get()
  const latestTopBuyersDraw = asRecord(campaignSnapshot.get('latestTopBuyersDraw'))
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
      const smallestAvailableNumber = await findSmallestAvailableNumber(db, {
        campaignId,
        rangeStart: campaignRange.start,
        rangeEnd: campaignRange.end,
        nowMs,
      })
      const pageStart = requestedPageStart ?? smallestAvailableNumber ?? campaignRange.start

      const effectivePageStart = clampPageStart(pageStart, campaignRange.start, campaignRange.end)
      const pageEnd = Math.min(effectivePageStart + pageSize - 1, campaignRange.end)
      const numbers = await readRangeState(db, {
        campaignId,
        start: effectivePageStart,
        end: pageEnd,
        nowMs,
      })
      const availableInPage = numbers.filter((item) => item.status === 'disponivel').length
      const previousPageStart =
        effectivePageStart > campaignRange.start
          ? Math.max(campaignRange.start, effectivePageStart - pageSize)
          : null
      const nextPageStart = pageEnd < campaignRange.end ? pageEnd + 1 : null

      logger.info('getNumberWindow succeeded', {
        campaignId,
        pageSize,
        requestedPageStart,
        effectivePageStart,
        pageEnd,
        availableInPage,
        smallestAvailableNumber,
      })

      return {
        campaignId,
        pageSize,
        pageStart: effectivePageStart,
        pageEnd,
        rangeStart: campaignRange.start,
        rangeEnd: campaignRange.end,
        totalNumbers: campaignRange.total,
        smallestAvailableNumber,
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
    } catch (error) {
      logger.error('getNumberWindow failed', {
        error: String(error),
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao carregar numeros da pagina.')
    }
  }
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

      logger.info('pickRandomAvailableNumbers succeeded', {
        campaignId,
        quantityRequested: quantity,
        quantitySelected: numbers.length,
        excludedCount: excludedNumbers.size,
      })

      return {
        campaignId,
        quantityRequested: quantity,
        numbers,
        exhausted: numbers.length < quantity,
      } satisfies PickRandomAvailableNumbersOutput
    } catch (error) {
      logger.error('pickRandomAvailableNumbers failed', {
        error: String(error),
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
      const numberStateRef = getNumberStateRef(db, campaignId, number)
      const numberStateSnapshot = await numberStateRef.get()
      const state = buildNumberStateView({
        number,
        nowMs,
        numberStateData: numberStateSnapshot.exists ? numberStateSnapshot.data() : null,
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

      const ownerUid = sanitizeString(numberStateSnapshot.get('ownerUid'))
      let awardedPrize = sanitizeString(numberStateSnapshot.get('awardedPrize')) || null
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
