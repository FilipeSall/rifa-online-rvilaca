import {
  CAMPAIGN_PACK_QUANTITIES,
  DEFAULT_ADDITIONAL_PRIZES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_SUPPORT_WHATSAPP_NUMBER,
  DEFAULT_TOTAL_NUMBERS,
  buildDefaultCampaignPackPrices,
} from '../../../const/campaign'
import { MAX_QUANTITY } from '../../../const/purchaseNumbers'
import type {
  CampaignFeaturedPromotion,
  CampaignFeaturedVideoMedia,
  CampaignCoupon,
  CampaignCouponDiscountType,
  CampaignHeroCarouselMedia,
  CampaignMidias,
  CampaignPackPrice,
  UpsertCampaignSettingsInput,
} from '../../../types/campaign'
import { parseCampaignDateTime, resolveCampaignScheduleStatus } from '../../../utils/campaignSchedule'

export type CampaignFormState = {
  title: string
  pricePerCotaInput: string
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
  packPrices: CampaignPackPrice[]
  featuredPromotion: CampaignFeaturedPromotion | null
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

function sanitizePackPrices(value: unknown, unitPrice: number): CampaignPackPrice[] {
  const items = Array.isArray(value)
    ? value
    : []
  const normalized = items.slice(0, CAMPAIGN_PACK_QUANTITIES.length).map((rawItem, index) => {
    const item = rawItem && typeof rawItem === 'object' ? (rawItem as Partial<CampaignPackPrice>) : {}
    const parsed = Number(item.quantity)
    const fallbackQuantity = CAMPAIGN_PACK_QUANTITIES[index] ?? CAMPAIGN_PACK_QUANTITIES[0]
    const quantity = Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackQuantity
    return {
      quantity,
      price: Number((quantity * unitPrice).toFixed(2)),
      active: item.active !== false,
      mostPurchasedTag: item.mostPurchasedTag === true,
    }
  })

  if (normalized.length >= CAMPAIGN_PACK_QUANTITIES.length) {
    let hasMostPurchasedTag = false
    return normalized.map((item) => {
      if (!item.mostPurchasedTag) {
        return item
      }
      if (hasMostPurchasedTag) {
        return {
          ...item,
          mostPurchasedTag: false,
        }
      }

      hasMostPurchasedTag = true
      return item
    })
  }

  const used = new Set(normalized.map((item) => item.quantity))
  for (const fallbackQuantity of CAMPAIGN_PACK_QUANTITIES) {
    if (normalized.length >= CAMPAIGN_PACK_QUANTITIES.length) {
      break
    }
    if (used.has(fallbackQuantity)) {
      continue
    }
    normalized.push({
      quantity: fallbackQuantity,
      price: Number((fallbackQuantity * unitPrice).toFixed(2)),
      active: true,
      mostPurchasedTag: false,
    })
  }

  let hasMostPurchasedTag = false
  return normalized.map((item) => {
    if (!item.mostPurchasedTag) {
      return item
    }
    if (hasMostPurchasedTag) {
      return {
        ...item,
        mostPurchasedTag: false,
      }
    }

    hasMostPurchasedTag = true
    return item
  })
}

function sanitizePromotionDiscountType(value: unknown): CampaignCouponDiscountType {
  return value === 'fixed' ? 'fixed' : 'percent'
}

function sanitizeFeaturedPromotion(value: unknown): CampaignFeaturedPromotion | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const payload = value as Partial<CampaignFeaturedPromotion>
  const targetQuantity = Number(payload.targetQuantity)
  if (!Number.isInteger(targetQuantity) || targetQuantity <= 0 || targetQuantity > MAX_QUANTITY) {
    return null
  }

  const discountType = sanitizePromotionDiscountType(payload.discountType)
  const rawValue = Number(payload.discountValue)
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return null
  }

  const discountValue = Number((discountType === 'percent' ? Math.min(rawValue, 100) : rawValue).toFixed(2))

  return {
    active: payload.active === true,
    targetQuantity,
    discountType,
    discountValue,
    label: 'Mais compradas',
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

  if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
    return {
      errorToastId: 'campaign-invalid-price',
      errorMessage: 'Informe um valor valido para a cota.',
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
  if (formState.packPrices.length !== CAMPAIGN_PACK_QUANTITIES.length) {
    return {
      errorToastId: 'campaign-invalid-pack-count',
      errorMessage: `Configure exatamente ${CAMPAIGN_PACK_QUANTITIES.length} brackets de cotas.`,
      payload: null,
    }
  }
  const normalizedPackPrices = sanitizePackPrices(
    formState.packPrices,
    Number(normalizedPrice.toFixed(2)),
  )
  const packQuantities = normalizedPackPrices.map((item) => item.quantity)
  const hasInvalidPackQuantity = normalizedPackPrices.some(
    (item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > MAX_QUANTITY,
  )
  if (hasInvalidPackQuantity) {
    return {
      errorToastId: 'campaign-invalid-pack-quantity',
      errorMessage: `Cada bracket deve ter quantidade inteira entre 1 e ${MAX_QUANTITY}.`,
      payload: null,
    }
  }

  if (new Set(packQuantities).size !== packQuantities.length) {
    return {
      errorToastId: 'campaign-duplicated-pack-quantity',
      errorMessage: 'Os 8 brackets devem ter quantidades diferentes entre si.',
      payload: null,
    }
  }

  const normalizedFeaturedPromotion = sanitizeFeaturedPromotion(formState.featuredPromotion)

  return {
    errorToastId: null,
    errorMessage: null,
    payload: {
      title: normalizedTitle,
      pricePerCota: Number(normalizedPrice.toFixed(2)),
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
      packPrices: normalizedPackPrices.length > 0
        ? normalizedPackPrices
        : buildDefaultCampaignPackPrices(Number(normalizedPrice.toFixed(2))),
      featuredPromotion: normalizedFeaturedPromotion,
      coupons: formState.coupons,
      midias: sanitizeCampaignMidias(formState.midias),
    },
  }
}
