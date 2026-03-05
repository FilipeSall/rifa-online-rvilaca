import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'react-toastify'
import type { CampaignHeroCarouselMedia, CampaignMidias } from '../../../types/campaign'
import {
  deleteCampaignHeroCarouselImage,
  uploadCampaignHeroCarouselImage,
} from '../services/campaignMediaStorageService'
import {
  appendHeroMediaItem,
  editHeroMediaAltById,
  isHeroCarouselAtLimit,
  moveHeroMediaById,
  removeHeroMediaById,
  toggleHeroMediaById,
} from '../ui/campaignTab/domain/heroMediaDomain'
import { parseErrorMessage } from '../ui/campaignTab/utils/errorUtils'

type ToastOptions = {
  toastId?: string
}

type HeroMediaManagerDeps = {
  uploadHeroMedia?: (file: File, campaignId: string, alt: string) => Promise<CampaignHeroCarouselMedia>
  deleteHeroMedia?: (storagePath: string | null | undefined) => Promise<void>
  copyText?: (text: string) => Promise<void>
  promptAlt?: (message: string, defaultValue: string) => string | null
  toastSuccess?: (message: string, options?: ToastOptions) => void
  toastError?: (message: string, options?: ToastOptions) => void
  parseError?: (error: unknown, fallback: string) => string
}

type HeroMediaManagerParams = {
  campaignId: string
  midias: CampaignMidias
  setMidias: Dispatch<SetStateAction<CampaignMidias>>
  heroCarouselItems: CampaignHeroCarouselMedia[]
  currentPrizeAlt: string
  persistMidias: (nextMidias: CampaignMidias) => Promise<boolean>
  deps?: HeroMediaManagerDeps
}

export function useHeroMediaManager(params: HeroMediaManagerParams) {
  const deps = params.deps ?? {}
  const uploadHeroMedia = deps.uploadHeroMedia ?? uploadCampaignHeroCarouselImage
  const deleteHeroMedia = deps.deleteHeroMedia ?? deleteCampaignHeroCarouselImage
  const copyText = deps.copyText ?? (async (value: string) => {
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      throw new Error('Copiar link exige contexto seguro (HTTPS ou localhost).')
    }

    await navigator.clipboard.writeText(value)
  })
  const promptAlt = deps.promptAlt ?? ((message: string, defaultValue: string) => window.prompt(message, defaultValue))
  const toastSuccess = deps.toastSuccess ?? ((message: string, options?: ToastOptions) => toast.success(message, options))
  const toastError = deps.toastError ?? ((message: string, options?: ToastOptions) => toast.error(message, options))
  const parseError = deps.parseError ?? parseErrorMessage

  const [selectedHeroFile, setSelectedHeroFile] = useState<File | null>(null)
  const [heroAltInput, setHeroAltInput] = useState('')
  const [isUploadingHeroMedia, setIsUploadingHeroMedia] = useState(false)
  const [heroMediaActionId, setHeroMediaActionId] = useState<string | null>(null)

  useEffect(() => {
    if (!heroAltInput.trim()) {
      setHeroAltInput(params.currentPrizeAlt)
    }
  }, [heroAltInput, params.currentPrizeAlt])

  const isHeroAtLimit = useMemo(
    () => isHeroCarouselAtLimit(params.heroCarouselItems),
    [params.heroCarouselItems],
  )

  const handleUploadHeroMedia = async () => {
    if (!selectedHeroFile) {
      toastError('Selecione um arquivo de imagem para continuar.', {
        toastId: 'campaign-media-missing-file',
      })
      return
    }

    if (isHeroAtLimit) {
      toastError('Limite de 12 imagens no carrossel atingido.', {
        toastId: 'campaign-media-max-items',
      })
      return
    }

    setIsUploadingHeroMedia(true)
    let uploadedMedia: CampaignHeroCarouselMedia | null = null

    try {
      uploadedMedia = await uploadHeroMedia(selectedHeroFile, params.campaignId, heroAltInput)
      const nextHeroItems = appendHeroMediaItem({
        items: params.heroCarouselItems,
        uploadedMedia,
        heroAltInput,
      })

      if (!nextHeroItems) {
        return
      }

      const nextMidias = {
        ...params.midias,
        heroCarousel: nextHeroItems,
      }
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        if (uploadedMedia.storagePath) {
          try {
            await deleteHeroMedia(uploadedMedia.storagePath)
          } catch {
            // Ignora erro de limpeza para nao sobrescrever o erro principal de persistencia.
          }
        }
        return
      }

      params.setMidias(nextMidias)
      setSelectedHeroFile(null)
      setHeroAltInput('')
    } catch (error) {
      toastError(parseError(error, 'Falha ao enviar imagem do carrossel.'), {
        toastId: 'campaign-media-upload-error',
      })
    } finally {
      setIsUploadingHeroMedia(false)
    }
  }

  const handleToggleHeroMedia = async (id: string) => {
    setHeroMediaActionId(id)
    try {
      const nextItems = toggleHeroMediaById(params.heroCarouselItems, id)
      const nextMidias = {
        ...params.midias,
        heroCarousel: nextItems,
      }
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        return
      }

      params.setMidias(nextMidias)
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleMoveHeroMedia = async (id: string, direction: -1 | 1) => {
    const nextItems = moveHeroMediaById(params.heroCarouselItems, id, direction)
    if (!nextItems) {
      return
    }

    setHeroMediaActionId(id)
    try {
      const nextMidias = {
        ...params.midias,
        heroCarousel: nextItems,
      }
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        return
      }

      params.setMidias(nextMidias)
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleEditHeroMediaAlt = async (media: CampaignHeroCarouselMedia) => {
    const prompted = promptAlt('Texto alternativo da imagem', media.alt || '')
    if (prompted === null) {
      return
    }

    const nextAlt = prompted.trim().slice(0, 140)
    if (nextAlt === media.alt) {
      return
    }

    setHeroMediaActionId(media.id)
    try {
      const nextItems = editHeroMediaAltById(params.heroCarouselItems, media.id, nextAlt)
      const nextMidias = {
        ...params.midias,
        heroCarousel: nextItems,
      }
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        return
      }

      params.setMidias(nextMidias)
    } finally {
      setHeroMediaActionId(null)
    }
  }

  const handleCopyMediaUrl = async (url: string, mediaId: string) => {
    try {
      await copyText(url)
      toastSuccess('Link copiado.', {
        toastId: `campaign-media-link-copied-${mediaId}`,
      })
    } catch (error) {
      toastError(parseError(error, 'Nao foi possivel copiar o link.'), {
        toastId: `campaign-media-link-copy-error-${mediaId}`,
      })
    }
  }

  const handleRemoveHeroMedia = async (media: CampaignHeroCarouselMedia) => {
    setHeroMediaActionId(media.id)
    try {
      const nextItems = removeHeroMediaById(params.heroCarouselItems, media.id)
      const nextMidias = {
        ...params.midias,
        heroCarousel: nextItems,
      }
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        return
      }

      params.setMidias(nextMidias)

      try {
        await deleteHeroMedia(media.storagePath)
      } catch (error) {
        const restored = await params.persistMidias(params.midias)
        if (restored) {
          params.setMidias(params.midias)
          toastError(parseError(error, 'Falha ao remover no Storage. O slide foi restaurado.'), {
            toastId: `campaign-media-delete-storage-error-${media.id}`,
          })
          return
        }

        toastError(
          'Falha ao remover no Storage e nao foi possivel restaurar o slide automaticamente. Recarregue e tente novamente.',
          {
            toastId: `campaign-media-delete-storage-restore-failed-${media.id}`,
          },
        )
        return
      }

      toastSuccess('Slide removido com sucesso (painel + storage).', {
        toastId: `campaign-media-removed-${media.id}`,
      })
    } finally {
      setHeroMediaActionId(null)
    }
  }

  return {
    selectedHeroFile,
    setSelectedHeroFile,
    heroAltInput,
    setHeroAltInput,
    isUploadingHeroMedia,
    heroMediaActionId,
    isHeroAtLimit,
    handleUploadHeroMedia,
    handleToggleHeroMedia,
    handleMoveHeroMedia,
    handleEditHeroMediaAlt,
    handleCopyMediaUrl,
    handleRemoveHeroMedia,
  }
}
