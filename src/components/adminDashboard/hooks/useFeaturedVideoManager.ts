import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'react-toastify'
import type { CampaignFeaturedVideoMedia, CampaignMidias } from '../../../types/campaign'
import {
  deleteCampaignFeaturedVideo,
  uploadCampaignFeaturedVideo,
} from '../services/campaignMediaStorageService'
import {
  buildMidiasWithFeaturedVideo,
  buildMidiasWithoutFeaturedVideo,
  isFeaturedVideoBusy as resolveFeaturedVideoBusy,
} from '../ui/campaignTab/domain/featuredVideoDomain'
import { parseErrorMessage } from '../ui/campaignTab/utils/errorUtils'

type ToastOptions = {
  toastId?: string
}

type FeaturedVideoManagerDeps = {
  uploadFeaturedVideo?: (file: File, campaignId: string) => Promise<CampaignFeaturedVideoMedia>
  deleteFeaturedVideo?: (storagePath: string | null | undefined) => Promise<void>
  copyText?: (text: string) => Promise<void>
  toastSuccess?: (message: string, options?: ToastOptions) => void
  toastError?: (message: string, options?: ToastOptions) => void
  parseError?: (error: unknown, fallback: string) => string
}

type FeaturedVideoManagerParams = {
  campaignId: string
  midias: CampaignMidias
  setMidias: Dispatch<SetStateAction<CampaignMidias>>
  featuredVideo: CampaignFeaturedVideoMedia | null
  persistMidias: (nextMidias: CampaignMidias) => Promise<boolean>
  deps?: FeaturedVideoManagerDeps
}

export function useFeaturedVideoManager(params: FeaturedVideoManagerParams) {
  const deps = params.deps ?? {}
  const uploadFeaturedVideo = deps.uploadFeaturedVideo ?? uploadCampaignFeaturedVideo
  const deleteFeaturedVideo = deps.deleteFeaturedVideo ?? deleteCampaignFeaturedVideo
  const copyText = deps.copyText ?? (async (value: string) => {
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      throw new Error('Copiar link exige contexto seguro (HTTPS ou localhost).')
    }

    await navigator.clipboard.writeText(value)
  })
  const toastSuccess = deps.toastSuccess ?? ((message: string, options?: ToastOptions) => toast.success(message, options))
  const toastError = deps.toastError ?? ((message: string, options?: ToastOptions) => toast.error(message, options))
  const parseError = deps.parseError ?? parseErrorMessage

  const [selectedFeaturedVideoFile, setSelectedFeaturedVideoFile] = useState<File | null>(null)
  const [isUploadingFeaturedVideo, setIsUploadingFeaturedVideo] = useState(false)
  const [isRemovingFeaturedVideo, setIsRemovingFeaturedVideo] = useState(false)

  const isFeaturedVideoBusy = useMemo(
    () => resolveFeaturedVideoBusy(isUploadingFeaturedVideo, isRemovingFeaturedVideo),
    [isRemovingFeaturedVideo, isUploadingFeaturedVideo],
  )

  const handleUploadFeaturedVideo = async () => {
    if (!selectedFeaturedVideoFile) {
      toastError('Selecione um arquivo de video para continuar.', {
        toastId: 'campaign-featured-video-missing-file',
      })
      return
    }

    setIsUploadingFeaturedVideo(true)
    const previousFeaturedVideo = params.featuredVideo
    let uploadedFeaturedVideo: CampaignFeaturedVideoMedia | null = null

    try {
      uploadedFeaturedVideo = await uploadFeaturedVideo(selectedFeaturedVideoFile, params.campaignId)
      const nextMidias = buildMidiasWithFeaturedVideo(params.midias, uploadedFeaturedVideo)
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        if (uploadedFeaturedVideo.storagePath) {
          try {
            await deleteFeaturedVideo(uploadedFeaturedVideo.storagePath)
          } catch {
            // Ignora erro de limpeza para nao sobrescrever o erro principal de persistencia.
          }
        }
        return
      }

      params.setMidias(nextMidias)
      setSelectedFeaturedVideoFile(null)

      if (previousFeaturedVideo?.storagePath) {
        try {
          await deleteFeaturedVideo(previousFeaturedVideo.storagePath)
        } catch (error) {
          toastError(parseError(error, 'Novo video salvo, mas nao foi possivel remover o video antigo.'), {
            toastId: 'campaign-featured-video-cleanup-warning',
          })
        }
      }

      toastSuccess('Video em destaque atualizado.', {
        toastId: 'campaign-featured-video-updated',
      })
    } catch (error) {
      toastError(parseError(error, 'Falha ao enviar video em destaque.'), {
        toastId: 'campaign-featured-video-upload-error',
      })
    } finally {
      setIsUploadingFeaturedVideo(false)
    }
  }

  const handleRemoveFeaturedVideo = async () => {
    if (!params.featuredVideo) {
      return
    }

    setIsRemovingFeaturedVideo(true)
    try {
      const nextMidias = buildMidiasWithoutFeaturedVideo(params.midias)
      const saved = await params.persistMidias(nextMidias)
      if (!saved) {
        return
      }

      params.setMidias(nextMidias)
      setSelectedFeaturedVideoFile(null)

      try {
        await deleteFeaturedVideo(params.featuredVideo.storagePath)
      } catch (error) {
        const restored = await params.persistMidias(params.midias)
        if (restored) {
          params.setMidias(params.midias)
          toastError(parseError(error, 'Falha ao remover no Storage. O video foi restaurado.'), {
            toastId: 'campaign-featured-video-delete-storage-error',
          })
          return
        }

        toastError(
          'Falha ao remover no Storage e nao foi possivel restaurar o video automaticamente. Recarregue e tente novamente.',
          {
            toastId: 'campaign-featured-video-delete-storage-restore-failed',
          },
        )
        return
      }

      toastSuccess('Video removido com sucesso (painel + storage).', {
        toastId: 'campaign-featured-video-removed',
      })
    } finally {
      setIsRemovingFeaturedVideo(false)
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

  return {
    selectedFeaturedVideoFile,
    setSelectedFeaturedVideoFile,
    isUploadingFeaturedVideo,
    isRemovingFeaturedVideo,
    isFeaturedVideoBusy,
    handleUploadFeaturedVideo,
    handleRemoveFeaturedVideo,
    handleCopyMediaUrl,
  }
}
