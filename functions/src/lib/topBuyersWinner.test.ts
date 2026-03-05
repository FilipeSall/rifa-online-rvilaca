import test from 'node:test'
import assert from 'node:assert/strict'
import { pickTopBuyersWinningTicketNumber } from './topBuyersWinner.js'

test('pickTopBuyersWinningTicketNumber prioriza final bruto da extracao no fluxo de aproximacao', () => {
  const ticket = pickTopBuyersWinningTicketNumber({
    winnerTicketNumbers: ['0016747', '0907200'],
    attempts: [
      {
        matchedPosition: 6,
        rawCandidateCode: '200',
        candidateCode: '006',
      },
    ],
    winningPosition: 6,
    comparisonDigits: 3,
    winningCode: '006',
  })

  assert.equal(ticket, '0907200')
})

test('pickTopBuyersWinningTicketNumber usa match direto quando nao ha aproximacao', () => {
  const ticket = pickTopBuyersWinningTicketNumber({
    winnerTicketNumbers: ['0016747', '0907200'],
    attempts: [
      {
        matchedPosition: 6,
        rawCandidateCode: '747',
        candidateCode: '747',
      },
    ],
    winningPosition: 6,
    comparisonDigits: 3,
    winningCode: '747',
  })

  assert.equal(ticket, '0016747')
})

test('pickTopBuyersWinningTicketNumber mantem compatibilidade com legado usando attempts e winningCode', () => {
  const ticket = pickTopBuyersWinningTicketNumber({
    winnerTicketNumbers: ['0016747', '0907200'],
    attempts: [
      {
        matchedPosition: 6,
        rawCandidateCode: '200',
        candidateCode: '006',
      },
    ],
    winningPosition: 6,
    comparisonDigits: 3,
    winningCode: '006',
  })

  assert.equal(ticket, '0907200')
})

test('pickTopBuyersWinningTicketNumber respeita winningTicketNumber persistido', () => {
  const ticket = pickTopBuyersWinningTicketNumber({
    winningTicketNumber: '0907200',
    winnerTicketNumbers: [],
    attempts: [],
    winningPosition: 6,
    comparisonDigits: 3,
    winningCode: '006',
  })

  assert.equal(ticket, '0907200')
})

test('pickTopBuyersWinningTicketNumber suporta comparacao por prefixo na regra v2', () => {
  const ticket = pickTopBuyersWinningTicketNumber({
    winnerTicketNumbers: ['1234567', '9999999'],
    attempts: [
      {
        matchedPosition: 1,
        rawCandidateCode: '123456',
        candidateCode: '123456',
      },
    ],
    winningPosition: 1,
    comparisonDigits: 6,
    winningCode: '123456',
    comparisonSide: 'left_prefix',
  })

  assert.equal(ticket, '1234567')
})
