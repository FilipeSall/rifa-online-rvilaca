import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp, type DocumentData, type WriteBatch } from 'firebase-admin/firestore'

type CampaignStatus = 'draft' | 'active' | 'finished'
type NumberStatus = 'available' | 'reserved' | 'paid'

const TOTAL_COTAS = 3_450_000
const SOLD_COTAS = 2_242_500
const RESERVED_COTAS = 0
const UNIT_PRICE = 0.99

function toBool(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'TRUE'
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0) return defaultValue
  return parsed
}

function getServiceAccount() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (!serviceAccountPath) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_PATH')
  }

  const absolutePath = resolve(process.cwd(), serviceAccountPath)
  const raw = readFileSync(absolutePath, 'utf8')
  const parsed = JSON.parse(raw) as {
    project_id?: string
    client_email?: string
    private_key?: string
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid service account JSON. Expected project_id, client_email and private_key.')
  }

  return parsed
}

async function commitInChunks(rows: Array<{ refPath: string; data: DocumentData }>, chunkSize = 500) {
  let committed = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const batch: WriteBatch = db.batch()
    for (const row of chunk) {
      batch.set(db.doc(row.refPath), row.data, { merge: true })
    }
    await batch.commit()
    committed += chunk.length
    if (committed % 5_000 === 0 || committed === rows.length) {
      console.log(`Committed ${committed}/${rows.length} docs`)
    }
  }
}

function buildNumberDoc(index: number, campaignId: string): { refPath: string; data: DocumentData } {
  const numberValue = (index + 1).toString().padStart(7, '0')
  const status: NumberStatus = 'available'

  return {
    refPath: `campaigns/${campaignId}/numbers/${numberValue}`,
    data: {
      campaignId,
      number: numberValue,
      numberInt: index + 1,
      status,
      reservedBy: null,
      reservedAt: null,
      expiresAt: null,
      orderId: null,
      ownerUid: null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
  }
}

const serviceAccount = getServiceAccount()
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
    projectId,
  })
}

const db = getFirestore()

async function run() {
  const campaignId = process.env.SEED_CAMPAIGN_ID || 'campanha-bmw-r1200-gs-2026'
  const numbersToSeed = parsePositiveInt(process.env.SEED_PRECREATE_NUMBERS, 0)
  const allowLargeSeed = toBool(process.env.ALLOW_LARGE_NUMBER_SEED)
  const createExamples = toBool(process.env.SEED_CREATE_EXAMPLES)

  if (numbersToSeed > 50_000 && !allowLargeSeed) {
    throw new Error(
      `SEED_PRECREATE_NUMBERS=${numbersToSeed} is too large. Set ALLOW_LARGE_NUMBER_SEED=true to continue.`,
    )
  }

  console.log(`Seeding Firestore project "${projectId}" with campaign "${campaignId}"...`)

  const now = Timestamp.now()

  const campaignStatus: CampaignStatus = 'active'
  const campaignRef = db.doc(`campaigns/${campaignId}`)
  const rulesRef = db.doc(`campaigns/${campaignId}/rules/main`)
  const prizes = [
    {
      refPath: `campaigns/${campaignId}/prizes/1_bmw_r1200_gs`,
      data: {
        position: 1,
        title: 'BMW R1200 GS',
        year: 2015,
        model: 2016,
        fuel: 'gasolina',
        color: 'preta',
        type: 'vehicle',
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      refPath: `campaigns/${campaignId}/prizes/2_honda_cg_start_160`,
      data: {
        position: 2,
        title: 'Honda CG Start 160',
        year: 2026,
        model: 2026,
        type: 'vehicle',
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      refPath: `campaigns/${campaignId}/prizes/3_pix_20x1000`,
      data: {
        position: 3,
        title: '20x PIX de R$ 1.000',
        type: 'pix_batch',
        quantity: 20,
        amount: 1000,
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
  ]

  const batch = db.batch()
  batch.set(
    campaignRef,
    {
      title: 'Sorteio BMW R1200 GS + Honda CG Start 160 + PIX',
      status: campaignStatus,
      totalCotas: TOTAL_COTAS,
      soldCotas: SOLD_COTAS,
      reservedCotas: RESERVED_COTAS,
      availableCotas: TOTAL_COTAS - SOLD_COTAS - RESERVED_COTAS,
      pricePerCota: UNIT_PRICE,
      minPurchase: 1,
      drawAt: null,
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  batch.set(
    rulesRef,
    {
      reserveMinutes: 10,
      allowManualSelection: true,
      allowAutoSelection: true,
      noDuplicateNumbers: true,
      ownershipOnlyAfterPaid: true,
      drawTransparencyMode: 'auditavel',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  for (const prize of prizes) {
    batch.set(db.doc(prize.refPath), prize.data, { merge: true })
  }

  batch.set(
    db.doc(`draws/${campaignId}_scheduled`),
    {
      campaignId,
      status: 'scheduled',
      method: 'loteria_federal',
      federalLotteryRef: null,
      resultNumbers: [],
      executedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  batch.set(
    db.doc('auditLogs/bootstrap_campaign_seed'),
    {
      type: 'bootstrap_seed',
      entity: 'campaign',
      entityId: campaignId,
      actor: 'seed-script',
      createdAt: FieldValue.serverTimestamp(),
      details: {
        totalCotas: TOTAL_COTAS,
        soldCotas: SOLD_COTAS,
      },
    },
    { merge: true },
  )

  if (createExamples) {
    const exampleUid = 'example-user'
    const exampleOrderId = 'example-order'
    const examplePaymentId = 'example-payment'

    batch.set(
      db.doc(`users/${exampleUid}`),
      {
        name: 'Usuário Exemplo',
        cpf: '00000000000',
        phone: '+5500000000000',
        email: 'exemplo@rifaonline.com',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    batch.set(
      db.doc(`orders/${exampleOrderId}`),
      {
        uid: exampleUid,
        campaignId,
        quantity: 10,
        unitPrice: UNIT_PRICE,
        total: 9.9,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        paidAt: null,
        expiresAt: null,
      },
      { merge: true },
    )
    batch.set(
      db.doc(`orders/${exampleOrderId}/numbers/0000001`),
      {
        campaignId,
        number: '0000001',
        status: 'reserved',
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    batch.set(
      db.doc(`payments/${examplePaymentId}`),
      {
        orderId: exampleOrderId,
        provider: 'pix_gateway',
        txid: 'txid-example',
        amount: 9.9,
        status: 'pending',
        webhookPayload: null,
        createdAt: FieldValue.serverTimestamp(),
        confirmedAt: null,
      },
      { merge: true },
    )
    batch.set(
      db.doc('winners/example-winner'),
      {
        campaignId,
        prizeId: '3_pix_20x1000',
        uid: exampleUid,
        number: '0000001',
        publishedAt: null,
      },
      { merge: true },
    )
  }

  await batch.commit()
  console.log('Core campaign documents seeded.')

  if (numbersToSeed > 0) {
    console.log(`Preparing ${numbersToSeed} number documents...`)
    const rows = new Array<{ refPath: string; data: DocumentData }>(numbersToSeed)
    for (let i = 0; i < numbersToSeed; i += 1) {
      rows[i] = buildNumberDoc(i, campaignId)
    }
    await commitInChunks(rows)
    console.log(`Finished seeding ${numbersToSeed} numbers in campaigns/${campaignId}/numbers`)
  } else {
    console.log('Skipping number document pre-creation (SEED_PRECREATE_NUMBERS=0).')
  }
}

run()
  .then(() => {
    console.log('Seed completed successfully.')
    process.exit(0)
  })
  .catch((error: unknown) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
