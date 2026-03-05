import { TOP_BUYERS_SCHEDULE_TIMEZONE } from '../../../../../const/campaign'

export function formatBrazilDateTime(valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }).format(new Date(valueMs))
}

export function formatBrazilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }).format(parsed)
}
