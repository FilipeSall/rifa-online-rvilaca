import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWinnerByPrefixCycleV2 } from './drawV2Engine.js'

test('resolveWinnerByPrefixCycleV2 encontra match direto em 6 digitos na primeira extracao', () => {
  const resolution = resolveWinnerByPrefixCycleV2(
    ['123456'],
    [
      { pos: 1, userId: 'u1', tickets: ['0123456'] },
      { pos: 2, userId: 'u2', tickets: ['9999999'] },
    ],
  )

  assert.ok(resolution)
  assert.equal(resolution?.comparisonDigits, 6)
  assert.equal(resolution?.winningPosition, 1)
  assert.equal(resolution?.winningCode, '123456')
  assert.equal(resolution?.winningTicketNumber, '0123456')
})

test('resolveWinnerByPrefixCycleV2 reduz para 5 digitos e respeita ordem das extracoes', () => {
  const resolution = resolveWinnerByPrefixCycleV2(
    ['987654', '555550'],
    [
      { pos: 1, userId: 'u1', tickets: ['1111199'] },
      { pos: 2, userId: 'u2', tickets: ['1955550'] },
    ],
  )

  assert.ok(resolution)
  assert.equal(resolution?.comparisonDigits, 5)
  assert.equal(resolution?.winningPosition, 2)
  assert.equal(resolution?.winningCode, '55550')
})

test('resolveWinnerByPrefixCycleV2 reduz ate 3 digitos antes do fallback', () => {
  const resolution = resolveWinnerByPrefixCycleV2(
    ['888999'],
    [
      { pos: 1, userId: 'u1', tickets: ['1234999'] },
      { pos: 2, userId: 'u2', tickets: ['7777777'] },
    ],
  )

  assert.ok(resolution)
  assert.equal(resolution?.comparisonDigits, 3)
  assert.equal(resolution?.winningPosition, 1)
  assert.equal(resolution?.winningCode, '999')
})

test('resolveWinnerByPrefixCycleV2 aplica fallback por proximidade em 3 digitos', () => {
  const resolution = resolveWinnerByPrefixCycleV2(
    ['000002'],
    [
      { pos: 1, userId: 'u1', tickets: ['9876001'] },
      { pos: 2, userId: 'u2', tickets: ['1234003'] },
    ],
  )

  assert.ok(resolution)
  assert.equal(resolution?.comparisonDigits, 3)
  assert.equal(resolution?.winningPosition, 1)
  assert.equal(resolution?.winningCode, '001')
  const nearestAttempt = resolution?.attempts.find((attempt) => attempt.phase === 'nearest')
  assert.equal(nearestAttempt?.nearestDirection, 'below')
})

test('resolveWinnerByPrefixCycleV2 escolhe o menor bilhete quando ha multiplos matches', () => {
  const resolution = resolveWinnerByPrefixCycleV2(
    ['123456'],
    [
      { pos: 1, userId: 'u1', tickets: ['9123456', '8123456', '7123456'] },
    ],
  )

  assert.ok(resolution)
  assert.equal(resolution?.winningTicketNumber, '7123456')
})
