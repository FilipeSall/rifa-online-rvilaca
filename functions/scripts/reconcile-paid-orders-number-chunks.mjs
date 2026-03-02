#!/usr/bin/env node

import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { CAMPAIGN_DOC_ID } from '../lib/lib/constants.js'
import {
  readLegacyOrderNumbersSubcollection,
  runPaidDepositBusinessLogic,
} from '../lib/lib/paymentHandlers.js'
import { readCampaignNumberRange } from '../lib/lib/numberStateStore.js'

function parseArgs(argv) {
  const flags = {
    campaignId: '',
    orderId: '',
    projectId: '',
    limit: 300,
    apply: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--campaignId' && argv[index + 1]) {
      flags.campaignId = String(argv[index + 1]).trim()
      index += 1
      continue
    }

    if (arg === '--orderId' && argv[index + 1]) {
      flags.orderId = String(argv[index + 1]).trim()
      index += 1
      continue
    }

    if (arg === '--projectId' && argv[index + 1]) {
      flags.projectId = String(argv[index + 1]).trim()
      index += 1
      continue
    }

    if (arg === '--limit' && argv[index + 1]) {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        flags.limit = parsed
      }
      index += 1
      continue
    }

    if (arg === '--apply') {
      flags.apply = true
      continue
    }
  }

  return flags
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

function readProjectIdFromFirebaserc() {
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url))
    const repoRoot = path.resolve(scriptDir, '..', '..')
    const firebasercPath = path.join(repoRoot, '.firebaserc')
    if (!fs.existsSync(firebasercPath)) {
      return null
    }

    const parsed = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'))
    const projects = parsed?.projects && typeof parsed.projects === 'object' ? parsed.projects : null
    if (!projects) {
      return null
    }

    return readString(projects.default) || null
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
    || readProjectIdFromFirebaserc()
    || null
  )
}

function parseNumber(value) {
  if (Number.isInteger(value)) {
    return Number(value)
  }

  const normalized = readString(value)
  if (!normalized) {
    return null
  }

  const digits = normalized.replace(/\D/g, '')
  if (!digits) {
    return null
  }

  const parsed = Number(digits)
  return Number.isInteger(parsed) ? parsed : null
}

function sanitizeNumbersForRange(value, rangeStart, rangeEnd) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => parseNumber(item))
      .filter((item) => Number.isInteger(item) && item >= rangeStart && item <= rangeEnd),
  )).sort((a, b) => a - b)
}

function sanitizeOptionalAmount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return Number(numeric.toFixed(2))
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const resolvedProjectId = resolveProjectId(flags.projectId)
  if (!resolvedProjectId) {
    throw new Error(
      'Projeto Firebase nao identificado. Use --projectId <id-do-projeto> ou configure GCLOUD_PROJECT.',
    )
  }

  const appOptions = { credential: applicationDefault(), projectId: resolvedProjectId }
  initializeApp(appOptions)
  const db = getFirestore()
  const campaignRangeCache = new Map()
  const summary = {
    dryRun: !flags.apply,
    scanned: 0,
    candidates: 0,
    applied: 0,
    failed: 0,
    skippedMissingUser: 0,
    skippedMissingNumbers: 0,
    recoveredFromLegacy: 0,
  }

  async function getCampaignRange(campaignId) {
    if (campaignRangeCache.has(campaignId)) {
      return campaignRangeCache.get(campaignId)
    }

    const snapshot = await db.collection('campaigns').doc(campaignId).get()
    const campaignData = snapshot.exists ? snapshot.data() : undefined
    const range = readCampaignNumberRange(campaignData, campaignId)
    campaignRangeCache.set(campaignId, range)
    return range
  }

  async function processOrderDoc(orderDoc) {
    summary.scanned += 1
    const data = orderDoc.data() || {}
    const externalId = orderDoc.id
    const campaignId = readString(data.campaignId) || flags.campaignId || CAMPAIGN_DOC_ID
    const userId = readString(data.userId)
    const amount = sanitizeOptionalAmount(data.amount)
    const range = await getCampaignRange(campaignId)

    let reservedNumbers = sanitizeNumbersForRange(data.reservedNumbers, range.start, range.end)
    let recoveredFromLegacy = false

    if (reservedNumbers.length === 0) {
      reservedNumbers = await readLegacyOrderNumbersSubcollection({
        db,
        externalId,
        rangeStart: range.start,
        rangeEnd: range.end,
      })
      recoveredFromLegacy = reservedNumbers.length > 0
      if (recoveredFromLegacy) {
        summary.recoveredFromLegacy += 1
      }
    }

    if (!userId) {
      summary.skippedMissingUser += 1
      console.log(`[SKIP] ${externalId}: pedido sem userId`)
      return
    }

    if (reservedNumbers.length === 0) {
      summary.skippedMissingNumbers += 1
      console.log(`[SKIP] ${externalId}: pedido pago sem numeros`)
      return
    }

    summary.candidates += 1

    if (!flags.apply) {
      console.log(
        `[DRY] ${externalId}: ${reservedNumbers.length} numeros (${recoveredFromLegacy ? 'recuperado legado' : 'order.reservedNumbers'})`,
      )
      return
    }

    try {
      if (recoveredFromLegacy) {
        await orderDoc.ref.set(
          {
            reservedNumbers,
            quantity: reservedNumbers.length,
            reservedNumbersRecoveredAt: FieldValue.serverTimestamp(),
            reservedNumbersRecoveredSource: 'reconcile_script_orders_numbers_subcollection',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }

      await runPaidDepositBusinessLogic(db, {
        externalId,
        campaignId,
        userId,
        amount,
        reservedNumbers,
      })

      const orderPatch = {
        paidBusinessProcessingError: null,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (!data.paidBusinessAppliedAt) {
        orderPatch.paidBusinessAppliedAt = FieldValue.serverTimestamp()
      }

      await orderDoc.ref.set(orderPatch, { merge: true })

      summary.applied += 1
      console.log(`[OK] ${externalId}: reconciliado (${reservedNumbers.length} numeros)`)
    } catch (error) {
      summary.failed += 1
      await orderDoc.ref.set(
        {
          paidBusinessProcessingError: `reconcile_script: ${String(error).slice(0, 760)}`,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      console.error(`[ERR] ${externalId}: ${String(error)}`)
    }
  }

  let docs = []
  if (flags.orderId) {
    const snapshot = await db.collection('orders').doc(flags.orderId).get()
    if (snapshot.exists) {
      docs = [snapshot]
    }
  } else {
    let query = db.collection('orders')
      .where('status', '==', 'paid')
      .where('type', '==', 'deposit')

    if (flags.campaignId) {
      query = query.where('campaignId', '==', flags.campaignId)
    }

    const snapshot = await query.limit(flags.limit).get()
    docs = snapshot.docs
  }

  console.log('--- reconcile-paid-orders-number-chunks ---')
  console.log(`modo: ${flags.apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`projectId: ${resolvedProjectId}`)
  console.log(`orderId: ${flags.orderId || '-'}`)
  console.log(`campaignId: ${flags.campaignId || '-'}`)
  console.log(`limit: ${flags.limit}`)
  console.log(`docs encontrados: ${docs.length}`)

  for (const orderDoc of docs) {
    // eslint-disable-next-line no-await-in-loop
    await processOrderDoc(orderDoc)
  }

  console.log('--- resumo ---')
  console.log(JSON.stringify(summary, null, 2))

  if (summary.failed > 0) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
