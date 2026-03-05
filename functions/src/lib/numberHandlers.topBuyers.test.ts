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

test('parseComparableWinnerTicket resolve corretamente em draw v2 por sufixo', () => {
  const comparable = parseComparableWinnerTicket({
    winnerTicketNumbers: ['9123456', '7654321'],
    winningPosition: 1,
    comparisonDigits: 6,
    winningCode: '123456',
    comparisonSide: 'right_suffix',
    attempts: [
      {
        extractionIndex: 1,
        extractionNumber: '123456',
        rawCandidateCode: '123456',
        candidateCode: '123456',
        matchedPosition: 1,
      },
    ],
  })

  assert.equal(comparable, 9123456)
})
