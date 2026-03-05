import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWinnerByFederalRule } from './topBuyersDrawHandlers.js'

test('resolveWinnerByFederalRule aplica ciclo por sufixo e fallback por proximidade em 3 digitos', () => {
  const resolution = resolveWinnerByFederalRule(
    ['123200'],
    [
      { pos: 1, userId: 'u1', name: 'Player 1', cotas: 1, firstPurchaseAtMs: 1000, photoURL: '' },
      { pos: 3, userId: 'u2', name: 'Player 2', cotas: 1, firstPurchaseAtMs: 2000, photoURL: '' },
    ],
    new Map([
      ['u1', ['1111201']],
      ['u2', ['2222350']],
    ]),
  )

  assert.ok(resolution)
  assert.equal(resolution?.winningPosition, 1)
  assert.equal(resolution?.winningCode, '201')
  assert.equal(resolution?.comparisonDigits, 3)
  assert.equal(resolution?.winningTicketNumber, '1111201')

  const nearestAttempt = resolution?.attempts.find((attempt) => attempt.phase === 'nearest')
  assert.equal(nearestAttempt?.rawCandidateCode, '200')
  assert.equal(nearestAttempt?.candidateCode, '201')
  assert.equal(nearestAttempt?.nearestDirection, 'above')
})
