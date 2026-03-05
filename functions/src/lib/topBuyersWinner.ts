export type TopBuyersWinnerAttemptLike = {
  matchedPosition?: number | null
  rawCandidateCode?: string
  candidateCode?: string
}

type PickTopBuyersWinningTicketInput = {
  winningTicketNumber?: string | null
  winnerTicketNumbers: string[]
  attempts?: TopBuyersWinnerAttemptLike[]
  winningPosition?: number | null
  comparisonDigits?: number
  winningCode?: string
  comparisonSide?: 'left_prefix' | 'right_suffix'
}

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeTicket(value: string) {
  const digits = sanitizeDigits(value.trim())
  if (!digits) {
    return null
  }

  return digits.length >= 7 ? digits : digits.padStart(7, '0')
}

function normalizeTickets(tickets: string[]) {
  const unique = new Set<string>()

  for (const ticket of tickets) {
    const normalized = normalizeTicket(ticket)
    if (normalized) {
      unique.add(normalized)
    }
  }

  return Array.from(unique).sort((left, right) => {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber
    }
    return left.localeCompare(right)
  })
}

function normalizeCode(value: string, digits: number) {
  const raw = sanitizeDigits(value)
  if (!raw) {
    return ''
  }

  if (digits <= 0) {
    return raw
  }

  return raw.slice(-digits).padStart(digits, '0')
}

function extractComparableCode(value: string, digits: number, side: 'left_prefix' | 'right_suffix') {
  const normalized = sanitizeDigits(value)
  if (!normalized) {
    return ''
  }

  if (side === 'left_prefix') {
    return normalized.slice(0, digits).padEnd(digits, '0')
  }

  return normalized.slice(-digits).padStart(digits, '0')
}

function resolveComparisonDigits(input: PickTopBuyersWinningTicketInput, winnerAttempt: TopBuyersWinnerAttemptLike | null) {
  const explicitDigits = Number(input.comparisonDigits)
  if (Number.isInteger(explicitDigits) && explicitDigits > 0) {
    return explicitDigits
  }

  const fromRaw = sanitizeDigits(String(winnerAttempt?.rawCandidateCode || ''))
  if (fromRaw.length > 0) {
    return fromRaw.length
  }

  const fromResolved = sanitizeDigits(String(winnerAttempt?.candidateCode || ''))
  if (fromResolved.length > 0) {
    return fromResolved.length
  }

  const fromWinningCode = sanitizeDigits(String(input.winningCode || ''))
  if (fromWinningCode.length > 0) {
    return fromWinningCode.length
  }

  return 3
}

export function pickTopBuyersWinningTicketNumber(input: PickTopBuyersWinningTicketInput): string | null {
  const persistedTicket = normalizeTicket(String(input.winningTicketNumber || ''))
  if (persistedTicket) {
    return persistedTicket
  }

  const normalizedTickets = normalizeTickets(input.winnerTicketNumbers)
  if (normalizedTickets.length === 0) {
    return null
  }

  const winningPosition = Number(input.winningPosition)
  const winnerAttempt = Number.isInteger(winningPosition) && winningPosition > 0
    ? (input.attempts || []).find((attempt) => Number(attempt.matchedPosition) === winningPosition) || null
    : null
  const comparisonSide = input.comparisonSide === 'left_prefix' ? 'left_prefix' : 'right_suffix'
  const comparisonDigits = resolveComparisonDigits(input, winnerAttempt)
  const rawCode = normalizeCode(String(winnerAttempt?.rawCandidateCode || winnerAttempt?.candidateCode || ''), comparisonDigits)
  const resolvedCode = normalizeCode(String(winnerAttempt?.candidateCode || ''), comparisonDigits)
  const fallbackWinningCode = normalizeCode(String(input.winningCode || ''), comparisonDigits)

  const byRawCode = normalizedTickets.find((ticket) => extractComparableCode(ticket, comparisonDigits, comparisonSide) === rawCode) || null
  if (byRawCode) {
    return byRawCode
  }

  const byResolvedCode = resolvedCode !== rawCode
    ? normalizedTickets.find((ticket) => extractComparableCode(ticket, comparisonDigits, comparisonSide) === resolvedCode) || null
    : null
  if (byResolvedCode) {
    return byResolvedCode
  }

  const byWinningCode = fallbackWinningCode && fallbackWinningCode !== rawCode && fallbackWinningCode !== resolvedCode
    ? normalizedTickets.find((ticket) => extractComparableCode(ticket, comparisonDigits, comparisonSide) === fallbackWinningCode) || null
    : null
  if (byWinningCode) {
    return byWinningCode
  }

  return normalizedTickets[0]
}
