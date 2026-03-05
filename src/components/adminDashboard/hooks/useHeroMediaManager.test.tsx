import { act, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignMidias } from '../../../types/campaign'
import { useHeroMediaManager } from './useHeroMediaManager'

vi.mock('../services/campaignMediaStorageService', () => ({
  uploadCampaignHeroCarouselImage: vi.fn(),
  deleteCampaignHeroCarouselImage: vi.fn(),
}))

function useHeroHarness() {
  const [midias, setMidias] = useState<CampaignMidias>({ heroCarousel: [], featuredVideo: null })
  const persistMidiasRef = useRef(vi.fn(async () => true))
  const persistMidias = persistMidiasRef.current

  const hook = useHeroMediaManager({
    campaignId: 'campaign-1',
    midias,
    setMidias,
    heroCarouselItems: midias.heroCarousel,
    currentPrizeAlt: 'Premio principal',
    persistMidias,
    deps: {
      uploadHeroMedia: vi.fn(async () => ({
        id: 'hero-1',
        url: 'https://hero',
        storagePath: 'hero/path',
        alt: '',
        order: 0,
        active: true,
        createdAt: 'now',
      })),
      deleteHeroMedia: vi.fn(async () => undefined),
      copyText: vi.fn(async () => undefined),
      promptAlt: vi.fn(() => null),
      toastError: vi.fn(),
      toastSuccess: vi.fn(),
    },
  })

  return {
    ...hook,
    persistMidias,
  }
}

describe('useHeroMediaManager', () => {
  it('usa alt padrao e faz upload com persistencia', async () => {
    const { result } = renderHook(() => useHeroHarness())

    expect(result.current.heroAltInput).toBe('Premio principal')

    const file = new File(['img'], 'hero.png', { type: 'image/png' })
    act(() => {
      result.current.setSelectedHeroFile(file)
    })

    await act(async () => {
      await result.current.handleUploadHeroMedia()
    })

    expect(result.current.persistMidias).toHaveBeenCalledTimes(1)
    expect(result.current.selectedHeroFile).toBeNull()
  })
})
