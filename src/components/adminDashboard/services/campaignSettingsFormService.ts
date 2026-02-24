import {
  DEFAULT_ADDITIONAL_PRIZES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_MIN_PURCHASE_QUANTITY,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_SUPPORT_WHATSAPP_NUMBER,
  DEFAULT_TOTAL_NUMBERS,
} from '../../../const/campaign'
import type {
  CampaignFeaturedVideoMedia,
  CampaignCoupon,
  CampaignHeroCarouselMedia,
  CampaignMidias,
  UpsertCampaignSettingsInput,
} from '../../../types/campaign'
import { parseCampaignDateTime, resolveCampaignScheduleStatus } from '../../../utils/campaignSchedule'

export type CampaignFormState = {
  title: string
  pricePerCotaInput: string
  minPurchaseQuantityInput: string
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  totalNumbersInput: string
  additionalPrizes: string[]
  supportWhatsappNumber: string
  whatsappContactMessage: string
  startsAt: string
  startsAtTime: string
  endsAt: string
  endsAtTime: string
  coupons: CampaignCoupon[]
  midias: CampaignMidias
}

type CampaignValidationResult = {
  errorToastId: string | null
  errorMessage: string | null
  payload: UpsertCampaignSettingsInput | null
}

function sanitizeHeroCarouselMediaItems(value: unknown): CampaignHeroCarouselMedia[] {
  const items = Array.isArray(value) ? value : []
  const deduplicated = new Map<string, CampaignHeroCarouselMedia>()

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item || typeof item !== 'object') {
      continue
    }

    const payload = item as Partial<CampaignHeroCarouselMedia>
    const id = typeof payload.id === 'string' ? payload.id.trim().slice(0, 96) : ''
    const url = typeof payload.url === 'string' ? payload.url.trim() : ''
    if (!id || !/^https?:\/\//i.test(url)) {
      continue
    }

    const storagePath = typeof payload.storagePath === 'string' && payload.storagePath.trim()
      ? payload.storagePath.trim().slice(0, 260)
      : null
    const alt = typeof payload.alt === 'string' ? payload.alt.trim().slice(0, 140) : ''
    const order = Number.isInteger(payload.order) && Number(payload.order) >= 0 ? Number(payload.order) : index
    const createdAt = typeof payload.createdAt === 'string' && payload.createdAt.trim()
      ? payload.createdAt.trim()
      : new Date().toISOString()

    deduplicated.set(id, {
      id,
      url,
      storagePath,
      alt,
      order,
      active: payload.active !== false,
      createdAt,
    })
  }

  return Array.from(deduplicated.values())
    .sort((a, b) => a.order - b.order)
    .slice(0, 12)
    .map((item, index) => ({
      ...item,
      order: index,
    }))
}

function sanitizeFeaturedVideo(value: unknown): CampaignFeaturedVideoMedia | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Partial<CampaignFeaturedVideoMedia>
  const id = typeof payload.id === 'string' ? payload.id.trim().slice(0, 96) : ''
  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  if (!id || !/^https?:\/\//i.test(url)) {
    return null
  }

  const storagePath = typeof payload.storagePath === 'string' && payload.storagePath.trim()
    ? payload.storagePath.trim().slice(0, 260)
    : null
  const createdAt = typeof payload.createdAt === 'string' && payload.createdAt.trim()
    ? payload.createdAt.trim()
    : new Date().toISOString()

  return {
    id,
    url,
    storagePath,
    active: payload.active !== false,
    createdAt,
  }
}

function sanitizeCampaignMidias(value: unknown): CampaignMidias {
  const payload = value && typeof value === 'object'
    ? (value as CampaignMidias)
    : { heroCarousel: [], featuredVideo: null }
  return {
    heroCarousel: sanitizeHeroCarouselMediaItems(payload.heroCarousel),
    featuredVideo: sanitizeFeaturedVideo(payload.featuredVideo),
  }
}

export function buildCampaignSettingsInput(formState: CampaignFormState): CampaignValidationResult {
  const normalizedTitle = formState.title.trim() || DEFAULT_CAMPAIGN_TITLE
  const normalizedMainPrize = formState.mainPrize.trim() || DEFAULT_MAIN_PRIZE
  const normalizedSecondPrize = formState.secondPrize.trim() || DEFAULT_SECOND_PRIZE
  const normalizedBonusPrize = formState.bonusPrize.trim() || DEFAULT_BONUS_PRIZE
  const normalizedTotalNumbers = Number(formState.totalNumbersInput.replace(/[^0-9]/g, ''))
  const normalizedAdditionalPrizes = formState.additionalPrizes
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 20) ?? DEFAULT_ADDITIONAL_PRIZES
  const normalizedSupportWhatsappNumber = formState.supportWhatsappNumber.trim() || DEFAULT_SUPPORT_WHATSAPP_NUMBER
  const normalizedWhatsappContactMessage = formState.whatsappContactMessage.trim().slice(0, 500) || undefined
  const normalizedStartsAtTime = formState.startsAt.trim() ? formState.startsAtTime.trim() || undefined : undefined
  const normalizedEndsAtTime = formState.endsAt.trim() ? formState.endsAtTime.trim() || undefined : undefined
  const normalizedPriceText = formState.pricePerCotaInput.replace(',', '.').trim()
  const normalizedPrice = Number(normalizedPriceText)
  const minPurchaseQuantity = Number(formState.minPurchaseQuantityInput)

  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
    return {
      errorToastId: 'campaign-invalid-price',
      errorMessage: 'Informe um valor valido para a cota.',
      payload: null,
    }
  }

  if (!Number.isInteger(minPurchaseQuantity) || minPurchaseQuantity <= 0 || minPurchaseQuantity > 300) {
    return {
      errorToastId: 'campaign-invalid-min-purchase',
      errorMessage: 'Informe uma compra minima valida (1 a 300).',
      payload: null,
    }
  }

  if (!Number.isInteger(normalizedTotalNumbers) || normalizedTotalNumbers <= 0 || normalizedTotalNumbers > 50000000) {
    return {
      errorToastId: 'campaign-invalid-total-numbers',
      errorMessage: 'Informe um total de numeros valido (1 a 50.000.000).',
      payload: null,
    }
  }

  const startsAtDateTimeMs = parseCampaignDateTime(formState.startsAt.trim(), normalizedStartsAtTime, false)
  const endsAtDateTimeMs = parseCampaignDateTime(formState.endsAt.trim(), normalizedEndsAtTime, true)
  if (startsAtDateTimeMs !== null && endsAtDateTimeMs !== null && startsAtDateTimeMs > endsAtDateTimeMs) {
    return {
      errorToastId: 'campaign-invalid-date-range',
      errorMessage: 'A data/hora de inicio nao pode ser maior que a data/hora de fim.',
      payload: null,
    }
  }

  const autoStatus = resolveCampaignScheduleStatus({
    startsAt: formState.startsAt.trim() || null,
    startsAtTime: normalizedStartsAtTime || null,
    endsAt: formState.endsAt.trim() || null,
    endsAtTime: normalizedEndsAtTime || null,
  })

  return {
    errorToastId: null,
    errorMessage: null,
    payload: {
      title: normalizedTitle,
      pricePerCota: Number(normalizedPrice.toFixed(2)),
      minPurchaseQuantity: Math.max(1, Math.min(minPurchaseQuantity || DEFAULT_MIN_PURCHASE_QUANTITY, 300)),
      mainPrize: normalizedMainPrize,
      secondPrize: normalizedSecondPrize,
      bonusPrize: normalizedBonusPrize,
      totalNumbers: Math.max(1, normalizedTotalNumbers || DEFAULT_TOTAL_NUMBERS),
      additionalPrizes: normalizedAdditionalPrizes,
      supportWhatsappNumber: normalizedSupportWhatsappNumber,
      whatsappContactMessage: normalizedWhatsappContactMessage,
      status: autoStatus,
      startsAt: formState.startsAt.trim() ? formState.startsAt : null,
      startsAtTime: normalizedStartsAtTime,
      endsAt: formState.endsAt.trim() ? formState.endsAt : null,
      endsAtTime: normalizedEndsAtTime,
      coupons: formState.coupons,
      midias: sanitizeCampaignMidias(formState.midias),
    },
  }
}
