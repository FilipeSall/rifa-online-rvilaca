import { act, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignMidias } from '../../../types/campaign'
import { useFeaturedVideoManager } from './useFeaturedVideoManager'

vi.mock('../services/campaignMediaStorageService', () => ({
  uploadCampaignFeaturedVideo: vi.fn(),
  deleteCampaignFeaturedVideo: vi.fn(),
}))

function useFeaturedVideoHarness() {
  const [midias, setMidias] = useState<CampaignMidias>({ heroCarousel: [], featuredVideo: null })
  const persistMidiasRef = useRef(vi.fn(async () => true))
  const persistMidias = persistMidiasRef.current

  const hook = useFeaturedVideoManager({
    campaignId: 'campaign-1',
    midias,
    setMidias,
    featuredVideo: midias.featuredVideo,
    persistMidias,
    deps: {
      uploadFeaturedVideo: vi.fn(async () => ({
        id: 'video-1',
        url: 'https://video',
        storagePath: 'video/path',
        active: true,
        createdAt: 'now',
      })),
      deleteFeaturedVideo: vi.fn(async () => undefined),
      copyText: vi.fn(async () => undefined),
      toastSuccess: vi.fn(),
      toastError: vi.fn(),
    },
  })

  return {
    ...hook,
    persistMidias,
  }
}

describe('useFeaturedVideoManager', () => {
  it('faz upload de video e persiste midias', async () => {
    const { result } = renderHook(() => useFeaturedVideoHarness())

    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' })
    act(() => {
      result.current.setSelectedFeaturedVideoFile(file)
    })

    await act(async () => {
      await result.current.handleUploadFeaturedVideo()
    })

    expect(result.current.persistMidias).toHaveBeenCalledTimes(1)
    expect(result.current.selectedFeaturedVideoFile).toBeNull()
  })
})
