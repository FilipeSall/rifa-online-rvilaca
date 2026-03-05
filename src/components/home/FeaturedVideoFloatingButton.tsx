import { getDownloadURL, ref as storageRef } from 'firebase/storage'
import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { storage } from '../../lib/firebase'
import {
  getLocalStorage,
  safeStorageGetItem,
  safeStorageKeys,
  safeStorageRemoveItem,
  safeStorageSetItem,
} from '../../utils/webStorage'

const BADGE_DISMISSED_STORAGE_KEY = 'rifa-online:featured-video-badge-dismissed'
const VIDEO_URL_CACHE_PREFIX = 'rifa-online:video-url:'

function getCachedVideoUrl(storagePath: string): string | null {
  return safeStorageGetItem(getLocalStorage(), VIDEO_URL_CACHE_PREFIX + storagePath)
}

function setCachedVideoUrl(storagePath: string, url: string): void {
  const localStorageApi = getLocalStorage()
  if (!localStorageApi) {
    return
  }

  // Remove entradas antigas de outros storagePaths
  for (const key of safeStorageKeys(localStorageApi)) {
    if (key.startsWith(VIDEO_URL_CACHE_PREFIX) && key !== VIDEO_URL_CACHE_PREFIX + storagePath) {
      safeStorageRemoveItem(localStorageApi, key)
    }
  }

  safeStorageSetItem(localStorageApi, VIDEO_URL_CACHE_PREFIX + storagePath, url)
}

function isBadgeDismissed() {
  return safeStorageGetItem(getLocalStorage(), BADGE_DISMISSED_STORAGE_KEY) === '1'
}

function markBadgeAsDismissed() {
  safeStorageSetItem(getLocalStorage(), BADGE_DISMISSED_STORAGE_KEY, '1')
}

type FeaturedVideoFloatingButtonProps = {
  topSlot?: ReactNode
  middleSlot?: ReactNode
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export default function FeaturedVideoFloatingButton({
  topSlot = null,
  middleSlot = null,
}: FeaturedVideoFloatingButtonProps) {
  const { campaign } = useCampaignSettings()
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showNotificationBadge, setShowNotificationBadge] = useState(false)
  const featuredVideo = campaign.midias.featuredVideo
  const whatsappLink = useMemo(() => {
    const digitsOnlyNumber = campaign.supportWhatsappNumber.replace(/\D/g, '').slice(0, 15)
    if (digitsOnlyNumber.length < 10) {
      return null
    }

    const baseUrl = `https://wa.me/${digitsOnlyNumber}`
    const message = campaign.whatsappContactMessage?.trim()
    if (message) {
      const encodedMessage = encodeURIComponent(message)
      return `${baseUrl}?text=${encodedMessage}`
    }

    return baseUrl
  }, [campaign.supportWhatsappNumber, campaign.whatsappContactMessage])

  useEffect(() => {
    let isCancelled = false

    async function resolveFeaturedVideoUrl() {
      if (!featuredVideo?.active) {
        setResolvedVideoUrl(null)
        return
      }

      if (featuredVideo.storagePath) {
        const cached = getCachedVideoUrl(featuredVideo.storagePath)
        if (cached) {
          if (!isCancelled) setResolvedVideoUrl(cached)
          return
        }
        try {
          const url = await getDownloadURL(storageRef(storage, featuredVideo.storagePath))
          if (!isCancelled) {
            const validUrl = isHttpUrl(url) ? url : null
            if (validUrl) setCachedVideoUrl(featuredVideo.storagePath, validUrl)
            setResolvedVideoUrl(validUrl)
          }
          return
        } catch {
          // fallback para url persistida em Firestore
        }
      }

      const fallbackUrl = featuredVideo.url.trim()
      if (!isCancelled) {
        setResolvedVideoUrl(isHttpUrl(fallbackUrl) ? fallbackUrl : null)
      }
    }

    void resolveFeaturedVideoUrl()

    return () => {
      isCancelled = true
    }
  }, [featuredVideo?.active, featuredVideo?.storagePath, featuredVideo?.url])

  useEffect(() => {
    if (!resolvedVideoUrl) {
      setShowNotificationBadge(false)
      setIsModalOpen(false)
      return
    }

    const wasDismissed = isBadgeDismissed()
    setShowNotificationBadge(!wasDismissed)
  }, [resolvedVideoUrl])

  const handleOpenModal = () => {
    setIsModalOpen(true)
    if (showNotificationBadge) {
      setShowNotificationBadge(false)
      markBadgeAsDismissed()
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleModalContentClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  if (!resolvedVideoUrl && !whatsappLink && !topSlot && !middleSlot) {
    return null
  }

  return (
    <>
      <div className="fixed bottom-4 left-4 z-[70] flex flex-col gap-3 sm:bottom-6 sm:left-6">
        {topSlot}

        {resolvedVideoUrl ? (
          <div className="relative">
            {showNotificationBadge ? (
              <div className="pointer-events-none absolute -top-12 left-1/2 flex -translate-x-1/2 flex-col items-center">
                <span className="whitespace-nowrap rounded-full border border-amber-300 bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[0_10px_25px_rgba(0,0,0,0.35)]">
                  Video novo
                </span>
                <span className="relative -mt-[1px] h-[7px] w-3">
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-amber-300" />
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-amber-500" />
                </span>
              </div>
            ) : null}
            <button
              aria-label="Abrir video em destaque"
              className="group relative isolate flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-neon-pink/50 bg-black text-neon-pink shadow-[0_15px_35px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.03]"
              type="button"
              onClick={handleOpenModal}
            >
              {/* Frame do vídeo como capa — sem crossOrigin, sem CORS */}
              <video
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
                src={resolvedVideoUrl ?? undefined}
                onLoadedMetadata={(e) => { e.currentTarget.currentTime = 1 }}
              />
              <span className="pointer-events-none absolute -inset-2 rounded-full bg-black/40 blur-md" />
              <span className="absolute inset-0 rounded-full bg-black/40" />
              <span className="absolute inset-0 rounded-full border border-neon-pink/35 animate-ping opacity-35" />
              <span className="material-symbols-outlined relative z-10 text-3xl">play_circle</span>
            </button>
          </div>
        ) : null}

        {middleSlot}

        {whatsappLink ? (
          <a
            aria-label="Falar no WhatsApp"
            className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-600/90 text-white shadow-[0_15px_35px_rgba(0,0,0,0.45)] transition-all hover:scale-[1.03] hover:bg-emerald-500"
            href={whatsappLink ?? undefined}
            rel="noopener noreferrer"
            target="_blank"
          >
            <FaWhatsapp className="text-3xl" />
          </a>
        ) : null}
      </div>

      {isModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          onClick={handleCloseModal}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={handleModalContentClick}>
            <button
              aria-label="Fechar video"
              className="absolute -right-3 -top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-red-400/60 bg-red-500 text-lg font-black text-white shadow-[0_10px_20px_rgba(0,0,0,0.4)] transition hover:brightness-95"
              type="button"
              onClick={handleCloseModal}
            >
              X
            </button>
            <video
              autoPlay
              className="max-h-[90vh] max-w-[90vw] rounded-xl border border-white/15 bg-black object-contain"
              controls
              playsInline
              preload="metadata"
              src={resolvedVideoUrl ?? undefined}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
