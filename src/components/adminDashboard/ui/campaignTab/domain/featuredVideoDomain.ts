import type { CampaignFeaturedVideoMedia, CampaignMidias } from '../../../../../types/campaign'

export function resolveFeaturedVideo(value: CampaignMidias['featuredVideo']): CampaignFeaturedVideoMedia | null {
  if (!value?.url) {
    return null
  }

  return value
}

export function isFeaturedVideoBusy(isUploadingFeaturedVideo: boolean, isRemovingFeaturedVideo: boolean) {
  return isUploadingFeaturedVideo || isRemovingFeaturedVideo
}

export function buildMidiasWithFeaturedVideo(midias: CampaignMidias, featuredVideo: CampaignFeaturedVideoMedia) {
  return {
    ...midias,
    featuredVideo,
  }
}

export function buildMidiasWithoutFeaturedVideo(midias: CampaignMidias) {
  return {
    ...midias,
    featuredVideo: null,
  }
}
