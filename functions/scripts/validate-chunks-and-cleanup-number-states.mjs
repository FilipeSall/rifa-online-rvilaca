#!/usr/bin/env node

import process from 'node:process'
import fs from 'node:fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'
const DEFAULT_RANGE_START = 1
const DEFAULT_RANGE_END = 3_450_000
const CHUNK_SIZE = 1000
const DELETE_CONFIRM_PHRASE = 'DELETE_NUMBER_STATES_LEGACY'
const DEFAULT_CHUNK_LIMIT = 10
const DEFAULT_DELETE_LIMIT = 5000

function parseArgs(argv) {
  const flags = {
    campaignId: DEFAULT_CAMPAIGN_ID,
    projectId: '',
    batchChunks: 20,
    chunkLimit: DEFAULT_CHUNK_LIMIT,
    deleteBatchSize: 400,
    deleteLimit: DEFAULT_DELETE_LIMIT,
    rangeStart: null,
    rangeEnd: null,
    nowMs: Date.now(),
    deleteLegacy: false,
    allowMismatchDelete: false,
    allowFullScan: false,
    confirmDelete: '',
    sampleLimit: 5,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--campaignId' && argv[index + 1]) {
      flags.campaignId = String(argv[index + 1]).trim()
      index += 1
      continue
    }

    if (arg === '--projectId' && argv[index + 1]) {
      flags.projectId = String(argv[index + 1]).trim()
      index += 1
      continue
    }

    if (arg === '--batchChunks' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        flags.batchChunks = parsed
      }
      index += 1
      continue
    }

    if (arg === '--chunkLimit' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed >= 0) {
        flags.chunkLimit = parsed
      }
      index += 1
      continue
    }

    if (arg === '--deleteBatchSize' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        flags.deleteBatchSize = parsed
      }
      index += 1
      continue
    }

    if (arg === '--deleteLimit' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed >= 0) {
        flags.deleteLimit = parsed
      }
      index += 1
      continue
    }

    if (arg === '--rangeStart' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        flags.rangeStart = parsed
      }
      index += 1
      continue
    }

    if (arg === '--rangeEnd' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        flags.rangeEnd = parsed
      }
      index += 1
      continue
    }

    if (arg === '--nowMs' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isFinite(parsed) && parsed > 0) {
        flags.nowMs = parsed
      }
      index += 1
      continue
    }

    if (arg === '--sampleLimit' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        flags.sampleLimit = parsed
      }
      index += 1
      continue
    }

    if (arg === '--delete-legacy') {
      flags.deleteLegacy = true
      continue
    }

    if (arg === '--allow-mismatch-delete') {
      flags.allowMismatchDelete = true
      continue
    }

    if (arg === '--allow-full-scan') {
      flags.allowFullScan = true
      continue
    }

    if (arg === '--confirm-delete' && argv[index + 1]) {
      flags.confirmDelete = String(argv[index + 1]).trim()
      index += 1
      continue
    }

    if (arg === '--dry-run' || arg === '--dryRun') {
      flags.dryRun = true
      continue
    }
  }

  return flags
}

function readProjectIdFromFirebaseConfigEnv() {
  const raw = process.env.FIREBASE_CONFIG
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    return readString(parsed?.projectId)
  } catch {
    return null
  }
}

function readProjectIdFromGoogleCredentialsFile() {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credentialPath) {
    return null
  }

  try {
    const raw = fs.readFileSync(credentialPath, 'utf8')
    const parsed = JSON.parse(raw)
    return readString(parsed?.project_id)
  } catch {
    return null
  }
}

function resolveProjectId(explicitProjectId) {
  return (
    readString(explicitProjectId)
    || readString(process.env.GCLOUD_PROJECT)
    || readString(process.env.GOOGLE_CLOUD_PROJECT)
    || readProjectIdFromFirebaseConfigEnv()
    || readProjectIdFromGoogleCredentialsFile()
    || null
  )
}

function readPositiveInteger(value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null
  }

  return numeric
}

function readString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  return null
}

function readTimestampMillis(value) {
  if (!value) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }

  if (typeof value.toMillis === 'function') {
    try {
      const ms = value.toMillis()
      return Number.isFinite(ms) ? ms : null
    } catch {
      return null
    }
  }

  if (typeof value === 'object') {
    const seconds = Number(value.seconds)
    const nanos = Number(value.nanoseconds)
    if (Number.isFinite(seconds)) {
      return (seconds * 1000) + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1_000_000)
    }
  }

  return null
}

function readStatus(value) {
  const status = readString(value)?.toLowerCase() || ''
  if (status === 'pago' || status === 'paid') {
    return 'pago'
  }

  if (status === 'reservado' || status === 'reserved') {
    return 'reservado'
  }

  return 'disponivel'
}

function createBitmap(size) {
  return new Uint8Array(Math.ceil(Math.max(size, 0) / 8))
}

function decodeBitmap(base64, size) {
  if (typeof base64 !== 'string' || !base64) {
    return createBitmap(size)
  }

  try {
    const decoded = Buffer.from(base64, 'base64')
    const expectedBytes = Math.ceil(Math.max(size, 0) / 8)
    if (decoded.length !== expectedBytes) {
      return createBitmap(size)
    }

    return Uint8Array.from(decoded)
  } catch {
    return createBitmap(size)
  }
}

function setBit(bitmap, index, enabled) {
  const byteIndex = Math.floor(index / 8)
  const bitIndex = index % 8
  if (byteIndex < 0 || byteIndex >= bitmap.length) {
    return
  }

  const mask = 1 << bitIndex
  bitmap[byteIndex] = enabled ? bitmap[byteIndex] | mask : bitmap[byteIndex] & (~mask)
}

function getBit(bitmap, index) {
  const byteIndex = Math.floor(index / 8)
  const bitIndex = index % 8
  if (byteIndex < 0 || byteIndex >= bitmap.length) {
    return false
  }

  return (bitmap[byteIndex] & (1 << bitIndex)) !== 0
}

function resolveCampaignRange(campaignData, explicitRangeStart, explicitRangeEnd) {
  const start = explicitRangeStart
    || readPositiveInteger(campaignData?.numberStart)
    || DEFAULT_RANGE_START

  const explicitEnd = explicitRangeEnd || readPositiveInteger(campaignData?.numberEnd)
  const totalFromDoc = readPositiveInteger(campaignData?.totalNumbers ?? campaignData?.totalCotas)

  let end = DEFAULT_RANGE_END
  if (explicitEnd && explicitEnd >= start) {
    end = explicitEnd
  } else if (totalFromDoc) {
    end = start + totalFromDoc - 1
  } else if (DEFAULT_RANGE_END < start) {
    end = start
  }

  return {
    start,
    end,
    total: Math.max(0, end - start + 1),
  }
}

function resolveChunkBounds(rangeStart, rangeEnd, chunkStart) {
  const safeStart = Math.max(rangeStart, Math.min(chunkStart, rangeEnd))
  const chunkEnd = Math.min(safeStart + CHUNK_SIZE - 1, rangeEnd)
  return {
    chunkStart: safeStart,
    chunkEnd,
    size: Math.max(0, chunkEnd - safeStart + 1),
  }
}

function readReservationMeta(rawMeta, chunkStart, chunkEnd) {
  const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {}
  const result = {}

  for (const [key, value] of Object.entries(meta)) {
    const number = Number(key)
    if (!Number.isInteger(number) || number < chunkStart || number > chunkEnd) {
      continue
    }

    const record = value && typeof value === 'object' ? value : {}
    const reservedBy = readString(record.reservedBy)
    const expiresAtMs = readTimestampMillis(record.expiresAtMs ?? record.expiresAt ?? record.reservationExpiresAt)

    if (!reservedBy || !expiresAtMs || expiresAtMs <= 0) {
      continue
    }

    result[String(number)] = {
      reservedBy,
      expiresAtMs,
    }
  }

  return result
}

function readPaidMeta(rawMeta, chunkStart, chunkEnd) {
  const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {}
  const result = {}

  for (const [key, value] of Object.entries(meta)) {
    const number = Number(key)
    if (!Number.isInteger(number) || number < chunkStart || number > chunkEnd) {
      continue
    }

    const record = value && typeof value === 'object' ? value : {}
    const ownerUid = readString(record.ownerUid)
    const orderId = readString(record.orderId)

    if (!ownerUid || !orderId) {
      continue
    }

    result[String(number)] = {
      ownerUid,
      orderId,
      paidAtMs: readTimestampMillis(record.paidAtMs ?? record.paidAt),
      awardedDrawId: readString(record.awardedDrawId),
      awardedPrize: readString(record.awardedPrize),
      awardedAtMs: readTimestampMillis(record.awardedAtMs ?? record.awardedAt),
    }
  }

  return result
}

function buildExpectedFromLegacy(snapshots, chunkStart, size, nowMs) {
  const statuses = new Array(size).fill('disponivel')
  const reservationMeta = {}
  const paidMeta = {}

  for (let offset = 0; offset < snapshots.length; offset += 1) {
    const snapshot = snapshots[offset]
    if (!snapshot.exists) {
      continue
    }

    const number = chunkStart + offset
    const data = snapshot.data() || {}
    const status = readStatus(data.status)

    if (status === 'pago') {
      statuses[offset] = 'pago'
      const ownerUid = readString(data.ownerUid)
      const orderId = readString(data.orderId)
      if (ownerUid && orderId) {
        paidMeta[String(number)] = {
          ownerUid,
          orderId,
          paidAtMs: readTimestampMillis(data.paidAt),
          awardedDrawId: readString(data.awardedDrawId),
          awardedPrize: readString(data.awardedPrize),
          awardedAtMs: readTimestampMillis(data.awardedAt),
        }
      }
      continue
    }

    if (status === 'reservado') {
      const reservedBy = readString(data.reservedBy)
      const expiresAtMs = readTimestampMillis(data.reservationExpiresAt ?? data.expiresAt)
      if (reservedBy && expiresAtMs && expiresAtMs > nowMs) {
        statuses[offset] = 'reservado'
        reservationMeta[String(number)] = {
          reservedBy,
          expiresAtMs,
        }
      }
    }
  }

  const counts = countStatuses(statuses)
  return {
    statuses,
    reservationMeta,
    paidMeta,
    ...counts,
  }
}

function buildActualFromChunk(chunkData, chunkStart, size, nowMs) {
  const chunkEnd = chunkStart + size - 1
  const reservedBitmap = decodeBitmap(chunkData?.reservedBitmap, size)
  const paidBitmap = decodeBitmap(chunkData?.paidBitmap, size)
  const reservationMeta = readReservationMeta(chunkData?.reservationMeta, chunkStart, chunkEnd)
  const paidMeta = readPaidMeta(chunkData?.paidMeta, chunkStart, chunkEnd)
  const statuses = new Array(size).fill('disponivel')

  for (let offset = 0; offset < size; offset += 1) {
    const number = chunkStart + offset
    const key = String(number)
    const paid = getBit(paidBitmap, offset)

    if (paid) {
      statuses[offset] = 'pago'
      continue
    }

    const reserved = getBit(reservedBitmap, offset)
    const reservation = reservationMeta[key]
    const activeReservation = Boolean(reserved && reservation && reservation.expiresAtMs > nowMs)

    statuses[offset] = activeReservation ? 'reservado' : 'disponivel'
  }

  const counts = countStatuses(statuses)
  const storedReservedCount = Number(chunkData?.reservedCount)
  const storedPaidCount = Number(chunkData?.paidCount)
  const storedAvailableCount = Number(chunkData?.availableCount)

  return {
    statuses,
    reservationMeta,
    paidMeta,
    ...counts,
    storedCounts: {
      reservedCount: Number.isFinite(storedReservedCount) ? storedReservedCount : null,
      paidCount: Number.isFinite(storedPaidCount) ? storedPaidCount : null,
      availableCount: Number.isFinite(storedAvailableCount) ? storedAvailableCount : null,
    },
  }
}

function countStatuses(statuses) {
  let paidCount = 0
  let reservedCount = 0

  for (const status of statuses) {
    if (status === 'pago') {
      paidCount += 1
      continue
    }

    if (status === 'reservado') {
      reservedCount += 1
    }
  }

  const availableCount = statuses.length - paidCount - reservedCount
  return { paidCount, reservedCount, availableCount }
}

function compareChunk(expected, actual, chunkStart, sampleLimit) {
  const mismatchedNumbers = []
  const paidMetaMismatches = []

  for (let offset = 0; offset < expected.statuses.length; offset += 1) {
    const number = chunkStart + offset
    const expectedStatus = expected.statuses[offset]
    const actualStatus = actual.statuses[offset]

    if (expectedStatus !== actualStatus && mismatchedNumbers.length < sampleLimit) {
      mismatchedNumbers.push({
        number,
        expectedStatus,
        actualStatus,
      })
    }

    if (expectedStatus !== 'pago') {
      continue
    }

    const expectedMeta = expected.paidMeta[String(number)]
    const actualMeta = actual.paidMeta[String(number)]

    if (!expectedMeta && !actualMeta) {
      continue
    }

    const same = Boolean(
      expectedMeta
      && actualMeta
      && expectedMeta.ownerUid === actualMeta.ownerUid
      && expectedMeta.orderId === actualMeta.orderId
      && expectedMeta.awardedDrawId === actualMeta.awardedDrawId
      && expectedMeta.awardedPrize === actualMeta.awardedPrize,
    )

    if (!same && paidMetaMismatches.length < sampleLimit) {
      paidMetaMismatches.push({
        number,
        expected: expectedMeta || null,
        actual: actualMeta || null,
      })
    }
  }

  const effectiveCountMismatch = (
    expected.paidCount !== actual.paidCount
    || expected.reservedCount !== actual.reservedCount
    || expected.availableCount !== actual.availableCount
  )

  const storedCountMismatch = (
    actual.storedCounts.paidCount !== actual.paidCount
    || actual.storedCounts.reservedCount !== actual.reservedCount
    || actual.storedCounts.availableCount !== actual.availableCount
  )

  const hasMismatch =
    effectiveCountMismatch
    || storedCountMismatch
    || mismatchedNumbers.length > 0
    || paidMetaMismatches.length > 0

  return {
    hasMismatch,
    effectiveCountMismatch,
    storedCountMismatch,
    mismatchedNumbers,
    paidMetaMismatches,
  }
}

async function validateChunk(params) {
  const {
    db,
    campaignId,
    chunkStart,
    chunkEnd,
    nowMs,
    sampleLimit,
  } = params

  const size = chunkEnd - chunkStart + 1
  const legacyRefs = Array.from(
    { length: size },
    (_, offset) => db.collection('numberStates').doc(`${campaignId}_${chunkStart + offset}`),
  )
  const chunkRef = db.collection('numberChunks').doc(`${campaignId}_${chunkStart}`)

  const [legacySnapshots, chunkSnapshot] = await Promise.all([
    legacyRefs.length > 0 ? db.getAll(...legacyRefs) : Promise.resolve([]),
    chunkRef.get(),
  ])

  const expected = buildExpectedFromLegacy(legacySnapshots, chunkStart, size, nowMs)

  if (!chunkSnapshot.exists) {
    return {
      chunkStart,
      chunkEnd,
      size,
      numberStatesRead: legacySnapshots.length,
      hasMismatch: true,
      missingChunk: true,
      details: {
        expectedCounts: {
          paidCount: expected.paidCount,
          reservedCount: expected.reservedCount,
          availableCount: expected.availableCount,
        },
      },
    }
  }

  const chunkData = chunkSnapshot.data() || {}
  const actual = buildActualFromChunk(chunkData, chunkStart, size, nowMs)
  const comparison = compareChunk(expected, actual, chunkStart, sampleLimit)

  return {
    chunkStart,
    chunkEnd,
    size,
    numberStatesRead: legacySnapshots.length,
    hasMismatch: comparison.hasMismatch,
    missingChunk: false,
    details: comparison.hasMismatch
      ? {
        expectedCounts: {
          paidCount: expected.paidCount,
          reservedCount: expected.reservedCount,
          availableCount: expected.availableCount,
        },
        actualEffectiveCounts: {
          paidCount: actual.paidCount,
          reservedCount: actual.reservedCount,
          availableCount: actual.availableCount,
        },
        actualStoredCounts: actual.storedCounts,
        effectiveCountMismatch: comparison.effectiveCountMismatch,
        storedCountMismatch: comparison.storedCountMismatch,
        mismatchedNumbers: comparison.mismatchedNumbers,
        paidMetaMismatches: comparison.paidMetaMismatches,
      }
      : null,
  }
}

function formatDurationMs(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(2)}s`
}

async function deleteLegacyNumberStates(params) {
  const {
    db,
    campaignId,
    batchSize,
    deleteLimit,
    dryRun,
  } = params

  let scanned = 0
  let deleted = 0
  let lastDoc = null
  let reachedDeleteLimit = false

  for (;;) {
    if (deleteLimit > 0 && scanned >= deleteLimit) {
      reachedDeleteLimit = true
      break
    }

    const remaining = deleteLimit > 0 ? Math.max(deleteLimit - scanned, 0) : batchSize
    const effectiveBatchSize = Math.max(1, Math.min(batchSize, remaining))
    let query = db.collection('numberStates')
      .where('campaignId', '==', campaignId)
      .orderBy(FieldPath.documentId())
      .limit(effectiveBatchSize)

    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    scanned += snapshot.size

    if (!dryRun) {
      const batch = db.batch()
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref)
      }
      await batch.commit()
      deleted += snapshot.size
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    if (snapshot.size < batchSize) {
      break
    }
  }

  return {
    scanned,
    deleted: dryRun ? scanned : deleted,
    reachedDeleteLimit,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const projectId = resolveProjectId(args.projectId)

  if (!projectId) {
    throw new Error(
      'Project ID nao encontrado. Use --projectId <id> ou defina GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT.',
    )
  }

  if (args.deleteLegacy && args.confirmDelete !== DELETE_CONFIRM_PHRASE) {
    throw new Error(`Para deletar legado use --confirm-delete ${DELETE_CONFIRM_PHRASE}`)
  }

  initializeApp({
    credential: applicationDefault(),
    projectId,
  })

  const db = getFirestore()
  const startedAtMs = Date.now()

  const campaignRef = db.collection('campaigns').doc(args.campaignId)
  const campaignSnapshot = await campaignRef.get()
  const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
  const range = resolveCampaignRange(campaignData, args.rangeStart, args.rangeEnd)

  if (range.total <= 0) {
    throw new Error('Campanha sem faixa de numeros valida para validar')
  }

  const chunkStarts = []
  for (let chunkStart = range.start; chunkStart <= range.end; chunkStart += CHUNK_SIZE) {
    chunkStarts.push(chunkStart)
  }
  const totalChunks = chunkStarts.length
  const hasChunkLimit = args.chunkLimit > 0
  const effectiveChunkLimit = hasChunkLimit ? args.chunkLimit : totalChunks

  if (!hasChunkLimit && !args.allowFullScan) {
    throw new Error(
      'Execucao sem limite bloqueada. Use --chunkLimit <n> (recomendado) ou --allow-full-scan para liberar.',
    )
  }

  const effectiveChunkStarts = hasChunkLimit
    ? chunkStarts.slice(0, effectiveChunkLimit)
    : chunkStarts

  const summary = {
    processedChunks: 0,
    totalChunks,
    effectiveChunks: effectiveChunkStarts.length,
    numberStatesRead: 0,
    mismatchedChunks: 0,
    missingChunks: 0,
    sampledMismatches: [],
  }

  console.log(JSON.stringify({
    level: 'info',
    message: 'validation.started',
    campaignId: args.campaignId,
    projectId,
    rangeStart: range.start,
    rangeEnd: range.end,
    totalNumbers: range.total,
    totalChunks,
    effectiveChunks: effectiveChunkStarts.length,
    chunkLimit: hasChunkLimit ? effectiveChunkLimit : null,
    fullScan: !hasChunkLimit,
    batchChunks: args.batchChunks,
    deleteLimit: args.deleteLimit > 0 ? args.deleteLimit : null,
    deleteLegacy: args.deleteLegacy,
    dryRun: args.dryRun,
  }))

  if (effectiveChunkStarts.length < totalChunks) {
    console.log(JSON.stringify({
      level: 'warn',
      message: 'validation.limit_applied',
      campaignId: args.campaignId,
      totalChunks,
      effectiveChunks: effectiveChunkStarts.length,
      skippedChunks: totalChunks - effectiveChunkStarts.length,
      estimatedNumberStatesReadLimit: effectiveChunkStarts.length * CHUNK_SIZE,
    }))
  }

  for (let offset = 0; offset < effectiveChunkStarts.length; offset += args.batchChunks) {
    const batchChunkStarts = effectiveChunkStarts.slice(offset, offset + args.batchChunks)

    const results = await Promise.all(batchChunkStarts.map((chunkStart) => {
      const { chunkEnd } = resolveChunkBounds(range.start, range.end, chunkStart)
      return validateChunk({
        db,
        campaignId: args.campaignId,
        chunkStart,
        chunkEnd,
        nowMs: args.nowMs,
        sampleLimit: args.sampleLimit,
      })
    }))

    for (const result of results) {
      summary.processedChunks += 1
      summary.numberStatesRead += result.numberStatesRead

      if (!result.hasMismatch) {
        continue
      }

      summary.mismatchedChunks += 1
      if (result.missingChunk) {
        summary.missingChunks += 1
      }

      if (summary.sampledMismatches.length < args.sampleLimit) {
        summary.sampledMismatches.push({
          chunkStart: result.chunkStart,
          chunkEnd: result.chunkEnd,
          missingChunk: result.missingChunk,
          details: result.details,
        })
      }
    }

    const elapsedMs = Date.now() - startedAtMs

    console.log(JSON.stringify({
      level: 'info',
      message: 'validation.progress',
      campaignId: args.campaignId,
      processedChunks: summary.processedChunks,
      totalChunks: summary.effectiveChunks,
      percent: Number(((summary.processedChunks / Math.max(summary.effectiveChunks, 1)) * 100).toFixed(2)),
      numberStatesRead: summary.numberStatesRead,
      mismatchedChunks: summary.mismatchedChunks,
      missingChunks: summary.missingChunks,
      elapsedMs,
      elapsed: formatDurationMs(elapsedMs),
    }))
  }

  const validationDurationMs = Date.now() - startedAtMs

  console.log(JSON.stringify({
    level: summary.mismatchedChunks > 0 ? 'warn' : 'info',
    message: 'validation.completed',
    campaignId: args.campaignId,
    processedChunks: summary.processedChunks,
    totalChunks: summary.totalChunks,
    effectiveChunks: summary.effectiveChunks,
    numberStatesRead: summary.numberStatesRead,
    mismatchedChunks: summary.mismatchedChunks,
    missingChunks: summary.missingChunks,
    sampledMismatches: summary.sampledMismatches,
    durationMs: validationDurationMs,
    duration: formatDurationMs(validationDurationMs),
  }))

  if (!args.deleteLegacy) {
    return
  }

  if (summary.mismatchedChunks > 0 && !args.allowMismatchDelete) {
    throw new Error('Validacao encontrou divergencias. Corrija antes de deletar numberStates, ou use --allow-mismatch-delete.')
  }

  const deleteStartedAtMs = Date.now()
  const deletionResult = await deleteLegacyNumberStates({
    db,
    campaignId: args.campaignId,
    batchSize: args.deleteBatchSize,
    deleteLimit: args.deleteLimit,
    dryRun: args.dryRun,
  })
  const deleteDurationMs = Date.now() - deleteStartedAtMs

  console.log(JSON.stringify({
    level: 'info',
    message: 'cleanup.completed',
    campaignId: args.campaignId,
    dryRun: args.dryRun,
    scanned: deletionResult.scanned,
    deleted: deletionResult.deleted,
    reachedDeleteLimit: deletionResult.reachedDeleteLimit,
    durationMs: deleteDurationMs,
    duration: formatDurationMs(deleteDurationMs),
  }))
}

main().catch((error) => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'validation_or_cleanup.failed',
    error: String(error),
    stack: error instanceof Error ? error.stack : null,
  }))
  process.exitCode = 1
})
