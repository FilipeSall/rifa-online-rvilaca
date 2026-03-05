import type { CampaignHeroCarouselMedia } from '../../../../../types/campaign'

export const MAX_HERO_CAROUSEL_ITEMS = 12

export function normalizeHeroCarouselOrder(items: CampaignHeroCarouselMedia[]) {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      ...item,
      order: index,
    }))
}

export function isHeroCarouselAtLimit(items: CampaignHeroCarouselMedia[], maxItems = MAX_HERO_CAROUSEL_ITEMS) {
  return items.length >= maxItems
}

export function appendHeroMediaItem(params: {
  items: CampaignHeroCarouselMedia[]
  uploadedMedia: CampaignHeroCarouselMedia
  heroAltInput: string
  maxItems?: number
}) {
  const maxItems = params.maxItems ?? MAX_HERO_CAROUSEL_ITEMS
  if (params.items.length >= maxItems) {
    return null
  }

  return normalizeHeroCarouselOrder([
    ...params.items,
    {
      ...params.uploadedMedia,
      alt: params.uploadedMedia.alt || params.heroAltInput.trim().slice(0, 140),
      order: params.items.length,
    },
  ])
}

export function toggleHeroMediaById(items: CampaignHeroCarouselMedia[], id: string) {
  return normalizeHeroCarouselOrder(items.map((item) => (
    item.id === id
      ? {
          ...item,
          active: !item.active,
        }
      : item
  )))
}

export function moveHeroMediaById(items: CampaignHeroCarouselMedia[], id: string, direction: -1 | 1) {
  const currentIndex = items.findIndex((item) => item.id === id)
  if (currentIndex < 0) {
    return null
  }

  const targetIndex = currentIndex + direction
  if (targetIndex < 0 || targetIndex >= items.length) {
    return null
  }

  const nextItems = [...items]
  const [movedItem] = nextItems.splice(currentIndex, 1)
  nextItems.splice(targetIndex, 0, movedItem)

  return nextItems.map((item, index) => ({
    ...item,
    order: index,
  }))
}

export function editHeroMediaAltById(items: CampaignHeroCarouselMedia[], id: string, rawAlt: string) {
  const nextAlt = rawAlt.trim().slice(0, 140)
  return normalizeHeroCarouselOrder(items.map((item) => (
    item.id === id
      ? {
          ...item,
          alt: nextAlt,
        }
      : item
  )))
}

export function removeHeroMediaById(items: CampaignHeroCarouselMedia[], id: string) {
  return normalizeHeroCarouselOrder(items.filter((item) => item.id !== id))
}
