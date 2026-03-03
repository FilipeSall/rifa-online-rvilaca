import test from 'node:test'
import assert from 'node:assert/strict'
import { DateTime } from 'luxon'
import {
  buildDefaultTopBuyersWeeklySchedule,
  readTopBuyersWeeklySchedule,
  resolveCurrentCycleWindow,
  resolveCycleWindowForDrawAtMs,
  resolveFreezeAtMs,
  resolveNextDrawAtMs,
  TOP_BUYERS_SCHEDULE_TIMEZONE,
} from './topBuyersSchedule.js'

function msFromIsoInBrazil(iso: string) {
  return DateTime.fromISO(iso, { zone: TOP_BUYERS_SCHEDULE_TIMEZONE }).toMillis()
}

test('readTopBuyersWeeklySchedule usa fallback padrao quando campos faltam', () => {
  const schedule = readTopBuyersWeeklySchedule(undefined)
  assert.equal(schedule.dayOfWeek, 5)
  assert.equal(schedule.drawTime, '14:00')
  assert.equal(schedule.timezone, 'America/Sao_Paulo')
})

test('resolveFreezeAtMs calcula T-1h corretamente', () => {
  const drawAtMs = msFromIsoInBrazil('2026-03-06T14:00:00')
  const freezeAtMs = resolveFreezeAtMs(drawAtMs)
  assert.equal(
    DateTime.fromMillis(freezeAtMs, { zone: TOP_BUYERS_SCHEDULE_TIMEZONE }).toFormat('yyyy-LL-dd HH:mm'),
    '2026-03-06 13:00',
  )
})

test('resolveNextDrawAtMs encontra a proxima ocorrencia semanal futura', () => {
  const schedule = buildDefaultTopBuyersWeeklySchedule()
  const nowMs = msFromIsoInBrazil('2026-03-06T12:00:00')
  const nextDrawAtMs = resolveNextDrawAtMs(schedule, nowMs)
  assert.equal(
    DateTime.fromMillis(nextDrawAtMs, { zone: TOP_BUYERS_SCHEDULE_TIMEZONE }).toFormat('yyyy-LL-dd HH:mm'),
    '2026-03-06 14:00',
  )
})

test('resolveCurrentCycleWindow retorna ciclo anterior quando agora ainda esta antes do freeze da semana', () => {
  const schedule = buildDefaultTopBuyersWeeklySchedule()
  const nowMs = msFromIsoInBrazil('2026-03-06T12:30:00')
  const cycle = resolveCurrentCycleWindow(schedule, nowMs)

  assert.equal(cycle.weekId, '2026-02-27')
  assert.equal(
    DateTime.fromMillis(cycle.freezeAtMs, { zone: TOP_BUYERS_SCHEDULE_TIMEZONE }).toFormat('yyyy-LL-dd HH:mm'),
    '2026-02-27 13:00',
  )
  assert.equal(cycle.windowStartAtMs, resolveFreezeAtMs(msFromIsoInBrazil('2026-02-20T14:00:00')) + 1)
  assert.equal(cycle.windowEndAtMs, resolveFreezeAtMs(msFromIsoInBrazil('2026-02-27T14:00:00')))
})

test('resolveCurrentCycleWindow usa ciclo da semana atual quando agora ja passou do freeze', () => {
  const schedule = buildDefaultTopBuyersWeeklySchedule()
  const nowMs = msFromIsoInBrazil('2026-03-06T13:30:00')
  const cycle = resolveCurrentCycleWindow(schedule, nowMs)

  assert.equal(cycle.weekId, '2026-03-06')
  assert.equal(
    DateTime.fromMillis(cycle.freezeAtMs, { zone: TOP_BUYERS_SCHEDULE_TIMEZONE }).toFormat('yyyy-LL-dd HH:mm'),
    '2026-03-06 13:00',
  )
  assert.equal(
    DateTime.fromMillis(cycle.drawAtMs, { zone: TOP_BUYERS_SCHEDULE_TIMEZONE }).toFormat('yyyy-LL-dd HH:mm'),
    '2026-03-06 14:00',
  )
})

test('resolveCycleWindowForDrawAtMs gera janela sem sobreposicao com ciclo anterior', () => {
  const schedule = buildDefaultTopBuyersWeeklySchedule()
  const drawAtMs = msFromIsoInBrazil('2026-03-06T14:00:00')
  const current = resolveCycleWindowForDrawAtMs(schedule, drawAtMs)
  const previous = resolveCycleWindowForDrawAtMs(schedule, msFromIsoInBrazil('2026-02-27T14:00:00'))

  assert.equal(previous.windowEndAtMs + 1, current.windowStartAtMs)
})
