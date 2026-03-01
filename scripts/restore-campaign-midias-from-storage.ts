import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type HeroMedia = {
  id: string
  url: string
  storagePath: string
  alt: string
  order: number
  active: boolean
  createdAt: string
}

type FeaturedVideo = {
  id: string
  url: string
  storagePath: string
  active: boolean
  createdAt: string
}

type ScriptFlags = {
  campaignId: string
  bucketName: string | null
  serviceAccountPath: string
  heroLimit: number
  mostPurchasedQuantity: number
  restorePackPrices: boolean
  promotionMode: 'keep' | 'null' | 'set'
  promotionTargetQuantity: number
  promotionDiscountType: 'percent' | 'fixed'
  promotionDiscountValue: number
  apply: boolean
}

const DEFAULT_CAMPAIGN_ID = 'campanha-bmw-r1200-gs-2026'
const DEFAULT_SERVICE_ACCOUNT_PATH = 'rifa-online-395d9-firebase-adminsdk-fbsvc-c068a78ce5.json'
const DEFAULT_HERO_LIMIT = 12
const DEFAULT_PACK_QUANTITIES = [10, 50, 100, 250, 350, 500, 750, 1000]
const DEFAULT_UNIT_PRICE = 0.99

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  return ''
}

function normalizeBucketName(rawBucket: string): string {
  return rawBucket.replace(/^gs:\/\//, '').trim()
}

function parseArgs(argv: string[]): ScriptFlags {
  let campaignId = DEFAULT_CAMPAIGN_ID
  let bucketName: string | null = null
  let serviceAccountPath = DEFAULT_SERVICE_ACCOUNT_PATH
  let heroLimit = DEFAULT_HERO_LIMIT
  let mostPurchasedQuantity = 100
  let restorePackPrices = true
  let promotionMode: 'keep' | 'null' | 'set' = 'keep'
  let promotionTargetQuantity = 100
  let promotionDiscountType: 'percent' | 'fixed' = 'percent'
  let promotionDiscountValue = 0
  let apply = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if ((arg === '--campaignId' || arg === '--campaign-id') && next) {
      campaignId = readString(next) || DEFAULT_CAMPAIGN_ID
      index += 1
      continue
    }

    if ((arg === '--bucket' || arg === '--bucketName') && next) {
      const parsed = normalizeBucketName(readString(next))
      bucketName = parsed || null
      index += 1
      continue
    }

    if ((arg === '--serviceAccountPath' || arg === '--service-account') && next) {
      serviceAccountPath = readString(next) || DEFAULT_SERVICE_ACCOUNT_PATH
      index += 1
      continue
    }

    if ((arg === '--heroLimit' || arg === '--hero-limit') && next) {
      const parsed = Number(next)
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 60) {
        heroLimit = parsed
      }
      index += 1
      continue
    }

    if ((arg === '--mostPurchasedQuantity' || arg === '--most-purchased') && next) {
      const parsed = Number(next)
      if (Number.isInteger(parsed) && parsed > 0) {
        mostPurchasedQuantity = parsed
      }
      index += 1
      continue
    }

    if (arg === '--skip-pack-prices') {
      restorePackPrices = false
      continue
    }

    if (arg === '--promotion-null') {
      promotionMode = 'null'
      continue
    }

    if (arg === '--promotion-set') {
      promotionMode = 'set'
      continue
    }

    if ((arg === '--promotionTargetQuantity' || arg === '--promotion-target') && next) {
      const parsed = Number(next)
      if (Number.isInteger(parsed) && parsed > 0) {
        promotionTargetQuantity = parsed
      }
      index += 1
      continue
    }

    if ((arg === '--promotionDiscountType' || arg === '--promotion-type') && next) {
      const parsed = readString(next).toLowerCase()
      if (parsed === 'percent' || parsed === 'fixed') {
        promotionDiscountType = parsed
      }
      index += 1
      continue
    }

    if ((arg === '--promotionDiscountValue' || arg === '--promotion-value') && next) {
      const parsed = Number(next)
      if (Number.isFinite(parsed) && parsed >= 0) {
        promotionDiscountValue = parsed
      }
      index += 1
      continue
    }

    if (arg === '--apply') {
      apply = true
      continue
    }
  }

  return {
    campaignId,
    bucketName,
    serviceAccountPath,
    heroLimit,
    mostPurchasedQuantity,
    restorePackPrices,
    promotionMode,
    promotionTargetQuantity,
    promotionDiscountType,
    promotionDiscountValue,
    apply,
  }
}

function loadServiceAccount(pathInput: string): ServiceAccount {
  const absolute = resolve(process.cwd(), pathInput)
  if (!existsSync(absolute)) {
    throw new Error(`Service account nao encontrado: ${absolute}`)
  }

  const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as ServiceAccount
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Service account invalido (project_id/client_email/private_key obrigatorios).')
  }

  return parsed
}

function resolveBucketName(flagsBucket: string | null, serviceAccount: ServiceAccount): string {
  const envBucket = normalizeBucketName(
    readString(process.env.FIREBASE_STORAGE_BUCKET) || readString(process.env.VITE_FIREBASE_STORAGE_BUCKET),
  )

  if (flagsBucket) {
    return flagsBucket
  }

  if (envBucket) {
    return envBucket
  }

  if (!serviceAccount.project_id) {
    throw new Error('Nao foi possivel resolver bucket sem project_id.')
  }

  return `${serviceAccount.project_id}.firebasestorage.app`
}

function createPublicUrl(bucketName: string, storagePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`
}

function buildAltFromFileName(storagePath: string): string {
  const file = basename(storagePath)
  const withoutExt = file.slice(0, file.length - extname(file).length)
  const withoutTimestampPrefix = withoutExt.replace(/^\d{10,15}[-_]/, '')
  const humanized = withoutTimestampPrefix
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!humanized) {
    return 'Midia da campanha'
  }

  return humanized.slice(0, 140)
}

function toIsoOrNow(value: unknown): string {
  const parsed = readString(value)
  if (parsed) {
    return parsed
  }

  return new Date().toISOString()
}

function readPricePerCota(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_UNIT_PRICE
  }

  return Number(parsed.toFixed(2))
}

function buildPackPrices(unitPrice: number, mostPurchasedQuantity: number) {
  return DEFAULT_PACK_QUANTITIES.map((quantity) => ({
    quantity,
    price: Number((quantity * unitPrice).toFixed(2)),
    active: true,
    mostPurchasedTag: quantity === mostPurchasedQuantity,
  }))
}

function clampPromotionValue(
  discountType: 'percent' | 'fixed',
  discountValue: number,
): number {
  if (discountType === 'percent') {
    return Number(Math.min(Math.max(discountValue, 0), 100).toFixed(2))
  }

  return Number(Math.max(discountValue, 0).toFixed(2))
}

async function run() {
  const flags = parseArgs(process.argv.slice(2))
  const serviceAccount = loadServiceAccount(flags.serviceAccountPath)
  const projectId = readString(process.env.FIREBASE_PROJECT_ID) || serviceAccount.project_id

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID ausente.')
  }

  const bucketName = resolveBucketName(flags.bucketName, serviceAccount)

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

  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const db = getFirestore()
  const campaignRef = db.collection('campaigns').doc(flags.campaignId)
  const campaignSnapshot = await campaignRef.get()
  if (!campaignSnapshot.exists) {
    throw new Error(`Campanha nao encontrada: campaigns/${flags.campaignId}`)
  }
  const currentCampaign = campaignSnapshot.data() || {}

  const heroPrefix = `campaigns/${flags.campaignId}/hero/`
  const featuredPrefix = `campaigns/${flags.campaignId}/featured-video/`

  const [heroFilesRaw] = await bucket.getFiles({ prefix: heroPrefix })
  const [featuredFilesRaw] = await bucket.getFiles({ prefix: featuredPrefix })

  const heroFiles = heroFilesRaw.filter((file) => file.name && !file.name.endsWith('/'))
  const featuredFiles = featuredFilesRaw.filter((file) => file.name && !file.name.endsWith('/'))

  const heroWithMeta = await Promise.all(
    heroFiles.map(async (file) => {
      const [meta] = await file.getMetadata()
      return {
        name: file.name,
        timeCreated: toIsoOrNow(meta.timeCreated),
      }
    }),
  )

  heroWithMeta.sort((left, right) => left.timeCreated.localeCompare(right.timeCreated))
  const selectedHero = heroWithMeta.slice(0, flags.heroLimit)

  const heroCarousel: HeroMedia[] = selectedHero.map((item, index) => ({
    id: `restored-hero-media-${index + 1}`,
    url: createPublicUrl(bucketName, item.name),
    storagePath: item.name,
    alt: buildAltFromFileName(item.name),
    order: index,
    active: true,
    createdAt: item.timeCreated,
  }))

  let featuredVideo: FeaturedVideo | null = null
  if (featuredFiles.length > 0) {
    const featuredWithMeta = await Promise.all(
      featuredFiles.map(async (file) => {
        const [meta] = await file.getMetadata()
        return {
          name: file.name,
          timeCreated: toIsoOrNow(meta.timeCreated),
        }
      }),
    )

    featuredWithMeta.sort((left, right) => right.timeCreated.localeCompare(left.timeCreated))
    const selected = featuredWithMeta[0]
    featuredVideo = {
      id: 'restored-featured-video-1',
      url: createPublicUrl(bucketName, selected.name),
      storagePath: selected.name,
      active: true,
      createdAt: selected.timeCreated,
    }
  }

  const unitPrice = readPricePerCota(currentCampaign.pricePerCota)
  const packPrices = buildPackPrices(unitPrice, flags.mostPurchasedQuantity)
  const defaultPromotion = {
    active: true,
    targetQuantity: flags.promotionTargetQuantity,
    discountType: flags.promotionDiscountType,
    discountValue: clampPromotionValue(flags.promotionDiscountType, flags.promotionDiscountValue),
    label: 'Mais compradas',
  }

  const updateData: Record<string, unknown> = {
    midias: {
      heroCarousel,
      featuredVideo,
    },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'script:restore-campaign-midias-from-storage',
  }

  if (flags.restorePackPrices) {
    updateData.pricePerCota = unitPrice
    updateData.packPrices = packPrices
  }

  if (flags.promotionMode === 'null') {
    updateData.featuredPromotion = null
  } else if (flags.promotionMode === 'set') {
    updateData.featuredPromotion = defaultPromotion
  }

  console.log('\n[restore-midias] Diagnostico')
  console.log(JSON.stringify({
    projectId,
    bucketName,
    campaignId: flags.campaignId,
    apply: flags.apply,
    heroFilesFound: heroFiles.length,
    heroFilesSelected: heroCarousel.length,
    featuredFilesFound: featuredFiles.length,
    featuredVideoSelected: Boolean(featuredVideo),
    restorePackPrices: flags.restorePackPrices,
    unitPrice,
    mostPurchasedQuantity: flags.mostPurchasedQuantity,
    packPricesPreview: packPrices,
    promotionMode: flags.promotionMode,
    promotionPreview:
      flags.promotionMode === 'set'
        ? defaultPromotion
        : flags.promotionMode === 'null'
          ? null
          : currentCampaign.featuredPromotion || null,
    heroPreview: heroCarousel.slice(0, 3),
    featuredPreview: featuredVideo,
  }, null, 2))

  if (!flags.apply) {
    console.log('\nDry-run concluido. Execute com --apply para gravar no Firestore.')
    return
  }

  await campaignRef.set(updateData, { merge: true })

  console.log('\nRestauracao aplicada com sucesso em campaigns/' + flags.campaignId)
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nFalha ao restaurar midias:', error)
    process.exit(1)
  })
