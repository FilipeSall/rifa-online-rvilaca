import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_DOC_ID,
  CAMPAIGN_STATUS_VALUES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MIN_PURCHASE_QUANTITY,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_PRICE_PER_COTA,
  DEFAULT_SECOND_PRIZE,
  MAX_PURCHASE_QUANTITY,
  type CampaignStatus,
} from './constants.js'
import { readCampaignNumberRange } from './numberStateStore.js'
import { asRecord, readMetricNumber, sanitizeString } from './shared.js'

type CampaignCouponDiscountType = 'percent' | 'fixed'

interface CampaignCoupon {
  code: string
  discountType: CampaignCouponDiscountType
  discountValue: number
  active: boolean
  createdAt: string
}

interface UpsertCampaignSettingsInput {
  title?: string
  pricePerCota?: number
  minPurchaseQuantity?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
  status?: CampaignStatus
  startsAt?: string | null
  endsAt?: string | null
  coupons?: CampaignCoupon[]
}

interface UpsertCampaignSettingsOutput {
  campaignId: string
  title: string
  pricePerCota: number
  minPurchaseQuantity: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string | null
  endsAt: string | null
  coupons: CampaignCoupon[]
}

interface DashboardSummaryOutput {
  totalRevenue: number
  paidOrders: number
  soldNumbers: number
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

function sanitizeMinPurchaseQuantity(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > MAX_PURCHASE_QUANTITY) {
    throw new HttpsError(
      'invalid-argument',
      `minPurchaseQuantity deve ser inteiro entre 1 e ${MAX_PURCHASE_QUANTITY}.`,
    )
  }

  return numeric
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

export function readCampaignMinPurchaseQuantity(data: DocumentData | undefined): number {
  const numeric = Number(data?.minPurchaseQuantity)
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > MAX_PURCHASE_QUANTITY) {
    return DEFAULT_MIN_PURCHASE_QUANTITY
  }

  return numeric
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

function readCampaignMainPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.mainPrize)
  return value || DEFAULT_MAIN_PRIZE
}

function readCampaignSecondPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.secondPrize)
  return value || DEFAULT_SECOND_PRIZE
}

function readCampaignBonusPrize(data: DocumentData | undefined): string {
  const value = sanitizeString(data?.bonusPrize)
  return value || DEFAULT_BONUS_PRIZE
}

function readCampaignStatus(data: DocumentData | undefined): CampaignStatus {
  const value = sanitizeString(data?.status).toLowerCase()
  if (CAMPAIGN_STATUS_VALUES.includes(value as CampaignStatus)) {
    return value as CampaignStatus
  }

  return DEFAULT_CAMPAIGN_STATUS
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

export function createUpsertCampaignSettingsHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string } | null; data: unknown }) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    await assertAdminRole(db, request.auth.uid)

    try {
      const payload = asRecord(request.data) as Partial<UpsertCampaignSettingsInput>
      const nextTitle = sanitizeCampaignTitle(payload.title)
      const nextPricePerCota = sanitizeCampaignPrice(payload.pricePerCota)
      const nextMinPurchaseQuantity = sanitizeMinPurchaseQuantity(payload.minPurchaseQuantity)
      const nextMainPrize = sanitizeCampaignPrize(payload.mainPrize, 'mainPrize')
      const nextSecondPrize = sanitizeCampaignPrize(payload.secondPrize, 'secondPrize')
      const nextBonusPrize = sanitizeCampaignPrize(payload.bonusPrize, 'bonusPrize')
      const nextStatus = sanitizeCampaignStatus(payload.status)
      const nextStartsAt = sanitizeCampaignDate(payload.startsAt, 'startsAt')
      const nextEndsAt = sanitizeCampaignDate(payload.endsAt, 'endsAt')
      const nextCoupons = sanitizeCoupons(payload.coupons)
      const campaignRef = db.collection('campaigns').doc(CAMPAIGN_DOC_ID)
      const campaignSnapshot = await campaignRef.get()
      const currentData = campaignSnapshot.exists ? (campaignSnapshot.data() as DocumentData | undefined) : undefined

      const updateData: DocumentData = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      }

      if (nextTitle !== null) {
        updateData.title = nextTitle
        updateData.name = nextTitle
      }

      if (nextPricePerCota !== null) {
        updateData.pricePerCota = nextPricePerCota
      }

      if (nextMinPurchaseQuantity !== null) {
        updateData.minPurchaseQuantity = nextMinPurchaseQuantity
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

      if (nextStatus !== null) {
        updateData.status = nextStatus
      }

      if (nextStartsAt !== undefined) {
        updateData.startsAt = nextStartsAt
      }

      if (nextEndsAt !== undefined) {
        updateData.endsAt = nextEndsAt
      }

      if (nextCoupons !== null) {
        updateData.coupons = nextCoupons
      }

      const effectiveStartsAt =
        nextStartsAt !== undefined ? nextStartsAt : readCampaignDate(currentData, 'startsAt')
      const effectiveEndsAt =
        nextEndsAt !== undefined ? nextEndsAt : readCampaignDate(currentData, 'endsAt')
      if (effectiveStartsAt && effectiveEndsAt && effectiveStartsAt > effectiveEndsAt) {
        throw new HttpsError('invalid-argument', 'startsAt nao pode ser maior que endsAt.')
      }

      if (!campaignSnapshot.exists) {
        if (!updateData.title) {
          updateData.title = DEFAULT_CAMPAIGN_TITLE
          updateData.name = DEFAULT_CAMPAIGN_TITLE
        }

        if (!updateData.pricePerCota) {
          updateData.pricePerCota = DEFAULT_PRICE_PER_COTA
        }

        if (!updateData.minPurchaseQuantity) {
          updateData.minPurchaseQuantity = DEFAULT_MIN_PURCHASE_QUANTITY
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

        if (!updateData.status) {
          updateData.status = DEFAULT_CAMPAIGN_STATUS
        }

        if (!updateData.coupons) {
          updateData.coupons = []
        }

        updateData.createdAt = FieldValue.serverTimestamp()
      } else if (
        nextTitle === null &&
        nextPricePerCota === null &&
        nextMinPurchaseQuantity === null &&
        nextMainPrize === null &&
        nextSecondPrize === null &&
        nextBonusPrize === null &&
        nextStatus === null &&
        nextStartsAt === undefined &&
        nextEndsAt === undefined &&
        nextCoupons === null
      ) {
        throw new HttpsError('invalid-argument', 'Nenhum dado valido para atualizar campanha.')
      }

      logger.info('upsertCampaignSettings started', {
        uid: request.auth.uid,
        hasNewCoupons: Array.isArray(nextCoupons),
        nextCouponsCount: Array.isArray(nextCoupons) ? nextCoupons.length : null,
        nextMinPurchaseQuantity,
      })

      await campaignRef.set(updateData, { merge: true })

      const updatedCampaign = await campaignRef.get()
      const campaignData = (updatedCampaign.exists ? updatedCampaign.data() : undefined) as DocumentData | undefined

      const output = {
        campaignId: CAMPAIGN_DOC_ID,
        title: readCampaignTitle(campaignData),
        pricePerCota: readCampaignPricePerCota(campaignData),
        minPurchaseQuantity: readCampaignMinPurchaseQuantity(campaignData),
        mainPrize: readCampaignMainPrize(campaignData),
        secondPrize: readCampaignSecondPrize(campaignData),
        bonusPrize: readCampaignBonusPrize(campaignData),
        status: readCampaignStatus(campaignData),
        startsAt: readCampaignDate(campaignData, 'startsAt'),
        endsAt: readCampaignDate(campaignData, 'endsAt'),
        coupons: readCampaignCoupons(campaignData),
      } satisfies UpsertCampaignSettingsOutput

      logger.info('upsertCampaignSettings succeeded', {
        uid: request.auth.uid,
        campaignId: CAMPAIGN_DOC_ID,
        minPurchaseQuantity: output.minPurchaseQuantity,
        couponsCount: output.coupons.length,
      })

      return output
    } catch (error) {
      logger.error('upsertCampaignSettings failed', {
        uid: request.auth.uid,
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
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Usuario precisa estar autenticado')
    }

    await assertAdminRole(db, request.auth.uid)

    const [summarySnapshot, dailySnapshot] = await Promise.all([
      db.collection('metrics').doc('sales_summary').get(),
      db
        .collection('salesMetricsDaily')
        .orderBy('date', 'desc')
        .limit(14)
        .get(),
    ])

    const totalRevenue = readMetricNumber(summarySnapshot.get('totalRevenue'))
    const paidOrders = Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('paidOrders'))))
    const soldNumbers = Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('soldNumbers'))))
    const avgTicket = paidOrders > 0 ? Number((totalRevenue / paidOrders).toFixed(2)) : 0
    const daily = dailySnapshot.docs.map((dailyDoc) => ({
      date: sanitizeString(dailyDoc.get('date')) || dailyDoc.id,
      revenue: readMetricNumber(dailyDoc.get('revenue')),
      paidOrders: Math.max(0, Math.floor(readMetricNumber(dailyDoc.get('paidOrders')))),
      soldNumbers: Math.max(0, Math.floor(readMetricNumber(dailyDoc.get('soldNumbers')))),
    }))

    return {
      totalRevenue,
      paidOrders,
      soldNumbers,
      avgTicket,
      daily,
    } satisfies DashboardSummaryOutput
  }
}

export function createGetPublicSalesSnapshotHandler(db: Firestore) {
  return async (): Promise<PublicSalesSnapshotOutput> => {
    const [campaignSnapshot, summarySnapshot] = await Promise.all([
      db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get(),
      db.collection('metrics').doc('sales_summary').get(),
    ])

    const numberRange = readCampaignNumberRange(
      campaignSnapshot.exists ? (campaignSnapshot.data() as DocumentData | undefined) : undefined,
      CAMPAIGN_DOC_ID,
    )
    const totalNumbers = Math.max(1, numberRange.total)

    let soldNumbers = 0
    let paidOrders = 0

    if (summarySnapshot.exists) {
      soldNumbers = Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('soldNumbers'))))
      paidOrders = Math.max(0, Math.floor(readMetricNumber(summarySnapshot.get('paidOrders'))))
    } else {
      const paidOrdersSnapshot = await db.collection('orders')
        .where('status', '==', 'paid')
        .where('type', '==', 'deposit')
        .where('campaignId', '==', CAMPAIGN_DOC_ID)
        .select('reservedNumbers', 'quantity')
        .get()

      paidOrders = paidOrdersSnapshot.size
      soldNumbers = paidOrdersSnapshot.docs.reduce((total, orderDoc) => {
        const data = orderDoc.data()

        if (Array.isArray(data.reservedNumbers)) {
          return total + data.reservedNumbers.filter((value) => Number.isInteger(value) && Number(value) > 0).length
        }

        const quantity = Number(data.quantity)
        if (Number.isInteger(quantity) && quantity > 0) {
          return total + quantity
        }

        return total
      }, 0)
    }

    const cappedSoldNumbers = Math.min(soldNumbers, totalNumbers)
    const soldPercentage = Number(((cappedSoldNumbers / totalNumbers) * 100).toFixed(1))

    return {
      campaignId: CAMPAIGN_DOC_ID,
      totalNumbers,
      soldNumbers: cappedSoldNumbers,
      paidOrders,
      soldPercentage,
      updatedAtMs: Date.now(),
    }
  }
}
