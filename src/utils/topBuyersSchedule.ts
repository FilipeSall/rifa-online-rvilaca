import { DateTime } from 'luxon'
import {
  DEFAULT_TOP_BUYERS_DRAW_DAY_OF_WEEK,
  DEFAULT_TOP_BUYERS_DRAW_TIME,
  TOP_BUYERS_SCHEDULE_TIMEZONE,
} from '../const/campaign'
import type { TopBuyersWeeklySchedule } from '../types/campaign'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const FREEZE_OFFSET_MS = 60 * 60 * 1000

function sanitizeDayOfWeek(value: unknown): TopBuyersWeeklySchedule['dayOfWeek'] {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    return DEFAULT_TOP_BUYERS_DRAW_DAY_OF_WEEK
  }

  return parsed as TopBuyersWeeklySchedule['dayOfWeek']
}

function sanitizeDrawTime(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_TOP_BUYERS_DRAW_TIME
  }

  const normalized = value.trim()
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    return DEFAULT_TOP_BUYERS_DRAW_TIME
  }

  return normalized
}

function parseDrawTime(drawTime: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(drawTime)
  if (!match) {
    return { hour: 14, minute: 0 }
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  }
}

function getIsoWeekday(dayOfWeek: TopBuyersWeeklySchedule['dayOfWeek']) {
  return dayOfWeek === 0 ? 7 : dayOfWeek
}

export function normalizeTopBuyersWeeklySchedule(value: unknown): TopBuyersWeeklySchedule {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    dayOfWeek: sanitizeDayOfWeek(payload.dayOfWeek),
    drawTime: sanitizeDrawTime(payload.drawTime),
    timezone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }
}

export function resolveFreezeAtMs(drawAtMs: number) {
  return drawAtMs - FREEZE_OFFSET_MS
}

export function resolveNextDrawAtMs(
  schedule: TopBuyersWeeklySchedule,
  nowMs = Date.now(),
): number {
  const normalized = normalizeTopBuyersWeeklySchedule(schedule)
  const now = DateTime.fromMillis(nowMs, { zone: normalized.timezone })
  const { hour, minute } = parseDrawTime(normalized.drawTime)
  const nowIsoWeekday = now.weekday
  const targetIsoWeekday = getIsoWeekday(normalized.dayOfWeek)
  let diffDays = targetIsoWeekday - nowIsoWeekday

  if (diffDays < 0) {
    diffDays += 7
  }

  let candidate = now
    .startOf('day')
    .plus({ days: diffDays })
    .set({ hour, minute, second: 0, millisecond: 0 })

  if (candidate.toMillis() <= nowMs) {
    candidate = candidate.plus({ days: 7 })
  }

  return candidate.toMillis()
}

export function resolveCurrentCycleWindow(
  schedule: TopBuyersWeeklySchedule,
  nowMs = Date.now(),
) {
  const normalized = normalizeTopBuyersWeeklySchedule(schedule)
  const nextDrawAtMs = resolveNextDrawAtMs(normalized, nowMs)
  const nextFreezeAtMs = resolveFreezeAtMs(nextDrawAtMs)
  const drawAtMs = nowMs >= nextFreezeAtMs
    ? nextDrawAtMs
    : nextDrawAtMs - WEEK_MS
  const freezeAtMs = resolveFreezeAtMs(drawAtMs)
  const previousFreezeAtMs = resolveFreezeAtMs(drawAtMs - WEEK_MS)

  return {
    drawAtMs,
    freezeAtMs,
    windowStartAtMs: previousFreezeAtMs + 1,
    windowEndAtMs: freezeAtMs,
    weekId: DateTime.fromMillis(drawAtMs, { zone: normalized.timezone }).toFormat('yyyy-LL-dd'),
    scheduleDayOfWeek: normalized.dayOfWeek,
    scheduleDrawTime: normalized.drawTime,
    scheduleTimezone: normalized.timezone,
  }
}
