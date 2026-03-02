#!/usr/bin/env node

import process from 'node:process'
import fs from 'node:fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'
const DEFAULT_RANGE_START = 1
const DEFAULT_RANGE_END = 3_450_000
const CHUNK_SIZE = 1000
const DEFAULT_CHUNK_LIMIT = 10

function parseArgs(argv) {
  const flags = {
    campaignId: DEFAULT_CAMPAIGN_ID,
    projectId: '',
    batchChunks: 20,
    chunkLimit: DEFAULT_CHUNK_LIMIT,
    allowFullScan: false,
    dryRun: false,
    rangeStart: null,
    rangeEnd: null,
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

    if (arg === '--allow-full-scan') {
      flags.allowFullScan = true
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

    if (arg === '--dry-run' || arg === '--dryRun') {
      flags.dryRun = true
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

function createBitmap(size) {
  return new Uint8Array(Math.ceil(Math.max(size, 0) / 8))
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

function writeBitmap(bitmap) {
  return Buffer.from(bitmap).toString('base64')
}

function readString(value) {
  if (typeof value === 'string') {
    return value.trim()
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

function buildChunkDocId(campaignId, chunkStart) {
  return `${campaignId}_${chunkStart}`
}

function formatDurationMs(durationMs) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(2)}s`
}

async function buildChunkData(params) {
  const {
    db,
    campaignId,
    chunkStart,
    chunkEnd,
    nowMs,
  } = params

  const size = Math.max(0, chunkEnd - chunkStart + 1)
  const paidBitmap = createBitmap(size)
  const reservedBitmap = createBitmap(size)
  const reservationMeta = {}
  const paidMeta = {}

  const refs = Array.from(
    { length: size },
    (_, offset) => db.collection('numberStates').doc(`${campaignId}_${chunkStart + offset}`),
  )
  const snapshots = refs.length > 0 ? await db.getAll(...refs) : []

  for (let offset = 0; offset < snapshots.length; offset += 1) {
    const snapshot = snapshots[offset]
    if (!snapshot.exists) {
      continue
    }

    const number = chunkStart + offset
    const data = snapshot.data() || {}
    const status = readStatus(data.status)

    if (status === 'pago') {
      setBit(paidBitmap, offset, true)
      setBit(reservedBitmap, offset, false)
      delete reservationMeta[String(number)]
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
        setBit(reservedBitmap, offset, true)
        reservationMeta[String(number)] = {
          reservedBy,
          expiresAtMs,
        }
        continue
      }
    }

    setBit(reservedBitmap, offset, false)
    delete reservationMeta[String(number)]
    delete paidMeta[String(number)]
  }

  let paidCount = 0
  let reservedCount = 0

  for (let offset = 0; offset < size; offset += 1) {
    const paidByte = paidBitmap[Math.floor(offset / 8)]
    const paidMask = 1 << (offset % 8)
    const isPaid = (paidByte & paidMask) !== 0

    if (isPaid) {
      paidCount += 1
      continue
    }

    const reservedByte = reservedBitmap[Math.floor(offset / 8)]
    const reservedMask = 1 << (offset % 8)
    const isReserved = (reservedByte & reservedMask) !== 0

    if (isReserved) {
      reservedCount += 1
    }
  }

  const availableCount = Math.max(0, size - paidCount - reservedCount)

  return {
    chunkDocId: buildChunkDocId(campaignId, chunkStart),
    chunkData: {
      campaignId,
      chunkStart,
      chunkEnd,
      size,
      reservedBitmap: writeBitmap(reservedBitmap),
      paidBitmap: writeBitmap(paidBitmap),
      reservationMeta,
      paidMeta,
      reservedCount,
      paidCount,
      availableCount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    numberStatesRead: snapshots.length,
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

  initializeApp({
    credential: applicationDefault(),
    projectId,
  })

  const db = getFirestore()
  const startedAtMs = Date.now()
  const campaignRef = db.collection('campaigns').doc(args.campaignId)
  const campaignSnapshot = await campaignRef.get()
  const campaignData = campaignSnapshot.exists ? campaignSnapshot.data() : undefined
  const campaignRange = resolveCampaignRange(campaignData, args.rangeStart, args.rangeEnd)

  if (campaignRange.total <= 0) {
    throw new Error('Campanha sem faixa de numeros valida para migracao')
  }

  const chunkStarts = []
  for (let chunkStart = campaignRange.start; chunkStart <= campaignRange.end; chunkStart += CHUNK_SIZE) {
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

  let processedChunks = 0
  let totalNumberStatesRead = 0
  let totalWrittenChunks = 0

  console.log(JSON.stringify({
    level: 'info',
    message: 'migration.started',
    campaignId: args.campaignId,
    projectId,
    rangeStart: campaignRange.start,
    rangeEnd: campaignRange.end,
    totalNumbers: campaignRange.total,
    totalChunks,
    effectiveChunks: effectiveChunkStarts.length,
    chunkLimit: hasChunkLimit ? effectiveChunkLimit : null,
    fullScan: !hasChunkLimit,
    batchChunks: args.batchChunks,
    dryRun: args.dryRun,
  }))

  if (effectiveChunkStarts.length < totalChunks) {
    console.log(JSON.stringify({
      level: 'warn',
      message: 'migration.limit_applied',
      campaignId: args.campaignId,
      totalChunks,
      effectiveChunks: effectiveChunkStarts.length,
      skippedChunks: totalChunks - effectiveChunkStarts.length,
      estimatedNumberStatesReadLimit: effectiveChunkStarts.length * CHUNK_SIZE,
    }))
  }

  for (let offset = 0; offset < effectiveChunkStarts.length; offset += args.batchChunks) {
    const nowMs = Date.now()
    const batchChunkStarts = effectiveChunkStarts.slice(offset, offset + args.batchChunks)
    const chunkResults = await Promise.all(
      batchChunkStarts.map((chunkStart) => {
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, campaignRange.end)
        return buildChunkData({
          db,
          campaignId: args.campaignId,
          chunkStart,
          chunkEnd,
          nowMs,
        })
      }),
    )

    totalNumberStatesRead += chunkResults.reduce((sum, item) => sum + item.numberStatesRead, 0)

    if (!args.dryRun) {
      const batch = db.batch()
      for (const result of chunkResults) {
        const ref = db.collection('numberChunks').doc(result.chunkDocId)
        batch.set(ref, result.chunkData, { merge: true })
      }
      await batch.commit()
      totalWrittenChunks += chunkResults.length
    }

    processedChunks += batchChunkStarts.length
    const elapsedMs = Date.now() - startedAtMs

    console.log(JSON.stringify({
      level: 'info',
      message: 'migration.progress',
      campaignId: args.campaignId,
      processedChunks,
      totalChunks: effectiveChunkStarts.length,
      percent: Number(((processedChunks / Math.max(effectiveChunkStarts.length, 1)) * 100).toFixed(2)),
      numberStatesRead: totalNumberStatesRead,
      chunksWritten: totalWrittenChunks,
      elapsedMs,
      elapsed: formatDurationMs(elapsedMs),
    }))
  }

  const durationMs = Date.now() - startedAtMs
  console.log(JSON.stringify({
    level: 'info',
    message: 'migration.completed',
    campaignId: args.campaignId,
    processedChunks,
    totalChunks,
    effectiveChunks: effectiveChunkStarts.length,
    numberStatesRead: totalNumberStatesRead,
    chunksWritten: totalWrittenChunks,
    durationMs,
    duration: formatDurationMs(durationMs),
    dryRun: args.dryRun,
  }))
}

main().catch((error) => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'migration.failed',
    error: String(error),
    stack: error instanceof Error ? error.stack : null,
  }))
  process.exitCode = 1
})
