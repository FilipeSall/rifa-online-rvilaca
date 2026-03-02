import { getApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DEFAULT_PROJECT_ID = 'demo-rifa-online'
const DEFAULT_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const DEFAULT_FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001'
const DEFAULT_REGION = 'southamerica-east1'
const DEFAULT_WEBHOOK_TOKEN = 'test-webhook-token'

function parseArgs(argv) {
  const options = {
    externalId: null,
    projectId: DEFAULT_PROJECT_ID,
    region: DEFAULT_REGION,
    token: null,
    functionsHost: DEFAULT_FUNCTIONS_EMULATOR_HOST,
  }

  for (const arg of argv) {
    if (arg.startsWith('--externalId=')) {
      options.externalId = arg.slice('--externalId='.length).trim() || null
      continue
    }

    if (arg.startsWith('--projectId=')) {
      options.projectId = arg.slice('--projectId='.length).trim() || DEFAULT_PROJECT_ID
      continue
    }

    if (arg.startsWith('--region=')) {
      options.region = arg.slice('--region='.length).trim() || DEFAULT_REGION
      continue
    }

    if (arg.startsWith('--token=')) {
      options.token = arg.slice('--token='.length).trim() || null
      continue
    }

    if (arg.startsWith('--functionsHost=')) {
      options.functionsHost = arg.slice('--functionsHost='.length).trim() || DEFAULT_FUNCTIONS_EMULATOR_HOST
    }
  }

  return options
}

function assertLocalHost(hostWithPort, label) {
  const host = `${hostWithPort ?? ''}`.trim().split(':')[0]
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`${label} invalido para script local: ${hostWithPort}`)
  }
}

function ensureEmulatorEnv(projectId) {
  process.env.GCLOUD_PROJECT ??= projectId
  process.env.GOOGLE_CLOUD_PROJECT ??= projectId
  process.env.FIRESTORE_EMULATOR_HOST ??= DEFAULT_FIRESTORE_EMULATOR_HOST

  if (process.env.GCLOUD_PROJECT !== DEFAULT_PROJECT_ID) {
    throw new Error(
      `Projeto bloqueado por seguranca. Esperado ${DEFAULT_PROJECT_ID}, recebido ${process.env.GCLOUD_PROJECT}.`,
    )
  }

  assertLocalHost(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST')
}

function ensureAdminApp(projectId) {
  try {
    return getApp()
  } catch {
    return initializeApp({ projectId })
  }
}

function toMillis(value) {
  if (!value) {
    return 0
  }

  if (typeof value.toMillis === 'function') {
    return value.toMillis()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'object' && typeof value._seconds === 'number') {
    const nanos = typeof value._nanoseconds === 'number' ? value._nanoseconds : 0
    return value._seconds * 1000 + Math.floor(nanos / 1_000_000)
  }

  return 0
}

async function resolvePendingOrder(db, externalIdArg) {
  if (externalIdArg) {
    const manualDoc = await db.collection('orders').doc(externalIdArg).get()
    if (!manualDoc.exists) {
      throw new Error(`Pedido ${externalIdArg} nao encontrado no emulator.`)
    }

    const data = manualDoc.data() || {}
    return {
      externalId: manualDoc.id,
      amount: Number(data.amount ?? data.expectedAmount ?? NaN),
      status: `${data.status ?? ''}`,
      type: `${data.type ?? ''}`,
    }
  }

  const pendingSnapshot = await db
    .collection('orders')
    .where('type', '==', 'deposit')
    .where('status', '==', 'pending')
    .get()

  if (pendingSnapshot.empty) {
    throw new Error(
      'Nenhum pedido deposit/pending encontrado. Gere um PIX antes de rodar o webhook fake.',
    )
  }

  let selected = null

  for (const doc of pendingSnapshot.docs) {
    const data = doc.data() || {}
    const updatedAtMs = toMillis(data.updatedAt)
    const createdAtMs = toMillis(data.createdAt)
    const score = Math.max(updatedAtMs, createdAtMs)

    if (!selected || score > selected.score) {
      selected = {
        externalId: doc.id,
        amount: Number(data.amount ?? data.expectedAmount ?? NaN),
        score,
      }
    }
  }

  if (!selected) {
    throw new Error('Falha ao selecionar pedido pendente para webhook fake.')
  }

  return selected
}

async function postWebhook({ projectId, region, token, functionsHost, payload }) {
  assertLocalHost(functionsHost, 'functionsHost')

  const endpoint = `http://${functionsHost}/${projectId}/${region}/pixWebhook?token=${encodeURIComponent(token)}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const bodyText = await response.text()

  if (!response.ok) {
    throw new Error(`Webhook fake falhou (${response.status}): ${bodyText}`)
  }

  return {
    endpoint,
    bodyText,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  ensureEmulatorEnv(options.projectId)

  const adminApp = ensureAdminApp(options.projectId)
  const db = getFirestore(adminApp)

  const order = await resolvePendingOrder(db, options.externalId)
  if (!Number.isFinite(order.amount) || order.amount <= 0) {
    throw new Error(`Pedido ${order.externalId} possui amount invalido: ${order.amount}`)
  }

  const webhookToken = options.token || process.env.HORSEPAY_WEBHOOK_TOKEN || DEFAULT_WEBHOOK_TOKEN
  const payload = {
    external_id: order.externalId,
    type: 'deposit',
    status: true,
    amount: Number(order.amount.toFixed(2)),
  }

  const result = await postWebhook({
    projectId: options.projectId,
    region: options.region,
    token: webhookToken,
    functionsHost: options.functionsHost,
    payload,
  })

  console.log(`Webhook fake enviado com sucesso para ${order.externalId}.`)
  console.log(`Endpoint: ${result.endpoint}`)
  console.log(`Payload: ${JSON.stringify(payload)}`)
  console.log(`Resposta: ${result.bodyText}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Falha ao disparar webhook fake local:', error)
    process.exitCode = 1
  })
}
