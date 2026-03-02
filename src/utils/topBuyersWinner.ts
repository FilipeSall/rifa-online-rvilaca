type ComparableWinnerAttempt = {
  matchedPosition?: number | null
  rawCandidateCode?: string
  candidateCode?: string
}

type ComparableWinnerTicketInput = {
  winningTicketNumber?: string | null
  winningCode?: string
  winnerTicketNumbers: string[]
  attempts?: ComparableWinnerAttempt[]
  winningPosition?: number | null
  comparisonDigits?: number
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

function resolveComparisonDigits(input: ComparableWinnerTicketInput, winnerAttempt: ComparableWinnerAttempt | null) {
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

export function pickComparableWinnerTicketNumber(input: ComparableWinnerTicketInput): string | null {
  const persistedTicket = normalizeTicket(String(input.winningTicketNumber || ''))
  if (persistedTicket) {
    return persistedTicket
  }

  const normalizedTickets = Array.from(new Set(
    input.winnerTicketNumbers
      .map((ticket) => normalizeTicket(ticket))
      .filter((ticket): ticket is string => Boolean(ticket)),
  )).sort((left, right) => {
      const leftNumber = Number(left)
      const rightNumber = Number(right)
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber
      }
      return left.localeCompare(right)
    })

  if (!normalizedTickets.length) {
    return null
  }

  const winningPosition = Number(input.winningPosition)
  const winnerAttempt = Number.isInteger(winningPosition) && winningPosition > 0
    ? (input.attempts || []).find((attempt) => Number(attempt.matchedPosition) === winningPosition) || null
    : null
  const comparisonDigits = resolveComparisonDigits(input, winnerAttempt)
  const rawCode = normalizeCode(String(winnerAttempt?.rawCandidateCode || winnerAttempt?.candidateCode || ''), comparisonDigits)
  const resolvedCode = normalizeCode(String(winnerAttempt?.candidateCode || ''), comparisonDigits)
  const fallbackWinningCode = normalizeCode(String(input.winningCode || ''), comparisonDigits)

  const byRawCode = rawCode
    ? normalizedTickets.find((ticket) => ticket.endsWith(rawCode))
    : null
  if (byRawCode) {
    return byRawCode
  }

  const byResolvedCode = resolvedCode && resolvedCode !== rawCode
    ? normalizedTickets.find((ticket) => ticket.endsWith(resolvedCode))
    : null
  if (byResolvedCode) {
    return byResolvedCode
  }

  const byWinningCode = fallbackWinningCode && fallbackWinningCode !== rawCode && fallbackWinningCode !== resolvedCode
    ? normalizedTickets.find((ticket) => ticket.endsWith(fallbackWinningCode))
    : null
  if (byWinningCode) {
    return byWinningCode
  }

  return normalizedTickets[0]
}
