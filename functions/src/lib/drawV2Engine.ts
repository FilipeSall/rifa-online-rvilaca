export type DrawRuleVersion = 'v2_prefix_cycle' | 'legacy_modulo'
export type DrawComparisonMode = 'ticket_suffix' | 'ticket_prefix' | 'legacy_modulo'
export type DrawComparisonSide = 'left_prefix' | 'right_suffix'
export type DrawAttemptPhase = 'exact' | 'nearest' | 'contingency'

export type RankedParticipant = {
  pos: number
  userId: string
  tickets: string[]
}

export type V2ResolutionAttempt = {
  extractionIndex: number
  attemptIndex: number
  sourceExtractionIndex: number | null
  extractionNumber: string
  comparisonDigits: number
  phase: DrawAttemptPhase
  rawCandidateCode: string
  candidateCode: string
  nearestDirection: 'none' | 'below' | 'above'
  nearestDistance: number | null
  matchedPosition: number | null
  matchedUserId: string | null
  matchedTicketNumber: string | null
}

export type V2WinnerResolution = {
  attempts: V2ResolutionAttempt[]
  comparisonDigits: number
  winningPosition: number
  winningCode: string
  winningTicketNumber: string | null
  resolvedBy: 'federal_extraction' | 'redundancy'
}

type PreparedParticipant = {
  pos: number
  userId: string
  tickets: string[]
  minTicketByComparableDigits: Map<number, Map<string, string>>
}

const DIGIT_CYCLE = [6, 5, 4, 3] as const
const MIN_FALLBACK_DIGITS = 3

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeTicket(value: string): string | null {
  const digits = sanitizeDigits(String(value || '').trim())
  if (!digits) {
    return null
  }

  return digits.length >= 7 ? digits.slice(-7) : digits.padStart(7, '0')
}

function normalizeTickets(value: string[]) {
  const unique = new Set<string>()
  for (const ticket of value) {
    const normalized = normalizeTicket(ticket)
    if (normalized) {
      unique.add(normalized)
    }
  }

  return Array.from(unique).sort((left, right) => Number(left) - Number(right))
}

function normalizeExtraction(value: string): string {
  const digits = sanitizeDigits(String(value || ''))
  if (!digits) {
    return '000000'
  }
  return digits.slice(-6).padStart(6, '0')
}

function getComparableSuffix(value: string, digits: number) {
  const normalizedDigits = Math.max(1, Math.min(6, digits))
  const normalized = normalizeExtraction(value)
  return normalized.slice(-normalizedDigits).padStart(normalizedDigits, '0')
}

function buildComparableIndex(tickets: string[]) {
  const minTicketByComparableDigits = new Map<number, Map<string, string>>()

  for (const digits of DIGIT_CYCLE) {
    const bucket = new Map<string, string>()
    for (const ticket of tickets) {
      const comparableCode = ticket.slice(-digits).padStart(digits, '0')
      if (!bucket.has(comparableCode)) {
        bucket.set(comparableCode, ticket)
      }
    }
    minTicketByComparableDigits.set(digits, bucket)
  }

  return minTicketByComparableDigits
}

function prepareRanking(ranking: RankedParticipant[]): PreparedParticipant[] {
  return ranking
    .map((entry) => ({
      pos: entry.pos,
      userId: entry.userId,
      tickets: normalizeTickets(entry.tickets),
    }))
    .filter((entry) => entry.pos > 0 && entry.userId && entry.tickets.length > 0)
    .sort((left, right) => left.pos - right.pos)
    .map((entry) => ({
      ...entry,
      minTicketByComparableDigits: buildComparableIndex(entry.tickets),
    }))
}

function findExactMatchByPrefix(
  participants: PreparedParticipant[],
  candidateCode: string,
  comparisonDigits: number,
) {
  for (const participant of participants) {
    const bucket = participant.minTicketByComparableDigits.get(comparisonDigits)
    const matchedTicket = bucket?.get(candidateCode) || null
    if (!matchedTicket) {
      continue
    }

    return {
      matchedPosition: participant.pos,
      matchedUserId: participant.userId,
      matchedTicketNumber: matchedTicket,
    }
  }

  return null
}

function findNearestPrefixMatch(
  participants: PreparedParticipant[],
  rawCandidateCode: string,
) {
  const rawNumber = Number(rawCandidateCode)
  if (!Number.isInteger(rawNumber) || rawNumber < 0 || rawNumber > 999) {
    return null
  }

  for (let distance = 1; distance <= 999; distance += 1) {
    const below = rawNumber - distance
    const above = rawNumber + distance
    const belowCode = below >= 0 ? String(below).padStart(3, '0') : null
    const aboveCode = above <= 999 ? String(above).padStart(3, '0') : null

    for (const participant of participants) {
      const bucket = participant.minTicketByComparableDigits.get(MIN_FALLBACK_DIGITS)
      if (!bucket) {
        continue
      }

      if (belowCode) {
        const ticketBelow = bucket.get(belowCode)
        if (ticketBelow) {
          return {
            candidateCode: belowCode,
            nearestDirection: 'below' as const,
            nearestDistance: distance,
            matchedPosition: participant.pos,
            matchedUserId: participant.userId,
            matchedTicketNumber: ticketBelow,
          }
        }
      }

      if (aboveCode) {
        const ticketAbove = bucket.get(aboveCode)
        if (ticketAbove) {
          return {
            candidateCode: aboveCode,
            nearestDirection: 'above' as const,
            nearestDistance: distance,
            matchedPosition: participant.pos,
            matchedUserId: participant.userId,
            matchedTicketNumber: ticketAbove,
          }
        }
      }
    }
  }

  return null
}

function buildAttempt(params: {
  attemptIndex: number
  sourceExtractionIndex: number | null
  extractionNumber: string
  comparisonDigits: number
  phase: DrawAttemptPhase
  rawCandidateCode: string
  candidateCode: string
  nearestDirection?: 'none' | 'below' | 'above'
  nearestDistance?: number | null
  matchedPosition?: number | null
  matchedUserId?: string | null
  matchedTicketNumber?: string | null
}): V2ResolutionAttempt {
  return {
    extractionIndex: params.attemptIndex,
    attemptIndex: params.attemptIndex,
    sourceExtractionIndex: params.sourceExtractionIndex,
    extractionNumber: params.extractionNumber,
    comparisonDigits: params.comparisonDigits,
    phase: params.phase,
    rawCandidateCode: params.rawCandidateCode,
    candidateCode: params.candidateCode,
    nearestDirection: params.nearestDirection ?? 'none',
    nearestDistance: params.nearestDistance ?? null,
    matchedPosition: params.matchedPosition ?? null,
    matchedUserId: params.matchedUserId ?? null,
    matchedTicketNumber: params.matchedTicketNumber ?? null,
  }
}

export function resolveWinnerByPrefixCycleV2(
  extractionNumbers: string[],
  ranking: RankedParticipant[],
): V2WinnerResolution | null {
  const normalizedExtractions = extractionNumbers.map((item) => normalizeExtraction(item))
  const preparedParticipants = prepareRanking(ranking)

  if (normalizedExtractions.length === 0 || preparedParticipants.length === 0) {
    return null
  }

  const attempts: V2ResolutionAttempt[] = []
  let attemptIndex = 0

  for (const comparisonDigits of DIGIT_CYCLE) {
    for (let extractionCursor = 0; extractionCursor < normalizedExtractions.length; extractionCursor += 1) {
      const extractionNumber = normalizedExtractions[extractionCursor] || '000000'
      const rawCandidateCode = getComparableSuffix(extractionNumber, comparisonDigits)
      const exactMatch = findExactMatchByPrefix(preparedParticipants, rawCandidateCode, comparisonDigits)

      attemptIndex += 1
      attempts.push(buildAttempt({
        attemptIndex,
        sourceExtractionIndex: extractionCursor + 1,
        extractionNumber,
        comparisonDigits,
        phase: 'exact',
        rawCandidateCode,
        candidateCode: rawCandidateCode,
        matchedPosition: exactMatch?.matchedPosition ?? null,
        matchedUserId: exactMatch?.matchedUserId ?? null,
        matchedTicketNumber: exactMatch?.matchedTicketNumber ?? null,
      }))

      if (exactMatch) {
        return {
          attempts,
          comparisonDigits,
          winningPosition: exactMatch.matchedPosition,
          winningCode: rawCandidateCode,
          winningTicketNumber: exactMatch.matchedTicketNumber,
          resolvedBy: 'federal_extraction',
        }
      }
    }
  }

  for (let extractionCursor = 0; extractionCursor < normalizedExtractions.length; extractionCursor += 1) {
    const extractionNumber = normalizedExtractions[extractionCursor] || '000000'
    const rawCandidateCode = getComparableSuffix(extractionNumber, MIN_FALLBACK_DIGITS)
    const nearestMatch = findNearestPrefixMatch(preparedParticipants, rawCandidateCode)
    const candidateCode = nearestMatch?.candidateCode || rawCandidateCode

    attemptIndex += 1
    attempts.push(buildAttempt({
      attemptIndex,
      sourceExtractionIndex: extractionCursor + 1,
      extractionNumber,
      comparisonDigits: MIN_FALLBACK_DIGITS,
      phase: 'nearest',
      rawCandidateCode,
      candidateCode,
      nearestDirection: nearestMatch?.nearestDirection ?? 'none',
      nearestDistance: nearestMatch?.nearestDistance ?? null,
      matchedPosition: nearestMatch?.matchedPosition ?? null,
      matchedUserId: nearestMatch?.matchedUserId ?? null,
      matchedTicketNumber: nearestMatch?.matchedTicketNumber ?? null,
    }))

    if (nearestMatch) {
      return {
        attempts,
        comparisonDigits: MIN_FALLBACK_DIGITS,
        winningPosition: nearestMatch.matchedPosition,
        winningCode: candidateCode,
        winningTicketNumber: nearestMatch.matchedTicketNumber,
        resolvedBy: 'federal_extraction',
      }
    }
  }

  const contingencyWinner = preparedParticipants[0]
  if (!contingencyWinner) {
    return null
  }
  const contingencyTicket = contingencyWinner.tickets[0] || null
  const contingencyCode = contingencyTicket
    ? contingencyTicket.slice(-MIN_FALLBACK_DIGITS).padStart(MIN_FALLBACK_DIGITS, '0')
    : '000'

  attemptIndex += 1
  attempts.push(buildAttempt({
    attemptIndex,
    sourceExtractionIndex: null,
    extractionNumber: 'fallback-contingency',
    comparisonDigits: MIN_FALLBACK_DIGITS,
    phase: 'contingency',
    rawCandidateCode: '',
    candidateCode: contingencyCode,
    matchedPosition: contingencyWinner.pos,
    matchedUserId: contingencyWinner.userId,
    matchedTicketNumber: contingencyTicket,
  }))

  return {
    attempts,
    comparisonDigits: MIN_FALLBACK_DIGITS,
    winningPosition: contingencyWinner.pos,
    winningCode: contingencyCode,
    winningTicketNumber: contingencyTicket,
    resolvedBy: 'redundancy',
  }
}
