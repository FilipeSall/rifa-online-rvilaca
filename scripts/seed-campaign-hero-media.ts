import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type HeroAssetInput = {
  localPath: string
  alt: string
}

const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'
const DEFAULT_SERVICE_ACCOUNT_PATH = 'rifa-online-395d9-firebase-adminsdk-fbsvc-c068a78ce5.json'
const DEFAULT_ASSETS: HeroAssetInput[] = [
  { localPath: 'src/assets/IMG_9400.webp', alt: 'Imagem principal da campanha' },
  { localPath: 'src/assets/IMG_9379.webp', alt: 'Detalhe do premio principal' },
  { localPath: 'src/assets/IMG_9390.webp', alt: 'Visual lateral do premio principal' },
]

function normalizeBucketName(rawBucket: string) {
  return rawBucket.replace(/^gs:\/\//, '').trim()
}

function getServiceAccountPath() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  if (fromEnv) {
    return fromEnv
  }

  return DEFAULT_SERVICE_ACCOUNT_PATH
}

function loadServiceAccount(): ServiceAccount {
  const path = resolve(process.cwd(), getServiceAccountPath())
  if (!existsSync(path)) {
    throw new Error(`Service account nao encontrado em: ${path}`)
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Service account invalido. Campos obrigatorios: project_id, client_email, private_key.')
  }

  return parsed
}

function resolveBucketName(serviceAccount: ServiceAccount) {
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET
  if (fromEnv) {
    return normalizeBucketName(fromEnv)
  }

  if (!serviceAccount.project_id) {
    throw new Error('Nao foi possivel inferir bucket sem project_id.')
  }

  return `${serviceAccount.project_id}.appspot.com`
}

function createPublicUrl(bucketName: string, path: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media`
}

async function run() {
  const serviceAccount = loadServiceAccount()
  const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  const bucketName = resolveBucketName(serviceAccount)
  const campaignId = process.env.SEED_CAMPAIGN_ID || DEFAULT_CAMPAIGN_ID
  const allowReplace = process.env.FORCE_REPLACE_MIDIAS === '1'

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID ausente.')
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
      projectId,
      storageBucket: bucketName,
    })
  }

  const db = getFirestore()
  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const campaignRef = db.collection('campaigns').doc(campaignId)
  const campaignSnapshot = await campaignRef.get()

  if (!campaignSnapshot.exists) {
    throw new Error(`Campanha nao encontrada: campaigns/${campaignId}`)
  }

  const currentMidias = campaignSnapshot.get('midias.heroCarousel')
  if (Array.isArray(currentMidias) && currentMidias.length > 0 && !allowReplace) {
    console.log('Campanha ja possui midias.heroCarousel. Nada alterado.')
    console.log('Use FORCE_REPLACE_MIDIAS=1 para sobrescrever.')
    return
  }

  const uploaded = []

  for (let index = 0; index < DEFAULT_ASSETS.length; index += 1) {
    const asset = DEFAULT_ASSETS[index]
    const absolutePath = resolve(process.cwd(), asset.localPath)
    if (!existsSync(absolutePath)) {
      throw new Error(`Arquivo local nao encontrado: ${absolutePath}`)
    }

    const destination = `campaigns/${campaignId}/hero/${Date.now()}-${basename(asset.localPath)}`
    await bucket.upload(absolutePath, {
      destination,
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public,max-age=3600',
      },
    })

    const createdAt = new Date().toISOString()
    uploaded.push({
      id: `seed-hero-media-${index + 1}`,
      url: createPublicUrl(bucketName, destination),
      storagePath: destination,
      alt: asset.alt,
      order: index,
      active: true,
      createdAt,
    })
  }

  await campaignRef.set({
    midias: {
      heroCarousel: uploaded,
    },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'script:seed-campaign-hero-media',
  }, { merge: true })

  console.log(`Midias da campanha atualizadas com ${uploaded.length} slides.`)
}

run()
  .then(() => {
    console.log('Concluido.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Falha ao popular midias:', error)
    process.exit(1)
  })
