import type { CampaignStatus } from '../types/campaign'

type ScheduleStatus = Extract<CampaignStatus, 'scheduled' | 'active' | 'finished'>

export function parseCampaignDateTime(
  dateValue: string | null | undefined,
  timeValue: string | null | undefined,
  useEndOfDayFallback: boolean,
): number | null {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return null
  }

  const hasValidTime = typeof timeValue === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeValue)
  const effectiveTime = hasValidTime ? timeValue : (useEndOfDayFallback ? '23:59' : '00:00')
  const parsed = new Date(`${dateValue}T${effectiveTime}:00`)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.getTime()
}

export function resolveCampaignScheduleStatus(params: {
  startsAt: string | null | undefined
  startsAtTime: string | null | undefined
  endsAt: string | null | undefined
  endsAtTime: string | null | undefined
  nowMs?: number
}): ScheduleStatus {
  const nowMs = params.nowMs ?? Date.now()
  const startsAtMs = parseCampaignDateTime(params.startsAt, params.startsAtTime, false)
  const endsAtMs = parseCampaignDateTime(params.endsAt, params.endsAtTime, true)

  if (startsAtMs !== null && nowMs < startsAtMs) {
    return 'scheduled'
  }

  if (endsAtMs !== null && nowMs > endsAtMs) {
    return 'finished'
  }

  return 'active'
}

export function getScheduleStatusLabel(status: ScheduleStatus) {
  if (status === 'scheduled') {
    return 'Agendada'
  }

  if (status === 'finished') {
    return 'Encerrada'
  }

  return 'Ativa'
}
