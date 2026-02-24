import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { storage } from '../../../lib/firebase'
import type { CampaignFeaturedVideoMedia, CampaignHeroCarouselMedia } from '../../../types/campaign'

const MAX_HERO_MEDIA_FILE_SIZE_BYTES = 8 * 1024 * 1024
const MAX_FEATURED_VIDEO_FILE_SIZE_BYTES = 70 * 1024 * 1024

function sanitizeCampaignId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'campaign'
}

function sanitizeAlt(value: string) {
  return value.trim().slice(0, 140)
}

function resolveExtensionFromFile(file: File) {
  const extensionFromName = file.name.split('.').pop()?.trim().toLowerCase()
  if (extensionFromName && /^[a-z0-9]+$/.test(extensionFromName)) {
    return extensionFromName.slice(0, 10)
  }

  const mime = file.type.toLowerCase()
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('png')) return 'png'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

function resolveVideoExtensionFromFile(file: File) {
  const extensionFromName = file.name.split('.').pop()?.trim().toLowerCase()
  if (extensionFromName && /^[a-z0-9]+$/.test(extensionFromName)) {
    return extensionFromName.slice(0, 10)
  }

  const mime = file.type.toLowerCase()
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('quicktime')) return 'mov'
  return 'mp4'
}

function ensureValidImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione apenas arquivos de imagem.')
  }

  if (file.size > MAX_HERO_MEDIA_FILE_SIZE_BYTES) {
    throw new Error('Imagem acima do limite de 8MB.')
  }
}

function ensureValidFeaturedVideoFile(file: File) {
  if (!file.type.startsWith('video/')) {
    throw new Error('Selecione apenas arquivos de video.')
  }

  if (file.size > MAX_FEATURED_VIDEO_FILE_SIZE_BYTES) {
    throw new Error('Video acima do limite de 70MB.')
  }
}

export async function uploadCampaignHeroCarouselImage(
  file: File,
  campaignId: string,
  alt: string,
): Promise<CampaignHeroCarouselMedia> {
  ensureValidImageFile(file)

  const normalizedCampaignId = sanitizeCampaignId(campaignId)
  const extension = resolveExtensionFromFile(file)
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`
  const path = `campaigns/${normalizedCampaignId}/hero/${uniqueName}`
  const heroMediaRef = storageRef(storage, path)
  const uploadTask = uploadBytesResumable(heroMediaRef, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: 'public,max-age=3600',
  })

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      () => undefined,
      (error) => reject(error),
      () => resolve(),
    )
  })

  const url = await getDownloadURL(heroMediaRef)
  const createdAt = new Date().toISOString()

  return {
    id: `hero-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    storagePath: path,
    alt: sanitizeAlt(alt),
    order: 0,
    active: true,
    createdAt,
  }
}

export async function deleteCampaignHeroCarouselImage(storagePath: string | null | undefined) {
  if (!storagePath) {
    return
  }

  const heroMediaRef = storageRef(storage, storagePath)
  await deleteObject(heroMediaRef)
}

export async function uploadCampaignFeaturedVideo(
  file: File,
  campaignId: string,
): Promise<CampaignFeaturedVideoMedia> {
  ensureValidFeaturedVideoFile(file)

  const normalizedCampaignId = sanitizeCampaignId(campaignId)
  const extension = resolveVideoExtensionFromFile(file)
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`
  const path = `campaigns/${normalizedCampaignId}/featured-video/${uniqueName}`
  const featuredVideoRef = storageRef(storage, path)
  const uploadTask = uploadBytesResumable(featuredVideoRef, file, {
    contentType: file.type || 'video/mp4',
    cacheControl: 'public,max-age=3600',
  })

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      () => undefined,
      (error) => reject(error),
      () => resolve(),
    )
  })

  const url = await getDownloadURL(featuredVideoRef)
  const createdAt = new Date().toISOString()

  return {
    id: `featured-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    storagePath: path,
    active: true,
    createdAt,
  }
}

export async function deleteCampaignFeaturedVideo(storagePath: string | null | undefined) {
  if (!storagePath) {
    return
  }

  const featuredVideoRef = storageRef(storage, storagePath)
  await deleteObject(featuredVideoRef)
}
