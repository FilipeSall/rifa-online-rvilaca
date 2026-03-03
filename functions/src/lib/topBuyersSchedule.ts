import { type DocumentData } from 'firebase-admin/firestore'
import { DateTime } from 'luxon'
import { asRecord, sanitizeString } from './shared.js'

export const TOP_BUYERS_SCHEDULE_TIMEZONE = 'America/Sao_Paulo' as const
export const TOP_BUYERS_DEFAULT_DAY_OF_WEEK = 5 as const // Friday
export const TOP_BUYERS_DEFAULT_DRAW_TIME = '14:00' as const
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const FREEZE_OFFSET_MS = 0

export type TopBuyersWeeklySchedule = {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  drawTime: string
  timezone: typeof TOP_BUYERS_SCHEDULE_TIMEZONE
  skipWeekId?: string | null
}

export type TopBuyersCycleWindow = {
  weekId: string
  windowStartAtMs: number
  windowEndAtMs: number
  freezeAtMs: number
  drawAtMs: number
  scheduleDayOfWeek: TopBuyersWeeklySchedule['dayOfWeek']
  scheduleDrawTime: string
  scheduleTimezone: typeof TOP_BUYERS_SCHEDULE_TIMEZONE
}

function sanitizeDayOfWeek(value: unknown): TopBuyersWeeklySchedule['dayOfWeek'] {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) {
    return TOP_BUYERS_DEFAULT_DAY_OF_WEEK
  }

  return parsed as TopBuyersWeeklySchedule['dayOfWeek']
}

function sanitizeDrawTime(value: unknown): string {
  const normalized = sanitizeString(value)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    return TOP_BUYERS_DEFAULT_DRAW_TIME
  }

  return normalized
}

function sanitizeWeekId(value: unknown): string | null {
  const normalized = sanitizeString(value)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null
  }

  return normalized
}

function parseDrawTime(drawTime: string): { hour: number, minute: number } {
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

function getWeekIdFromDrawAtMs(drawAtMs: number, timezone: string) {
  return DateTime.fromMillis(drawAtMs, { zone: timezone }).toFormat('yyyy-LL-dd')
}

export function buildDefaultTopBuyersWeeklySchedule(): TopBuyersWeeklySchedule {
  return {
    dayOfWeek: TOP_BUYERS_DEFAULT_DAY_OF_WEEK,
    drawTime: TOP_BUYERS_DEFAULT_DRAW_TIME,
    timezone: TOP_BUYERS_SCHEDULE_TIMEZONE,
    skipWeekId: null,
  }
}

export function readTopBuyersWeeklySchedule(campaignData: DocumentData | undefined): TopBuyersWeeklySchedule {
  const payload = asRecord(campaignData)
  const rawSchedule = asRecord(payload.topBuyersWeeklySchedule)

  return {
    dayOfWeek: sanitizeDayOfWeek(rawSchedule.dayOfWeek),
    drawTime: sanitizeDrawTime(rawSchedule.drawTime),
    timezone: TOP_BUYERS_SCHEDULE_TIMEZONE,
    skipWeekId: sanitizeWeekId(rawSchedule.skipWeekId),
  }
}

export function resolveFreezeAtMs(drawAtMs: number) {
  return drawAtMs - FREEZE_OFFSET_MS
}

export function resolveNextDrawAtMs(
  schedule: TopBuyersWeeklySchedule,
  nowMs = Date.now(),
): number {
  const now = DateTime.fromMillis(nowMs, { zone: schedule.timezone })
  const { hour, minute } = parseDrawTime(schedule.drawTime)
  const nowIsoWeekday = now.weekday
  const targetIsoWeekday = getIsoWeekday(schedule.dayOfWeek)
  let diffDays = targetIsoWeekday - nowIsoWeekday

  if (diffDays < 0) {
    diffDays += 7
  }

  let candidate = now
    .startOf('day')
    .plus({ days: diffDays })
    .set({ hour, minute, second: 0, millisecond: 0 })

  if (candidate.toMillis() < nowMs) {
    candidate = candidate.plus({ days: 7 })
  }

  return candidate.toMillis()
}

export function resolveCycleWindowForDrawAtMs(
  schedule: TopBuyersWeeklySchedule,
  drawAtMs: number,
): TopBuyersCycleWindow {
  const freezeAtMs = resolveFreezeAtMs(drawAtMs)
  const previousFreezeAtMs = resolveFreezeAtMs(drawAtMs - WEEK_MS)

  return {
    weekId: getWeekIdFromDrawAtMs(drawAtMs, schedule.timezone),
    windowStartAtMs: previousFreezeAtMs + 1,
    windowEndAtMs: freezeAtMs,
    freezeAtMs,
    drawAtMs,
    scheduleDayOfWeek: schedule.dayOfWeek,
    scheduleDrawTime: schedule.drawTime,
    scheduleTimezone: schedule.timezone,
  }
}

export function resolveCurrentCycleWindow(
  schedule: TopBuyersWeeklySchedule,
  nowMs = Date.now(),
): TopBuyersCycleWindow {
  const nextDrawAtMs = resolveNextDrawAtMs(schedule, nowMs)
  const nextFreezeAtMs = resolveFreezeAtMs(nextDrawAtMs)
  const currentDrawAtMs = nowMs >= nextFreezeAtMs
    ? nextDrawAtMs
    : nextDrawAtMs - WEEK_MS

  return resolveCycleWindowForDrawAtMs(schedule, currentDrawAtMs)
}
