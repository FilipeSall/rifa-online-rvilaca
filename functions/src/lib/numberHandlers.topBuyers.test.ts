import test from 'node:test'
import assert from 'node:assert/strict'
import { parseComparableWinnerTicket } from './numberHandlers.js'

test('parseComparableWinnerTicket usa winningTicketNumber oficial quando presente', () => {
  const comparable = parseComparableWinnerTicket({
    winningTicketNumber: '0907200',
    winnerTicketNumbers: ['0016747'],
    winningCode: '006',
  })

  assert.equal(comparable, 907200)
})

test('parseComparableWinnerTicket resolve corretamente em draw legado com aproximacao', () => {
  const comparable = parseComparableWinnerTicket({
    winnerTicketNumbers: ['0016747', '0907200'],
    winningPosition: 6,
    comparisonDigits: 3,
    winningCode: '006',
    attempts: [
      {
        extractionIndex: 6,
        extractionNumber: '199200',
        rawCandidateCode: '200',
        candidateCode: '006',
        matchedPosition: 6,
      },
    ],
  })

  assert.equal(comparable, 907200)
})
