const TICKET_NUMBER_DIGITS = 7

export function formatTicketNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0) {
    return '-'
  }

  return String(value).padStart(TICKET_NUMBER_DIGITS, '0')
}

export function formatTicketNumbers(values: number[]): string[] {
  return values.map((value) => formatTicketNumber(value))
}
