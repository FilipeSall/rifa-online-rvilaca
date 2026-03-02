import assert from 'node:assert/strict'
import test from 'node:test'
import { initializeApp as initializeClientApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { getApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { seedBackendEmulator } from '../scripts/seed-emulator-backend.mjs'

const PROJECT_ID = 'demo-rifa-online'
const REGION = 'southamerica-east1'
const WEBHOOK_TOKEN = process.env.HORSEPAY_WEBHOOK_TOKEN || 'test-webhook-token'

process.env.GCLOUD_PROJECT ??= PROJECT_ID
process.env.GOOGLE_CLOUD_PROJECT ??= PROJECT_ID
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

function createClient() {
  const app = initializeClientApp(
    {
      apiKey: 'demo-api-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      appId: '1:000000000000:web:demo',
    },
    `backend-e2e-${Date.now()}`,
  )

  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })

  const functions = getFunctions(app, REGION)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  return { auth, functions }
}

function getAdminDb() {
  try {
    const defaultApp = getApp()
    return getAdminFirestore(defaultApp)
  } catch {
    const defaultApp = initializeAdminApp({ projectId: PROJECT_ID })
    return getAdminFirestore(defaultApp)
  }
}

function buildNumbers(quantity) {
  return Array.from({ length: quantity }, (_, index) => index + 1)
}

async function sendWebhook(payload) {
  const endpoint = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/pixWebhook?token=${encodeURIComponent(WEBHOOK_TOKEN)}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  assert.equal(response.status, 200)
}

test('backend e2e no emulator: reserva -> pix -> webhook idempotente -> baixa', async () => {
  await seedBackendEmulator({ projectId: PROJECT_ID })

  const { auth, functions } = createClient()
  const adminDb = getAdminDb()

  await signInAnonymously(auth)
  const uid = auth.currentUser?.uid
  assert.ok(uid, 'usuario anonimo nao autenticado no emulator')

  const reserveNumbers = httpsCallable(functions, 'reserveNumbers')
  const createPixDeposit = httpsCallable(functions, 'createPixDeposit')
  const getPublicNumberLookup = httpsCallable(functions, 'getPublicNumberLookup')

  const reservedNumbers = buildNumbers(20)
  const reserveResult = await reserveNumbers({ numbers: reservedNumbers })
  const reserveData = reserveResult.data?.result ?? reserveResult.data
  assert.deepEqual(reserveData.numbers, reservedNumbers)

  const createPixResult = await createPixDeposit({
    payerName: 'Usuario E2E',
    cpf: '12345678901',
  })

  const pixData = createPixResult.data?.result ?? createPixResult.data
  assert.equal(typeof pixData.externalId, 'string')
  assert.ok(pixData.externalId.length > 0)
  assert.equal(pixData.status, 'pending')

  const externalId = pixData.externalId
  const orderRef = adminDb.collection('orders').doc(externalId)
  const orderBeforeWebhook = await orderRef.get()
  assert.equal(orderBeforeWebhook.exists, true)

  const amount = Number(orderBeforeWebhook.get('amount'))
  assert.equal(Number.isFinite(amount), true)

  const webhookPayload = {
    external_id: externalId,
    type: 'deposit',
    status: true,
    amount,
  }

  await sendWebhook(webhookPayload)
  await sendWebhook(webhookPayload)

  const orderAfterWebhook = await orderRef.get()
  assert.equal(orderAfterWebhook.get('status'), 'paid')

  const eventSnapshot = await orderRef.collection('events').get()
  assert.equal(eventSnapshot.size, 1)

  const paymentSnapshot = await adminDb.collection('payments').doc(externalId).get()
  assert.equal(paymentSnapshot.exists, true)

  const ledgerSnapshot = await adminDb.collection('salesLedger').doc(externalId).get()
  assert.equal(ledgerSnapshot.exists, true)

  const reservationSnapshot = await adminDb.collection('numberReservations').doc(uid).get()
  assert.equal(reservationSnapshot.exists, false)

  const lookupResult = await getPublicNumberLookup({ number: reservedNumbers[0] })
  const lookupData = lookupResult.data?.result ?? lookupResult.data
  assert.equal(lookupData.status, 'vendido')
})
