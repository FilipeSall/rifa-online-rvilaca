import { getApp, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_PROJECT_ID = 'demo-rifa-online'
const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'

function ensureAdminApp(projectId) {
  try {
    return getApp()
  } catch {
    return initializeApp({ projectId })
  }
}

export async function seedBackendEmulator({
  projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID,
  campaignId = DEFAULT_CAMPAIGN_ID,
} = {}) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST nao definido. Execute dentro de firebase emulators:exec/start.')
  }

  const adminApp = ensureAdminApp(projectId)
  const db = getFirestore(adminApp)

  await db.collection('campaigns').doc(campaignId).set(
    {
      title: 'Campanha E2E Emulator',
      status: 'active',
      pricePerCota: 1,
      totalNumbers: 100,
      numberStart: 1,
      numberEnd: 100,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedBackendEmulator()
    .then(() => {
      console.log('Seed do backend emulator concluido.')
    })
    .catch((error) => {
      console.error('Falha ao executar seed do backend emulator:', error)
      process.exitCode = 1
    })
}
