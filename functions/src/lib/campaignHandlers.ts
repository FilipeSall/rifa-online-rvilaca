import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CAMPAIGN_DOC_ID,
  CAMPAIGN_STATUS_VALUES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_PRICE_PER_COTA,
  DEFAULT_SECOND_PRIZE,
  type CampaignStatus,
} from './constants.js'
import { asRecord, readMetricNumber, sanitizeString } from './shared.js'

interface UpsertCampaignSettingsInput {
  title?: string
  pricePerCota?: number
  mainPrize?: string
  secondPrize?: string
  bonusPrize?: string
  status?: CampaignStatus
  startsAt?: string | null
  endsAt?: string | null
}

interface UpsertCampaignSettingsOutput {
  campaignId: string
  title: string
  pricePerCota: number
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  status: CampaignStatus
  startsAt: string | null
  endsAt: string | null
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

    const payload = asRecord(request.data) as Partial<UpsertCampaignSettingsInput>
    const nextTitle = sanitizeCampaignTitle(payload.title)
    const nextPricePerCota = sanitizeCampaignPrice(payload.pricePerCota)
    const nextMainPrize = sanitizeCampaignPrize(payload.mainPrize, 'mainPrize')
    const nextSecondPrize = sanitizeCampaignPrize(payload.secondPrize, 'secondPrize')
    const nextBonusPrize = sanitizeCampaignPrize(payload.bonusPrize, 'bonusPrize')
    const nextStatus = sanitizeCampaignStatus(payload.status)
    const nextStartsAt = sanitizeCampaignDate(payload.startsAt, 'startsAt')
    const nextEndsAt = sanitizeCampaignDate(payload.endsAt, 'endsAt')
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
      updateData.createdAt = FieldValue.serverTimestamp()
    } else if (
      nextTitle === null &&
      nextPricePerCota === null &&
      nextMainPrize === null &&
      nextSecondPrize === null &&
      nextBonusPrize === null &&
      nextStatus === null &&
      nextStartsAt === undefined &&
      nextEndsAt === undefined
    ) {
      throw new HttpsError('invalid-argument', 'Nenhum dado valido para atualizar campanha.')
    }

    await campaignRef.set(updateData, { merge: true })

    const updatedCampaign = await campaignRef.get()
    const campaignData = (updatedCampaign.exists ? updatedCampaign.data() : undefined) as DocumentData | undefined

    return {
      campaignId: CAMPAIGN_DOC_ID,
      title: readCampaignTitle(campaignData),
      pricePerCota: readCampaignPricePerCota(campaignData),
      mainPrize: readCampaignMainPrize(campaignData),
      secondPrize: readCampaignSecondPrize(campaignData),
      bonusPrize: readCampaignBonusPrize(campaignData),
      status: readCampaignStatus(campaignData),
      startsAt: readCampaignDate(campaignData, 'startsAt'),
      endsAt: readCampaignDate(campaignData, 'endsAt'),
    } satisfies UpsertCampaignSettingsOutput
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
