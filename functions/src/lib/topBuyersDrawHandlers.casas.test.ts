import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWinnerByFederalRule } from './topBuyersDrawHandlers.js'

test('resolveWinnerByFederalRule aplica comparacao por casas e percorre ranking em ordem para a mesma distancia', () => {
  const resolution = resolveWinnerByFederalRule(
    ['000002'],
    [
      { pos: 1, userId: 'u1', name: 'Player 1', cotas: 1, firstPurchaseAtMs: 1000, photoURL: '' },
      { pos: 3, userId: 'u2', name: 'Player 2', cotas: 1, firstPurchaseAtMs: 2000, photoURL: '' },
    ],
  )

  assert.equal(resolution.winningPosition, 1)
  assert.equal(resolution.winningCode, '001')
  assert.equal(resolution.attempts.length, 2)
  assert.equal(resolution.attempts[1]?.rawCandidateCode, '002')
  assert.equal(resolution.attempts[1]?.candidateCode, '001')
  assert.equal(resolution.attempts[1]?.nearestDirection, 'below')
})
