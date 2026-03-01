import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChunkWindowNumbers,
  createEmptyChunkState,
  getChunkNumberView,
  markNumberAsPaid,
  markNumberAsReserved,
  readChunkStateFromDoc,
  reconcileChunkState,
  writeChunkStateToDoc,
} from './numberChunkStore.js'

const CAMPAIGN_ID = 'test-campaign'

function createChunk(bounds: { start: number; end: number }) {
  return createEmptyChunkState({
    campaignId: CAMPAIGN_ID,
    chunkStart: bounds.start,
    chunkEnd: bounds.end,
    size: bounds.end - bounds.start + 1,
  })
}

test('reserva 10 numeros atualiza contadores corretamente', () => {
  const state = createChunk({ start: 1, end: 1000 })

  for (let number = 1; number <= 10; number += 1) {
    markNumberAsReserved({
      state,
      number,
      uid: 'user-a',
      expiresAtMs: 2_000_000,
    })
  }

  const persisted = writeChunkStateToDoc(state, 1)
  assert.equal(persisted.reservedCount, 10)
  assert.equal(persisted.paidCount, 0)
  assert.equal(persisted.availableCount, 990)
})

test('reserva 1000 numeros cobre chunk inteiro', () => {
  const state = createChunk({ start: 1, end: 1000 })

  for (let number = 1; number <= 1000; number += 1) {
    markNumberAsReserved({
      state,
      number,
      uid: 'user-a',
      expiresAtMs: 2_000_000,
    })
  }

  const persisted = writeChunkStateToDoc(state, 1)
  assert.equal(persisted.reservedCount, 1000)
  assert.equal(persisted.paidCount, 0)
  assert.equal(persisted.availableCount, 0)
})

test('conflito concorrente: numero reservado por outro usuario', () => {
  const state = createChunk({ start: 1, end: 1000 })
  markNumberAsReserved({
    state,
    number: 321,
    uid: 'user-a',
    expiresAtMs: 2_000_000,
  })

  const view = getChunkNumberView(state, 321)
  assert.equal(view.status, 'reservado')
  assert.equal(view.reservedBy, 'user-a')
  assert.notEqual(view.reservedBy, 'user-b')
})

test('expiracao lazy remove reserva expirada', () => {
  const state = createChunk({ start: 1, end: 1000 })
  markNumberAsReserved({
    state,
    number: 75,
    uid: 'user-a',
    expiresAtMs: 1_000,
  })

  reconcileChunkState(state, 2_000)

  const view = getChunkNumberView(state, 75)
  assert.equal(view.status, 'disponivel')
  assert.equal(view.reservedBy, null)
  const persisted = writeChunkStateToDoc(state, 1)
  assert.equal(persisted.reservedCount, 0)
  assert.equal(persisted.availableCount, 1000)
})

test('leitura de pagina retorna 100 e 200 itens', () => {
  const chunkA = createChunk({ start: 1, end: 1000 })
  const chunkB = createChunk({ start: 1001, end: 2000 })

  markNumberAsReserved({
    state: chunkA,
    number: 120,
    uid: 'user-a',
    expiresAtMs: 2_000_000,
  })
  markNumberAsReserved({
    state: chunkB,
    number: 1010,
    uid: 'user-b',
    expiresAtMs: 2_000_000,
  })

  const states = new Map<number, typeof chunkA>([
    [chunkA.chunkStart, chunkA],
    [chunkB.chunkStart, chunkB],
  ])

  const page100 = buildChunkWindowNumbers({
    chunkStates: states,
    pageStart: 101,
    pageSize: 100,
    rangeEnd: 2000,
  })

  const page200 = buildChunkWindowNumbers({
    chunkStates: states,
    pageStart: 901,
    pageSize: 200,
    rangeEnd: 2000,
  })

  assert.equal(page100.length, 100)
  assert.equal(page100.find((item) => item.number === 120)?.status, 'reservado')
  assert.equal(page200.length, 200)
  assert.equal(page200.find((item) => item.number === 1010)?.status, 'reservado')
})

test('migracao idempotente (estado equivalente) gera mesmo chunk', () => {
  const toChunkDoc = () => {
    const state = createChunk({ start: 1, end: 1000 })
    markNumberAsPaid({
      state,
      number: 1,
      userId: 'user-a',
      orderId: 'order-1',
      paidAtMs: 1_000,
    })
    markNumberAsReserved({
      state,
      number: 2,
      uid: 'user-a',
      expiresAtMs: 3_000_000,
    })
    return writeChunkStateToDoc(state, 123)
  }

  const firstRun = toChunkDoc()
  const secondRun = toChunkDoc()

  assert.deepEqual(firstRun, secondRun)

  const reloaded = readChunkStateFromDoc({
    bounds: {
      campaignId: CAMPAIGN_ID,
      chunkStart: 1,
      chunkEnd: 1000,
      size: 1000,
    },
    docData: firstRun,
    nowMs: 2_000_000,
  })

  assert.equal(getChunkNumberView(reloaded, 1).status, 'pago')
  assert.equal(getChunkNumberView(reloaded, 2).status, 'reservado')
  assert.equal(getChunkNumberView(reloaded, 3).status, 'disponivel')
  assert.equal(reloaded.paidMeta['1']?.ownerUid, 'user-a')
})
