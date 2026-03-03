import { DateTime } from 'luxon'
import { CAMPAIGN_DEADLINE_TIMEZONE } from '../const/publicCampaignDeadline'

function sanitizeCampaignDate(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null
  }

  return normalized
}

function sanitizeCampaignTime(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    return null
  }

  return normalized
}

export function sanitizeCampaignDeadlineTimezone(value: unknown) {
  if (typeof value !== 'string') {
    return CAMPAIGN_DEADLINE_TIMEZONE
  }

  const normalized = value.trim()
  if (!normalized) {
    return CAMPAIGN_DEADLINE_TIMEZONE
  }

  return DateTime.now().setZone(normalized).isValid ? normalized : CAMPAIGN_DEADLINE_TIMEZONE
}

export function resolveCampaignDeadlineAtMs(
  endsAt: string | null | undefined,
  endsAtTime: string | null | undefined,
  timezone: string | null | undefined = CAMPAIGN_DEADLINE_TIMEZONE,
): number | null {
  const normalizedDate = sanitizeCampaignDate(endsAt)
  if (!normalizedDate) {
    return null
  }

  const normalizedTime = sanitizeCampaignTime(endsAtTime) || '23:59'
  const normalizedTimezone = sanitizeCampaignDeadlineTimezone(timezone)
  const dateTime = DateTime.fromISO(`${normalizedDate}T${normalizedTime}:00`, {
    zone: normalizedTimezone,
  })

  if (!dateTime.isValid) {
    return null
  }

  return dateTime.toMillis()
}
