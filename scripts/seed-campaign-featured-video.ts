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

type StoredFeaturedVideo = {
  storagePath?: unknown
  url?: unknown
}

const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'
const DEFAULT_SERVICE_ACCOUNT_PATH = 'rifa-online-395d9-firebase-adminsdk-fbsvc-c068a78ce5.json'
const DEFAULT_VIDEO_ASSET_PATH = 'src/assets/videoJonny.mp4'

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

function readStoragePath(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const storagePath = (value as StoredFeaturedVideo).storagePath
  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    return null
  }

  return storagePath.trim()
}

function hasUrl(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const url = (value as StoredFeaturedVideo).url
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

async function run() {
  const serviceAccount = loadServiceAccount()
  const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  const bucketName = resolveBucketName(serviceAccount)
  const campaignId = process.env.SEED_CAMPAIGN_ID || DEFAULT_CAMPAIGN_ID
  const allowReplace = process.env.FORCE_REPLACE_MIDIAS === '1'
  const videoAssetPath = process.env.FEATURED_VIDEO_ASSET_PATH || DEFAULT_VIDEO_ASSET_PATH

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

  const absoluteVideoPath = resolve(process.cwd(), videoAssetPath)
  if (!existsSync(absoluteVideoPath)) {
    throw new Error(`Arquivo local nao encontrado: ${absoluteVideoPath}`)
  }

  const db = getFirestore()
  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const campaignRef = db.collection('campaigns').doc(campaignId)
  const campaignSnapshot = await campaignRef.get()

  if (!campaignSnapshot.exists) {
    throw new Error(`Campanha nao encontrada: campaigns/${campaignId}`)
  }

  const currentFeaturedVideo = campaignSnapshot.get('midias.featuredVideo')
  if (hasUrl(currentFeaturedVideo) && !allowReplace) {
    console.log('Campanha ja possui midias.featuredVideo. Nada alterado.')
    console.log('Use FORCE_REPLACE_MIDIAS=1 para sobrescrever.')
    return
  }

  const destination = `campaigns/${campaignId}/featured-video/${Date.now()}-${basename(videoAssetPath)}`
  await bucket.upload(absoluteVideoPath, {
    destination,
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'public,max-age=3600',
    },
  })

  const createdAt = new Date().toISOString()
  await campaignRef.set({
    midias: {
      featuredVideo: {
        id: `seed-featured-video-${Date.now()}`,
        url: createPublicUrl(bucketName, destination),
        storagePath: destination,
        active: true,
        createdAt,
      },
    },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'script:seed-campaign-featured-video',
  }, { merge: true })

  const previousStoragePath = readStoragePath(currentFeaturedVideo)
  if (allowReplace && previousStoragePath && previousStoragePath !== destination) {
    try {
      await bucket.file(previousStoragePath).delete({ ignoreNotFound: true })
    } catch {
      console.log(`Aviso: nao foi possivel remover o video antigo em ${previousStoragePath}`)
    }
  }

  console.log('Video de destaque configurado com sucesso.')
}

run()
  .then(() => {
    console.log('Concluido.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Falha ao configurar video de destaque:', error)
    process.exit(1)
  })
