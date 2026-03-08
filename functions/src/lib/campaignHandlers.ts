import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_PACK_QUANTITIES,
  CAMPAIGN_DOC_ID,
  CAMPAIGN_STATUS_VALUES,
  DEFAULT_BONUS_PRIZE_QUANTITY,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_PRICE_PER_COTA,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_SUPPORT_WHATSAPP_NUMBER,
  DEFAULT_TOTAL_NUMBERS,
  DEFAULT_TOP_BUYERS_RANKING_LIMIT,
  MAX_PURCHASE_QUANTITY,
  type CampaignAdditionalPrize,
  type CampaignStatus,
} from './constants.js'
import { readCampaignNumberRange } from './numberStateStore.js'
import {
  asRecord,
  readMetricNumber,
  readTimestampMillis,
  requireActiveUid,
  sanitizeString,
} from './shared.js'
import { getCampaignDocCached, invalidateCampaignDocCache } from './campaignDocCache.js'
import {
  buildDefaultTopBuyersWeeklySchedule,
  readTopBuyersWeeklySchedule,
  type TopBuyersWeeklySchedule,
} from './topBuyersSchedule.js'
import {
  readCampaignAdditionalPrizes as readCampaignAdditionalPrizeList,
  readCampaignBonusPrizeConfig,
  sanitizePrizeQuantity,
} from './campaignPrizes.js'

type CampaignCouponDiscountType = 'percent' | 'fixed'

interface CampaignCoupon {
  code: string
  discountType: CampaignCouponDiscountType
  discountValue: number
  active: boolean
  createdAt: string
}

interface CampaignPackPrice {
  quantity: number
  price: number
  active: boolean
  mostPurchasedTag: boolean
}

interface CampaignFeaturedPromotion {
  active: boolean
  targetQuantity: number
  discountType: CampaignCouponDiscountType
  discountValue: number
  label: string
}

interface CampaignHeroCarouselMedia {
  id: string
  url: string
  storagePath: string | null
  alt: string
  order: number
  active: boolean
  createdAt: string
}

interface CampaignFeaturedVideoMedia {
  id: string
  url: string
  storagePath: string | null
  active: boolean
  createdAt: string
}

interface CampaignMidias {
  heroCarousel: CampaignHeroCarouselMedia[]
  featuredVideo: CampaignFeaturedVideoMedia | null
}

interface UpsertCampaignSettingsInput {
  title?: string
  pricePerCota?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
  bonusPrizeQuantity?: number
  totalNumbers?: number
  additionalPrizes?: CampaignAdditionalPrize[]
  supportWhatsappNumber?: string
  whatsappContactMessage?: string
  status?: CampaignStatus
  startsAt?: string | null
  startsAtTime?: string | null
  endsAt?: string | null
  endsAtTime?: string | null
  packPrices?: CampaignPackPrice[]
  featuredPromotions?: CampaignFeaturedPromotion[] | null
  featuredPromotion?: CampaignFeaturedPromotion | null
  coupons?: CampaignCoupon[]
  midias?: CampaignMidias
  topBuyersRankingLimit?: number
  topBuyersWeeklySchedule?: TopBuyersWeeklySchedule | null
}

interface UpsertCampaignSettingsOutput {
  campaignId: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  bonusPrizeQuantity: number
  totalNumbers: number
  additionalPrizes: CampaignAdditionalPrize[]
  supportWhatsappNumber: string
  whatsappContactMessage?: string
  status: CampaignStatus
  startsAt: string | null
  startsAtTime: string | null
  endsAt: string | null
  endsAtTime: string | null
  packPrices: CampaignPackPrice[]
  featuredPromotions: CampaignFeaturedPromotion[]
  coupons: CampaignCoupon[]
  midias: CampaignMidias
  topBuyersRankingLimit: number
  topBuyersWeeklySchedule: TopBuyersWeeklySchedule
}

interface DashboardSummaryOutput {
  totalRevenue: number
  paidOrders: number
  soldNumbers: number
  cancelledOrders: number
  avgTicket: number
  daily: Array<{
    date: string
    revenue: number
    paidOrders: number
    soldNumbers: number
  }>
}

interface PublicSalesSnapshotOutput {
  campaignId: string
  totalNumbers: number
  soldNumbers: number
  paidOrders: number
  soldPercentage: number
  updatedAtMs: number
}

interface PublicCampaignDeadlineOutput {
  campaignId: string
  endsAt: string | null
  endsAtTime: string | null
  timezone: 'America/Sao_Paulo'
  updatedAtMs: number
}

const CAMPAIGN_DEADLINE_TIMEZONE = 'America/Sao_Paulo' as const
const DASHBOARD_SUMMARY_CACHE_TTL_MS = 60 * 1000
const PUBLIC_SALES_SNAPSHOT_CACHE_TTL_MS = 60 * 1000

type InMemoryCacheEntry<T> = {
  payload: T
  expiresAtMs: number
}

let dashboardSummaryCache: InMemoryCacheEntry<DashboardSummaryOutput> | null = null
let publicSalesSnapshotCache: InMemoryCacheEntry<PublicSalesSnapshotOutput> | null = null
let salesSummaryBackfillInFlight: Promise<{ totalRevenue: number; paidOrders: number; soldNumbers: number } | null> | null = null
let salesSummaryBackfillDone = false

function readCachedEntry<T>(entry: InMemoryCacheEntry<T> | null, nowMs = Date.now()): T | null {
  if (!entry || entry.expiresAtMs <= nowMs) {
    return null
  }

  return entry.payload
}

function isMissingIndexError(error: unknown): boolean {
  const code = Number((error as { code?: unknown })?.code)
  const message = String((error as { message?: unknown })?.message || error).toLowerCase()

  return (
    code === 9
    || (message.includes('index') && (message.includes('requires') || message.includes('create')))
  )
}

async function countExpiredPendingOrders(db: Firestore, nowMs: number): Promise<number> {
  try {
    const pendingExpiredCountResult = await db.collection('orders')
      .where('status', '==', 'pending')
      .where('type', '==', 'deposit')
      .where('reservationExpiresAt', '<=', Timestamp.fromMillis(nowMs))
      .count()
      .get()

    return pendingExpiredCountResult.data().count
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error
    }

    logger.warn('countExpiredPendingOrders fallback to snapshot scan due to missing index', {
      error: String(error),
    })

    const pendingSnapshot = await db.collection('orders')
      .where('status', '==', 'pending')
      .where('type', '==', 'deposit')
      .select('reservationExpiresAt')
      .get()

    return pendingSnapshot.docs.reduce((total, orderDoc) => {
      const reservationExpiresAtMs = readTimestampMillis(orderDoc.get('reservationExpiresAt'))
      if (reservationExpiresAtMs !== null && reservationExpiresAtMs <= nowMs) {
        return total + 1
      }

      return total
    }, 0)
  }
}

async function backfillSalesSummaryOnce(db: Firestore): Promise<{ totalRevenue: number; paidOrders: number; soldNumbers: number } | null> {
  if (salesSummaryBackfillDone) {
    return null
  }

  if (salesSummaryBackfillInFlight) {
    return salesSummaryBackfillInFlight
  }

  salesSummaryBackfillInFlight = (async () => {
    const paidOrdersSnapshot = await db.collection('orders')
      .where('status', '==', 'paid')
      .where('type', '==', 'deposit')
      .where('campaignId', '==', CAMPAIGN_DOC_ID)
      .select('reservedNumbers', 'quantity', 'amount')
      .get()

    let soldNumbers = 0
    let totalRevenue = 0

    for (const orderDoc of paidOrdersSnapshot.docs) {
      const data = orderDoc.data()
      const amount = Number(data.amount)
      if (Number.isFinite(amount) && amount > 0) {
        totalRevenue += amount
      }

      if (Array.isArray(data.reservedNumbers)) {
        soldNumbers += data.reservedNumbers.filter((value) => Number.isInteger(value) && Number(value) > 0).length
        continue
      }

      const quantity = Number(data.quantity)
      if (Number.isInteger(quantity) && quantity > 0) {
        soldNumbers += quantity
      }
    }

    const backfill = {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      paidOrders: paidOrdersSnapshot.size,
      soldNumbers,
    }

    await db.collection('metrics').doc('sales_summary').set({
      totalRevenue: backfill.totalRevenue,
      paidOrders: backfill.paidOrders,
      soldNumbers: backfill.soldNumbers,
      updatedAt: FieldValue.serverTimestamp(),
      backfilledAt: FieldValue.serverTimestamp(),
      backfilledBy: 'getPublicSalesSnapshot',
    }, { merge: true })

    salesSummaryBackfillDone = true
    logger.warn('sales_summary backfilled from orders', {
      paidOrders: backfill.paidOrders,
      soldNumbers: backfill.soldNumbers,
      totalRevenue: backfill.totalRevenue,
    })

    return backfill
  })()
    .catch((error) => {
      logger.error('sales_summary backfill failed', {
        error: String(error),
      })
      return null
    })
    .finally(() => {
      salesSummaryBackfillInFlight = null
    })

  return salesSummaryBackfillInFlight
}

function sanitizeCampaignPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpsError('invalid-argument', 'pricePerCota deve ser um numero maior que zero.')
  }

  return Number(numeric.toFixed(2))
}

function buildDefaultPackPrices(unitPrice: number): CampaignPackPrice[] {
  return CAMPAIGN_PACK_QUANTITIES.map((quantity) => ({
    quantity,
    price: Number((quantity * unitPrice).toFixed(2)),
    active: true,
    mostPurchasedTag: quantity === 100,
  }))
}

function buildDefaultFeaturedPromotions(): CampaignFeaturedPromotion[] {
  return [
    {
      active: true,
      targetQuantity: 500,
      discountType: 'percent',
      discountValue: 5,
      label: 'Mais compradas',
    },
    {
      active: true,
      targetQuantity: 1000,
      discountType: 'percent',
      discountValue: 10,
      label: 'Mais compradas',
    },
  ]
}

function sanitizeCampaignTitle(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'title nao pode ser vazio.')
  }

  return normalized.slice(0, 120)
}

function sanitizeCampaignPrize(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', `${fieldName} nao pode ser vazio.`)
  }

  return normalized.slice(0, 160)
}

function sanitizeBonusPrizeQuantity(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return sanitizePrizeQuantity(value, DEFAULT_BONUS_PRIZE_QUANTITY)
}

function sanitizeTotalNumbers(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 50_000_000) {
    throw new HttpsError('invalid-argument', 'totalNumbers deve ser inteiro entre 1 e 50.000.000.')
  }

  return parsed
}

function sanitizeCampaignAdditionalPrizes(value: unknown): CampaignAdditionalPrize[] | null {
  if (value === undefined) {
    return null
  }

  const items = Array.isArray(value) ? value : []
  return items
    .map((item) => {
      if (typeof item === 'string') {
        const label = item.trim().slice(0, 160)
        if (!label) {
          return null
        }

        return {
          label,
          quantity: 1,
        } satisfies CampaignAdditionalPrize
      }

      if (!item || typeof item !== 'object') {
        return null
      }

      const payload = item as Record<string, unknown>
      const label = sanitizeString(payload.label).slice(0, 160)
      if (!label) {
        return null
      }

      return {
        label,
        quantity: sanitizePrizeQuantity(payload.quantity, 1),
      } satisfies CampaignAdditionalPrize
    })
    .filter((item): item is CampaignAdditionalPrize => Boolean(item))
    .slice(0, 20)
}

function sanitizeSupportWhatsappNumber(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'supportWhatsappNumber nao pode ser vazio.')
  }

  const cleaned = normalized.replace(/[^\d+()\-\s]/g, '').slice(0, 32).trim()
  if (!cleaned) {
    throw new HttpsError('invalid-argument', 'supportWhatsappNumber invalido.')
  }

  return cleaned
}

function sanitizeCampaignStatus(value: unknown): CampaignStatus | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const normalized = sanitizeString(value).toLowerCase()
  if (!CAMPAIGN_STATUS_VALUES.includes(normalized as CampaignStatus)) {
    throw new HttpsError('invalid-argument', 'status de campanha invalido.')
  }

  return normalized as CampaignStatus
}

function sanitizeCouponCode(value: unknown): string {
  const normalized = sanitizeString(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '')
  return normalized.slice(0, 24)
}

function sanitizeCouponDiscountType(value: unknown): CampaignCouponDiscountType {
  return value === 'fixed' ? 'fixed' : 'percent'
}

function sanitizeCouponDiscountValue(value: unknown, discountType: CampaignCouponDiscountType): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpsError('invalid-argument', 'Cupom com discountValue invalido.')
  }

  if (discountType === 'percent') {
    if (parsed > 100) {
      throw new HttpsError('invalid-argument', 'Cupom percentual nao pode exceder 100%.')
    }
    return Number(parsed.toFixed(2))
  }

  return Number(parsed.toFixed(2))
}

function sanitizeCouponCreatedAt(value: unknown) {
  const normalized = sanitizeString(value)
  return normalized || new Date().toISOString()
}

function sanitizeCoupons(value: unknown): CampaignCoupon[] | null {
  if (value === undefined) {
    return null
  }

  if (value === null) {
    return []
  }

  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : null
  if (!items) {
    throw new HttpsError('invalid-argument', 'coupons deve ser uma lista.')
  }

  const deduplicated = new Map<string, CampaignCoupon>()

  for (const rawCoupon of items) {
    const coupon = asRecord(rawCoupon)
    const code = sanitizeCouponCode(coupon.code)
    const discountType = sanitizeCouponDiscountType(coupon.discountType)
    const discountValue = sanitizeCouponDiscountValue(coupon.discountValue, discountType)
    const active = coupon.active !== false
    const createdAt = sanitizeCouponCreatedAt(coupon.createdAt)

    if (!code) {
      continue
    }

    deduplicated.set(code, {
      code,
      discountType,
      discountValue,
      active,
      createdAt,
    })
  }

  return Array.from(deduplicated.values()).slice(0, 100)
}

function sanitizeCampaignPackPrices(value: unknown, unitPriceFallback: number): CampaignPackPrice[] | null {
  if (value === undefined) {
    return null
  }

  if (value === null) {
    return buildDefaultPackPrices(unitPriceFallback)
  }

  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : null
  if (!items) {
    throw new HttpsError('invalid-argument', 'packPrices deve ser uma lista.')
  }

  const normalized: CampaignPackPrice[] = []
  const usedQuantities = new Set<number>()

  for (const rawItem of items) {
    const item = asRecord(rawItem)
    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_PURCHASE_QUANTITY) {
      throw new HttpsError('invalid-argument', `packPrices.quantity deve ser inteiro entre 1 e ${MAX_PURCHASE_QUANTITY}.`)
    }
    if (usedQuantities.has(quantity)) {
      throw new HttpsError('invalid-argument', 'packPrices nao pode conter quantidades repetidas.')
    }

    normalized.push({
      quantity,
      price: Number((quantity * unitPriceFallback).toFixed(2)),
      active: item.active !== false,
      mostPurchasedTag: item.mostPurchasedTag === true,
    })
    usedQuantities.add(quantity)
  }

  if (normalized.length !== CAMPAIGN_PACK_QUANTITIES.length) {
    throw new HttpsError('invalid-argument', `packPrices deve conter exatamente ${CAMPAIGN_PACK_QUANTITIES.length} brackets.`)
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

function sanitizeCampaignFeaturedPromotion(value: unknown): CampaignFeaturedPromotion | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === '') {
    return null
  }

  const payload = asRecord(value)
  const targetQuantity = Number(payload.targetQuantity)
  if (!Number.isInteger(targetQuantity) || targetQuantity <= 0 || targetQuantity > MAX_PURCHASE_QUANTITY) {
    throw new HttpsError('invalid-argument', 'featuredPromotion.targetQuantity invalido.')
  }

  const discountType = sanitizeCouponDiscountType(payload.discountType)
  const rawDiscountValue = Number(payload.discountValue)
  if (!Number.isFinite(rawDiscountValue) || rawDiscountValue < 0) {
    throw new HttpsError('invalid-argument', 'featuredPromotion.discountValue invalido.')
  }

  if (discountType === 'percent' && rawDiscountValue > 100) {
    throw new HttpsError('invalid-argument', 'featuredPromotion percentual nao pode exceder 100%.')
  }

  return {
    active: payload.active === true,
    targetQuantity,
    discountType,
    discountValue: Number(rawDiscountValue.toFixed(2)),
    label: 'Mais compradas',
  }
}

function sanitizeCampaignFeaturedPromotions(
  value: unknown,
  fallbackValue: unknown,
): CampaignFeaturedPromotion[] | null | undefined {
  if (value === undefined) {
    if (fallbackValue !== undefined) {
      const fallback = sanitizeCampaignFeaturedPromotion(fallbackValue)
      if (fallback === undefined) {
        return undefined
      }
      if (fallback === null) {
        return []
      }
      const defaults = buildDefaultFeaturedPromotions()
      const hasSame = (item: CampaignFeaturedPromotion) =>
        item.targetQuantity === fallback.targetQuantity
        && item.discountType === fallback.discountType
        && item.discountValue === fallback.discountValue
      return [
        fallback,
        ...defaults.filter((item) => !hasSame(item)),
      ]
    }

    return undefined
  }

  if (value === null || value === '') {
    return []
  }

  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : null
  if (!items) {
    throw new HttpsError('invalid-argument', 'featuredPromotions deve ser uma lista.')
  }

  const normalized = items
    .map((item) => sanitizeCampaignFeaturedPromotion(item))
    .filter((item): item is CampaignFeaturedPromotion => Boolean(item))

  return normalized
}

function sanitizeTopBuyersWeeklySchedule(
  value: unknown,
): TopBuyersWeeklySchedule | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === '') {
    return buildDefaultTopBuyersWeeklySchedule()
  }

  const payload = asRecord(value)
  return readTopBuyersWeeklySchedule({
    topBuyersWeeklySchedule: payload,
  } as DocumentData)
}

function sanitizeTopBuyersRankingLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpsError('invalid-argument', 'topBuyersRankingLimit deve ser inteiro maior que zero.')
  }

  return Math.min(parsed, DEFAULT_TOP_BUYERS_RANKING_LIMIT)
}

function getDefaultCampaignMidias(): CampaignMidias {
  return {
    heroCarousel: [],
    featuredVideo: null,
  }
}

function sanitizeHeroCarouselMediaId(value: unknown): string {
  const normalized = sanitizeString(value).replace(/[^a-zA-Z0-9_-]/g, '')
  return normalized.slice(0, 96)
}

function sanitizeHeroCarouselMediaUrl(value: unknown): string {
  const normalized = sanitizeString(value)
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    return ''
  }

  return normalized
}

function sanitizeHeroCarouselMediaStoragePath(value: unknown): string | null {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  return normalized.slice(0, 260)
}

function sanitizeHeroCarouselMediaAlt(value: unknown): string {
  const normalized = sanitizeString(value)
  return normalized.slice(0, 140)
}

function sanitizeHeroCarouselMediaOrder(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

function sanitizeHeroCarouselMediaCreatedAt(value: unknown): string {
  const normalized = sanitizeString(value)
  return normalized || new Date().toISOString()
}

function sanitizeHeroCarouselMediaItems(value: unknown): CampaignHeroCarouselMedia[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : null

  if (!items) {
    throw new HttpsError('invalid-argument', 'midias.heroCarousel deve ser uma lista.')
  }

  const deduplicated = new Map<string, CampaignHeroCarouselMedia>()

  for (let index = 0; index < items.length; index += 1) {
    const rawItem = items[index]
    const item = asRecord(rawItem)
    const id = sanitizeHeroCarouselMediaId(item.id)
    const url = sanitizeHeroCarouselMediaUrl(item.url)

    if (!id || !url) {
      continue
    }

    deduplicated.set(id, {
      id,
      url,
      storagePath: sanitizeHeroCarouselMediaStoragePath(item.storagePath),
      alt: sanitizeHeroCarouselMediaAlt(item.alt),
      order: sanitizeHeroCarouselMediaOrder(item.order, index),
      active: item.active !== false,
      createdAt: sanitizeHeroCarouselMediaCreatedAt(item.createdAt),
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

function sanitizeFeaturedVideoId(value: unknown): string {
  const normalized = sanitizeString(value).replace(/[^a-zA-Z0-9_-]/g, '')
  return normalized.slice(0, 96)
}

function sanitizeFeaturedVideoUrl(value: unknown): string {
  const normalized = sanitizeString(value)
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    return ''
  }

  return normalized
}

function sanitizeFeaturedVideoStoragePath(value: unknown): string | null {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  return normalized.slice(0, 260)
}

function sanitizeFeaturedVideoCreatedAt(value: unknown): string {
  const normalized = sanitizeString(value)
  return normalized || new Date().toISOString()
}

function sanitizeFeaturedVideo(value: unknown): CampaignFeaturedVideoMedia | null {
  if (value === null || value === undefined) {
    return null
  }

  const payload = asRecord(value)
  const id = sanitizeFeaturedVideoId(payload.id)
  const url = sanitizeFeaturedVideoUrl(payload.url)
  if (!id || !url) {
    return null
  }

  return {
    id,
    url,
    storagePath: sanitizeFeaturedVideoStoragePath(payload.storagePath),
    active: payload.active !== false,
    createdAt: sanitizeFeaturedVideoCreatedAt(payload.createdAt),
  }
}

function sanitizeCampaignMidias(value: unknown): CampaignMidias | null {
  if (value === undefined) {
    return null
  }

  if (value === null) {
    return getDefaultCampaignMidias()
  }

  const payload = asRecord(value)
  return {
    heroCarousel: sanitizeHeroCarouselMediaItems(payload.heroCarousel ?? []),
    featuredVideo: sanitizeFeaturedVideo(payload.featuredVideo),
  }
}

function sanitizeCampaignDate(value: unknown, fieldName: string): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === '') {
    return null
  }

  const normalized = sanitizeString(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpsError('invalid-argument', `${fieldName} deve seguir o formato YYYY-MM-DD.`)
  }

  const parsedDate = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpsError('invalid-argument', `${fieldName} invalido.`)
  }

  return normalized
}

function sanitizeCampaignTime(value: unknown, fieldName: string): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === '') {
    return null
  }

  const normalized = sanitizeString(value)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw new HttpsError('invalid-argument', `${fieldName} deve seguir o formato HH:mm.`)
  }

  return normalized
}

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem alterar a campanha.')
  }
}

function readCampaignTitle(data: DocumentData | undefined): string {
  const fromTitle = sanitizeString(data?.title)
  if (fromTitle) {
    return fromTitle
  }

  const fromName = sanitizeString(data?.name)
  if (fromName) {
    return fromName
  }

  return DEFAULT_CAMPAIGN_TITLE
}

export function readCampaignPricePerCota(data: DocumentData | undefined): number {
  const numeric = Number(data?.pricePerCota)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_PRICE_PER_COTA
  }

  return Number(numeric.toFixed(2))
}

export function readCampaignCoupons(data: DocumentData | undefined): CampaignCoupon[] {
  try {
    const sanitized = sanitizeCoupons(data?.coupons)
    return sanitized || []
  } catch (error) {
    logger.warn('readCampaignCoupons fallback to empty list due to malformed data', {
      error: String(error),
    })
    return []
  }
}

export function readCampaignPackPrices(data: DocumentData | undefined): CampaignPackPrice[] {
  try {
    const unitPrice = readCampaignPricePerCota(data)
    const sanitized = sanitizeCampaignPackPrices(data?.packPrices, unitPrice)
    return sanitized || buildDefaultPackPrices(unitPrice)
  } catch (error) {
    logger.warn('readCampaignPackPrices fallback to defaults due to malformed data', {
      error: String(error),
    })
    return buildDefaultPackPrices(readCampaignPricePerCota(data))
  }
}

export function readCampaignPurchaseQuantityLimits(data: DocumentData | undefined): { min: number; max: number } {
  const activeQuantities = readCampaignPackPrices(data)
    .filter((item) => item.active)
    .map((item) => item.quantity)
    .filter((item, index, list) => Number.isInteger(item) && item > 0 && list.indexOf(item) === index)
    .sort((left, right) => left - right)

  const fallbackQuantities = [...CAMPAIGN_PACK_QUANTITIES].sort((left, right) => left - right)
  const quantities = activeQuantities.length > 0 ? activeQuantities : fallbackQuantities
  const min = quantities[0] ?? CAMPAIGN_PACK_QUANTITIES[0]

  return {
    min,
    max: Math.max(min, MAX_PURCHASE_QUANTITY),
  }
}

export function readCampaignFeaturedPromotions(data: DocumentData | undefined): CampaignFeaturedPromotion[] {
  try {
    const sanitized = sanitizeCampaignFeaturedPromotions(data?.featuredPromotions, data?.featuredPromotion)
    if (sanitized === undefined) {
      return buildDefaultFeaturedPromotions()
    }
    return sanitized ?? []
  } catch (error) {
    logger.warn('readCampaignFeaturedPromotions fallback to defaults due to malformed data', {
      error: String(error),
    })
    return buildDefaultFeaturedPromotions()
  }
}

function readCampaignMidias(data: DocumentData | undefined): CampaignMidias {
  try {
    const sanitized = sanitizeCampaignMidias(data?.midias)
    return sanitized || getDefaultCampaignMidias()
  } catch (error) {
    logger.warn('readCampaignMidias fallback to empty list due to malformed data', {
      error: String(error),
    })
    return getDefaultCampaignMidias()
  }
}

function readCampaignMainPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.mainPrize)
  return value || DEFAULT_MAIN_PRIZE
}

function readCampaignSecondPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.secondPrize)
  return value || DEFAULT_SECOND_PRIZE
}

function readCampaignBonusPrize(data: DocumentData | undefined): string {
  return readCampaignBonusPrizeConfig(data).label || DEFAULT_BONUS_PRIZE
}

function readCampaignBonusPrizeQuantity(data: DocumentData | undefined): number {
  return readCampaignBonusPrizeConfig(data).quantity || DEFAULT_BONUS_PRIZE_QUANTITY
}

function readCampaignTotalNumbers(data: DocumentData | undefined): number {
  return readCampaignNumberRange(data, CAMPAIGN_DOC_ID).total || DEFAULT_TOTAL_NUMBERS
}

function readCampaignAdditionalPrizes(data: DocumentData | undefined): CampaignAdditionalPrize[] {
  return readCampaignAdditionalPrizeList(data)
}

function readCampaignSupportWhatsappNumber(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.supportWhatsappNumber)
  return value || DEFAULT_SUPPORT_WHATSAPP_NUMBER
}

function readCampaignWhatsappContactMessage(data: DocumentData | undefined): string | undefined {
  const value = sanitizeString(data?.whatsappContactMessage)
  return value || undefined
}

function readCampaignStatus(data: DocumentData | undefined): CampaignStatus {
  const value = sanitizeString(data?.status).toLowerCase()
  if (CAMPAIGN_STATUS_VALUES.includes(value as CampaignStatus)) {
    return value as CampaignStatus
  }

  return DEFAULT_CAMPAIGN_STATUS
}

function readCampaignTopBuyersRankingLimit(data: DocumentData | undefined): number {
  const parsed = Number(data?.topBuyersRankingLimit)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TOP_BUYERS_RANKING_LIMIT
  }

  return Math.min(parsed, DEFAULT_TOP_BUYERS_RANKING_LIMIT)
}

function readCampaignDate(data: DocumentData | undefined, fieldName: 'startsAt' | 'endsAt'): string | null {
  const value = sanitizeString(data?.[fieldName])
  if (!value) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  return value
}

function readCampaignTime(data: DocumentData | undefined, fieldName: 'startsAtTime' | 'endsAtTime'): string | null {
  const value = sanitizeString(data?.[fieldName])
  if (!value) {
    return null
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null
  }

  return value
}

function resolveCampaignDateTime(
  dateValue: string | null,
  timeValue: string | null,
  useEndOfDayFallback: boolean,
): number | null {
  if (!dateValue) {
    return null
  }

  const effectiveTime = timeValue || (useEndOfDayFallback ? '23:59' : '00:00')
  const parsed = new Date(`${dateValue}T${effectiveTime}:00`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.getTime()
}

export function createUpsertCampaignSettingsHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)

    try {
      const payload = asRecord(request.data) as Partial<UpsertCampaignSettingsInput>
      const nextTitle = sanitizeCampaignTitle(payload.title)
      const nextPricePerCota = sanitizeCampaignPrice(payload.pricePerCota)
      const nextMainPrize = sanitizeCampaignPrize(payload.mainPrize, 'mainPrize')
      const nextSecondPrize = sanitizeCampaignPrize(payload.secondPrize, 'secondPrize')
      const nextBonusPrize = sanitizeCampaignPrize(payload.bonusPrize, 'bonusPrize')
      const nextBonusPrizeQuantity = sanitizeBonusPrizeQuantity(payload.bonusPrizeQuantity)
      const nextTotalNumbers = sanitizeTotalNumbers(payload.totalNumbers)
      const nextAdditionalPrizes = sanitizeCampaignAdditionalPrizes(payload.additionalPrizes)
      const nextSupportWhatsappNumber = sanitizeSupportWhatsappNumber(payload.supportWhatsappNumber)
      const nextWhatsappContactMessage = sanitizeString(payload.whatsappContactMessage)?.slice(0, 500) || null
      const nextStatus = sanitizeCampaignStatus(payload.status)
      const nextStartsAt = sanitizeCampaignDate(payload.startsAt, 'startsAt')
      const nextStartsAtTime = sanitizeCampaignTime(payload.startsAtTime, 'startsAtTime')
      const nextEndsAt = sanitizeCampaignDate(payload.endsAt, 'endsAt')
      const nextEndsAtTime = sanitizeCampaignTime(payload.endsAtTime, 'endsAtTime')
      const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
      const campaignSnapshot = await campaignRef.get()
      const currentData = campaignSnapshot.exists ? (campaignSnapshot.data() as DocumentData | undefined) : undefined
      const currentPricePerCota = readCampaignPricePerCota(currentData)
      const priceForPackFallback = nextPricePerCota ?? currentPricePerCota
      const nextPackPrices = sanitizeCampaignPackPrices(payload.packPrices, priceForPackFallback)
      const nextFeaturedPromotions = sanitizeCampaignFeaturedPromotions(
        payload.featuredPromotions,
        payload.featuredPromotion,
      )
      const nextCoupons = sanitizeCoupons(payload.coupons)
      const nextMidias = sanitizeCampaignMidias(payload.midias)
      const nextTopBuyersRankingLimit = sanitizeTopBuyersRankingLimit(payload.topBuyersRankingLimit)
      const nextTopBuyersWeeklySchedule = sanitizeTopBuyersWeeklySchedule(payload.topBuyersWeeklySchedule)

      const updateData: DocumentData = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
        minPurchaseQuantity: FieldValue.delete(),
      }

      if (nextTitle !== null) {
        updateData.title = nextTitle
        updateData.name = nextTitle
      }

      if (nextPricePerCota !== null) {
        updateData.pricePerCota = nextPricePerCota
      }

      if (nextMainPrize !== null) {
        updateData.mainPrize = nextMainPrize
      }

      if (nextSecondPrize !== null) {
        updateData.secondPrize = nextSecondPrize
      }

      if (nextBonusPrize !== null) {
        updateData.bonusPrize = nextBonusPrize
      }

      if (nextBonusPrizeQuantity !== null) {
        updateData.bonusPrizeQuantity = nextBonusPrizeQuantity
      }

      if (nextTotalNumbers !== null) {
        updateData.totalNumbers = nextTotalNumbers
      }

      if (nextAdditionalPrizes !== null) {
        updateData.additionalPrizes = nextAdditionalPrizes
      }

      if (nextSupportWhatsappNumber !== null) {
        updateData.supportWhatsappNumber = nextSupportWhatsappNumber
      }

      if (nextWhatsappContactMessage !== null) {
        updateData.whatsappContactMessage = nextWhatsappContactMessage
      }

      if (nextStatus !== null) {
        updateData.status = nextStatus
      }

      if (nextStartsAt !== undefined) {
        updateData.startsAt = nextStartsAt
      }

      if (nextStartsAtTime !== undefined) {
        updateData.startsAtTime = nextStartsAtTime
      }

      if (nextEndsAt !== undefined) {
        updateData.endsAt = nextEndsAt
      }

      if (nextEndsAtTime !== undefined) {
        updateData.endsAtTime = nextEndsAtTime
      }

      if (nextPackPrices !== null) {
        updateData.packPrices = nextPackPrices
      }

      if (nextFeaturedPromotions !== undefined) {
        updateData.featuredPromotions = nextFeaturedPromotions
      }

      if (nextCoupons !== null) {
        updateData.coupons = nextCoupons
      }

      if (nextMidias !== null) {
        updateData.midias = nextMidias
      }

      if (nextTopBuyersRankingLimit !== null) {
        updateData.topBuyersRankingLimit = nextTopBuyersRankingLimit
      }

      if (nextTopBuyersWeeklySchedule !== undefined) {
        updateData.topBuyersWeeklySchedule = nextTopBuyersWeeklySchedule
      }

      const effectiveStartsAt =
        nextStartsAt !== undefined ? nextStartsAt : readCampaignDate(currentData, 'startsAt')
      const effectiveStartsAtTime =
        nextStartsAtTime !== undefined ? nextStartsAtTime : readCampaignTime(currentData, 'startsAtTime')
      const effectiveEndsAt =
        nextEndsAt !== undefined ? nextEndsAt : readCampaignDate(currentData, 'endsAt')
      const effectiveEndsAtTime =
        nextEndsAtTime !== undefined ? nextEndsAtTime : readCampaignTime(currentData, 'endsAtTime')
      const startsAtMs = resolveCampaignDateTime(effectiveStartsAt, effectiveStartsAtTime, false)
      const endsAtMs = resolveCampaignDateTime(effectiveEndsAt, effectiveEndsAtTime, true)
      if (startsAtMs !== null && endsAtMs !== null && startsAtMs > endsAtMs) {
        throw new HttpsError('invalid-argument', 'startsAt nao pode ser maior que endsAt considerando hora.')
      }

      if (!campaignSnapshot.exists) {
        if (!updateData.title) {
          updateData.title = DEFAULT_CAMPAIGN_TITLE
          updateData.name = DEFAULT_CAMPAIGN_TITLE
        }

        if (!updateData.pricePerCota) {
          updateData.pricePerCota = DEFAULT_PRICE_PER_COTA
        }

        if (!updateData.mainPrize) {
          updateData.mainPrize = DEFAULT_MAIN_PRIZE
        }

        if (!updateData.secondPrize) {
          updateData.secondPrize = DEFAULT_SECOND_PRIZE
        }

        if (!updateData.bonusPrize) {
          updateData.bonusPrize = DEFAULT_BONUS_PRIZE
        }

        if (!updateData.bonusPrizeQuantity) {
          updateData.bonusPrizeQuantity = DEFAULT_BONUS_PRIZE_QUANTITY
        }

        if (!updateData.totalNumbers) {
          updateData.totalNumbers = DEFAULT_TOTAL_NUMBERS
        }

        if (!updateData.supportWhatsappNumber) {
          updateData.supportWhatsappNumber = DEFAULT_SUPPORT_WHATSAPP_NUMBER
        }

        if (!updateData.status) {
          updateData.status = DEFAULT_CAMPAIGN_STATUS
        }

        if (!updateData.coupons) {
          updateData.coupons = []
        }

        if (!updateData.packPrices) {
          updateData.packPrices = buildDefaultPackPrices(readCampaignPricePerCota(updateData))
        }

        if (updateData.featuredPromotions === undefined) {
          updateData.featuredPromotions = buildDefaultFeaturedPromotions()
        }

        if (!updateData.midias) {
          updateData.midias = getDefaultCampaignMidias()
        }

        if (!updateData.topBuyersWeeklySchedule) {
          updateData.topBuyersWeeklySchedule = buildDefaultTopBuyersWeeklySchedule()
        }

        if (!updateData.topBuyersRankingLimit) {
          updateData.topBuyersRankingLimit = DEFAULT_TOP_BUYERS_RANKING_LIMIT
        }

        updateData.createdAt = FieldValue.serverTimestamp()
      } else if (
        nextTitle === null &&
        nextPricePerCota === null &&
        nextMainPrize === null &&
        nextSecondPrize === null &&
        nextBonusPrize === null &&
        nextBonusPrizeQuantity === null &&
        nextTotalNumbers === null &&
        nextAdditionalPrizes === null &&
        nextSupportWhatsappNumber === null &&
        nextStatus === null &&
        nextStartsAt === undefined &&
        nextStartsAtTime === undefined &&
        nextEndsAt === undefined &&
        nextEndsAtTime === undefined &&
        nextPackPrices === null &&
        nextFeaturedPromotions === undefined &&
        nextCoupons === null &&
        nextMidias === null &&
        nextTopBuyersRankingLimit === null &&
        nextTopBuyersWeeklySchedule === undefined
      ) {
        throw new HttpsError('invalid-argument', 'Nenhum dado valido para atualizar campanha.')
      }

      logger.info('upsertCampaignSettings started', {
        uid,
        hasNewCoupons: Array.isArray(nextCoupons),
        nextCouponsCount: Array.isArray(nextCoupons) ? nextCoupons.length : null,
        hasNewPackPrices: Array.isArray(nextPackPrices),
        nextPackPricesCount: Array.isArray(nextPackPrices) ? nextPackPrices.length : null,
        hasNewFeaturedPromotions: nextFeaturedPromotions !== undefined,
        hasNewMidias: nextMidias !== null,
        nextHeroCarouselCount: nextMidias ? nextMidias.heroCarousel.length : null,
        hasFeaturedVideo: Boolean(nextMidias?.featuredVideo?.url),
        hasTopBuyersRankingLimit: nextTopBuyersRankingLimit !== null,
        hasTopBuyersWeeklySchedule: nextTopBuyersWeeklySchedule !== undefined,
      })

      await campaignRef.set(updateData, { merge: true })
      invalidateCampaignDocCache(CAMPAIGN_DOC_ID)
      dashboardSummaryCache = null
      publicSalesSnapshotCache = null

      const updatedCampaign = await campaignRef.get()
      const campaignData = (updatedCampaign.exists ? updatedCampaign.data() : undefined) as DocumentData | undefined

      const output = {
        campaignId: CAMPAIGN_DOC_ID,
        title: readCampaignTitle(campaignData),
        pricePerCota: readCampaignPricePerCota(campaignData),
        mainPrize: readCampaignMainPrize(campaignData),
        secondPrize: readCampaignSecondPrize(campaignData),
        bonusPrize: readCampaignBonusPrize(campaignData),
        bonusPrizeQuantity: readCampaignBonusPrizeQuantity(campaignData),
        totalNumbers: readCampaignTotalNumbers(campaignData),
        additionalPrizes: readCampaignAdditionalPrizes(campaignData),
        supportWhatsappNumber: readCampaignSupportWhatsappNumber(campaignData),
        whatsappContactMessage: readCampaignWhatsappContactMessage(campaignData),
        status: readCampaignStatus(campaignData),
        startsAt: readCampaignDate(campaignData, 'startsAt'),
        startsAtTime: readCampaignTime(campaignData, 'startsAtTime'),
        endsAt: readCampaignDate(campaignData, 'endsAt'),
        endsAtTime: readCampaignTime(campaignData, 'endsAtTime'),
        packPrices: readCampaignPackPrices(campaignData),
        featuredPromotions: readCampaignFeaturedPromotions(campaignData),
        coupons: readCampaignCoupons(campaignData),
        midias: readCampaignMidias(campaignData),
        topBuyersRankingLimit: readCampaignTopBuyersRankingLimit(campaignData),
        topBuyersWeeklySchedule: readTopBuyersWeeklySchedule(campaignData),
      } satisfies UpsertCampaignSettingsOutput

      logger.info('upsertCampaignSettings succeeded', {
        uid,
        campaignId: CAMPAIGN_DOC_ID,
        packPricesCount: output.packPrices.length,
        hasFeaturedPromotion: output.featuredPromotions.some((promotion) => promotion.active),
        couponsCount: output.coupons.length,
        heroCarouselCount: output.midias.heroCarousel.length,
        hasFeaturedVideo: Boolean(output.midias.featuredVideo?.url),
      })

      return output
    } catch (error) {
      logger.error('upsertCampaignSettings failed', {
        uid,
        error: String(error),
      })

      if (error instanceof HttpsError) {
        throw error
      }

      throw new HttpsError('internal', 'Falha ao salvar configuracoes da campanha.')
    }
  }
}

export function createGetDashboardSummaryHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    const uid = requireActiveUid(request.auth)
    await assertAdminRole(db, uid)
    const nowMs = Date.now()
    const cached = readCachedEntry(dashboardSummaryCache, nowMs)
    if (cached) {
      return cached
    }

    const [summarySnapshot, dailySnapshot, failedCountResult, expiredPendingOrders] = await Promise.all([
      db.collection('metrics').doc('sales_summary').get(),
      db
        .collection('salesMetricsDaily')
        .orderBy('date', 'desc')
        .limit(14)
        .get(),
      db.collection('orders')
        .where('status', '==', 'failed')
        .where('type', '==', 'deposit')
        .count()
        .get(),
      countExpiredPendingOrders(db, nowMs),
    ])

    const backfilledSummary = !summarySnapshot.exists
      ? await backfillSalesSummaryOnce(db)
      : null

    const totalRevenue = backfilledSummary
      ? backfilledSummary.totalRevenue
      : readMetricNumber(summarySnapshot.get('totalRevenue'))
    const paidOrders = backfilledSummary
      ? backfilledSummary.paidOrders
      : Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('paidOrders'))))
    const soldNumbers = backfilledSummary
      ? backfilledSummary.soldNumbers
      : Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('soldNumbers'))))
    const avgTicket = paidOrders > 0 ? Number((totalRevenue / paidOrders).toFixed(2)) : 0
    const failedOrders = failedCountResult.data().count
    const cancelledOrders = failedOrders + expiredPendingOrders
    const daily = dailySnapshot.docs.map((dailyDoc) => ({
      date: sanitizeString(dailyDoc.get('date')) || dailyDoc.id,
      revenue: readMetricNumber(dailyDoc.get('revenue')),
      paidOrders: Math.max(0, Math.floor(readMetricNumber(dailyDoc.get('paidOrders')))),
      soldNumbers: Math.max(0, Math.floor(readMetricNumber(dailyDoc.get('soldNumbers')))),
    }))

    const output = {
      totalRevenue,
      paidOrders,
      soldNumbers,
      cancelledOrders,
      avgTicket,
      daily,
    } satisfies DashboardSummaryOutput

    dashboardSummaryCache = {
      payload: output,
      expiresAtMs: nowMs + DASHBOARD_SUMMARY_CACHE_TTL_MS,
    }

    return output
  }
}

export function createGetPublicCampaignDeadlineHandler(db: Firestore) {
  return async (): Promise<PublicCampaignDeadlineOutput> => {
    const campaignData = await getCampaignDocCached(db, CAMPAIGN_DOC_ID)
    const updatedAtMs = readTimestampMillis(campaignData?.updatedAt) ?? 0

    return {
      campaignId: CAMPAIGN_DOC_ID,
      endsAt: readCampaignDate(campaignData, 'endsAt'),
      endsAtTime: readCampaignTime(campaignData, 'endsAtTime'),
      timezone: CAMPAIGN_DEADLINE_TIMEZONE,
      updatedAtMs,
    }
  }
}

export function createGetPublicSalesSnapshotHandler(db: Firestore) {
  return async (): Promise<PublicSalesSnapshotOutput> => {
    const nowMs = Date.now()
    const cached = readCachedEntry(publicSalesSnapshotCache, nowMs)
    if (cached) {
      return cached
    }

    const [campaignData, summarySnapshot] = await Promise.all([
      getCampaignDocCached(db, CAMPAIGN_DOC_ID),
      db.collection('metrics').doc('sales_summary').get(),
    ])

    const numberRange = readCampaignNumberRange(
      campaignData,
      CAMPAIGN_DOC_ID,
    )
    const totalNumbers = Math.max(1, numberRange.total)

    let soldNumbers = 0
    let paidOrders = 0

    if (summarySnapshot.exists) {
      soldNumbers = Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('soldNumbers'))))
      paidOrders = Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('paidOrders'))))
    } else {
      const backfilledSummary = await backfillSalesSummaryOnce(db)
      if (backfilledSummary) {
        soldNumbers = backfilledSummary.soldNumbers
        paidOrders = backfilledSummary.paidOrders
      }
    }

    const cappedSoldNumbers = Math.min(soldNumbers, totalNumbers)
    const soldPercentage = Number(((cappedSoldNumbers / totalNumbers) * 100).toFixed(1))

    const output = {
      campaignId: CAMPAIGN_DOC_ID,
      totalNumbers,
      soldNumbers: cappedSoldNumbers,
      paidOrders,
      soldPercentage,
      updatedAtMs: nowMs,
    }

    publicSalesSnapshotCache = {
      payload: output,
      expiresAtMs: nowMs + PUBLIC_SALES_SNAPSHOT_CACHE_TTL_MS,
    }

    return output
  }
}
