import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

type CallableEnvelope<T> = T | { result?: T }

type RawWinner = {
  userId?: unknown
  name?: unknown
  photoURL?: unknown
}

type RawTopAttempt = {
  extractionNumber?: unknown
  matchedPosition?: unknown
}

type RawTopBuyersDrawResult = {
  drawId?: unknown
  drawDate?: unknown
  drawPrize?: unknown
  winner?: RawWinner
  winnerTicketNumbers?: unknown
  attempts?: unknown
  winningPosition?: unknown
  winningCode?: unknown
  publishedAtMs?: unknown
}

type RawMainRaffleResult = {
  drawId?: unknown
  drawDate?: unknown
  drawPrize?: unknown
  winner?: RawWinner
  selectedExtractionNumber?: unknown
  winningNumberFormatted?: unknown
  publishedAtMs?: unknown
}

type RawTopBuyersHistoryOutput = {
  results?: unknown
}

type RawMainRaffleHistoryOutput = {
  results?: unknown
}

export type WinnerFeedItem = {
  id: string
  drawType: 'top_buyers' | 'main_raffle'
  drawId: string
  winnerName: string
  winnerPhotoUrl: string | null
  winningNumber: string
  lotteryNumber: string
  prizeLabel: string
  drawDate: string
  publishedAtMs: number
}

export type WinnersFeedPayload = {
  items: WinnerFeedItem[]
  latestDrawId: string | null
}

const getPublicTopBuyersDrawHistory = httpsCallable<Record<string, never>, unknown>(functions, 'getPublicTopBuyersDrawHistory')
const getPublicMainRaffleDrawHistory = httpsCallable<Record<string, never>, unknown>(functions, 'getPublicMainRaffleDrawHistory')

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function sanitizeString(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function sanitizePhotoUrl(value: unknown) {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return normalized
    }

    return null
  } catch {
    return null
  }
}

function pickTopBuyerWinningNumber(raw: RawTopBuyersDrawResult) {
  const tickets = Array.isArray(raw.winnerTicketNumbers)
    ? raw.winnerTicketNumbers.map((item) => sanitizeString(item)).filter(Boolean)
    : []

  if (!tickets.length) {
    return '-'
  }

  const winningCode = sanitizeString(raw.winningCode)
  if (!winningCode) {
    return tickets[0]
  }

  return tickets.find((ticket) => ticket.endsWith(winningCode)) || tickets[0]
}

function pickTopBuyerLotteryNumber(raw: RawTopBuyersDrawResult) {
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts.map((item) => (item && typeof item === 'object' ? (item as RawTopAttempt) : null)).filter((item): item is RawTopAttempt => Boolean(item))
    : []

  if (!attempts.length) {
    return '-'
  }

  const winningPosition = sanitizeInteger(raw.winningPosition)
  const matchedAttempt = winningPosition > 0
    ? attempts.find((attempt) => sanitizeInteger(attempt.matchedPosition) === winningPosition)
    : null

  return sanitizeString(matchedAttempt?.extractionNumber || attempts[0]?.extractionNumber, '-')
}

function normalizeTopBuyerResult(raw: RawTopBuyersDrawResult): WinnerFeedItem | null {
  const drawId = sanitizeString(raw.drawId)
  const drawDate = sanitizeString(raw.drawDate)
  const prizeLabel = sanitizeString(raw.drawPrize)
  const publishedAtMs = sanitizeNumber(raw.publishedAtMs)
  const winner = raw.winner || {}
  const winnerName = sanitizeString(winner.name, 'Participante')

  if (!drawId || !drawDate || !prizeLabel || !Number.isFinite(publishedAtMs)) {
    return null
  }

  return {
    id: `top_buyers:${drawId}`,
    drawType: 'top_buyers',
    drawId,
    winnerName,
    winnerPhotoUrl: sanitizePhotoUrl(winner.photoURL),
    winningNumber: pickTopBuyerWinningNumber(raw),
    lotteryNumber: pickTopBuyerLotteryNumber(raw),
    prizeLabel,
    drawDate,
    publishedAtMs,
  }
}

function normalizeMainRaffleResult(raw: RawMainRaffleResult): WinnerFeedItem | null {
  const drawId = sanitizeString(raw.drawId)
  const drawDate = sanitizeString(raw.drawDate)
  const prizeLabel = sanitizeString(raw.drawPrize)
  const winningNumber = sanitizeString(raw.winningNumberFormatted, '-')
  const lotteryNumber = sanitizeString(raw.selectedExtractionNumber, '-')
  const publishedAtMs = sanitizeNumber(raw.publishedAtMs)
  const winner = raw.winner || {}
  const winnerName = sanitizeString(winner.name, 'Participante')

  if (!drawId || !drawDate || !prizeLabel || !Number.isFinite(publishedAtMs)) {
    return null
  }

  return {
    id: `main_raffle:${drawId}`,
    drawType: 'main_raffle',
    drawId,
    winnerName,
    winnerPhotoUrl: sanitizePhotoUrl(winner.photoURL),
    winningNumber,
    lotteryNumber,
    prizeLabel,
    drawDate,
    publishedAtMs,
  }
}

function normalizeTopBuyerHistory(payload: unknown): WinnerFeedItem[] {
  const data = unwrapCallableData(payload as CallableEnvelope<RawTopBuyersHistoryOutput>)
  const rawResults = Array.isArray(data?.results) ? data.results : []

  return rawResults
    .map((item) => (item && typeof item === 'object' ? normalizeTopBuyerResult(item as RawTopBuyersDrawResult) : null))
    .filter((item): item is WinnerFeedItem => Boolean(item))
}

function normalizeMainRaffleHistory(payload: unknown): WinnerFeedItem[] {
  const data = unwrapCallableData(payload as CallableEnvelope<RawMainRaffleHistoryOutput>)
  const rawResults = Array.isArray(data?.results) ? data.results : []

  return rawResults
    .map((item) => (item && typeof item === 'object' ? normalizeMainRaffleResult(item as RawMainRaffleResult) : null))
    .filter((item): item is WinnerFeedItem => Boolean(item))
}

export async function fetchWinnersFeed(): Promise<WinnersFeedPayload> {
  const [topHistoryResult, mainHistoryResult] = await Promise.allSettled([
    getPublicTopBuyersDrawHistory({}),
    getPublicMainRaffleDrawHistory({}),
  ])

  const topHistory = topHistoryResult.status === 'fulfilled'
    ? normalizeTopBuyerHistory(topHistoryResult.value.data)
    : []
  const mainHistory = mainHistoryResult.status === 'fulfilled'
    ? normalizeMainRaffleHistory(mainHistoryResult.value.data)
    : []

  if (!topHistory.length && !mainHistory.length && topHistoryResult.status === 'rejected' && mainHistoryResult.status === 'rejected') {
    throw new Error('Nao foi possivel carregar o historico de ganhadores.')
  }

  const merged = [...topHistory, ...mainHistory]
  const uniqueById = new Map(merged.map((item) => [item.id, item]))
  const items = Array.from(uniqueById.values()).sort((left, right) => right.publishedAtMs - left.publishedAtMs)

  return {
    items,
    latestDrawId: items[0]?.id || null,
  }
}
