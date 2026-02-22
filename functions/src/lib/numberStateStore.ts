import { FieldValue, type DocumentData, type Firestore, type Timestamp } from 'firebase-admin/firestore'
import {
  CAMPAIGN_DOC_ID,
  RAFFLE_NUMBER_END,
  RAFFLE_NUMBER_START,
} from './constants.js'
import { readString, readTimestampMillis, sanitizeString } from './shared.js'

export type NumberStatus = 'disponivel' | 'reservado' | 'pago'

export interface NumberStateView {
  number: number
  status: NumberStatus
  reservedBy: string | null
  reservationExpiresAtMs: number | null
}

export interface NumberRange {
  campaignId: string
  start: number
  end: number
  total: number
}

function readPositiveInteger(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null
  }

  return numeric
}

export function readCampaignNumberRange(
  campaignData: DocumentData | undefined,
  campaignId: string = CAMPAIGN_DOC_ID,
): NumberRange {
  const start = readPositiveInteger(campaignData?.numberStart) || RAFFLE_NUMBER_START
  const explicitEnd = readPositiveInteger(campaignData?.numberEnd)
  const totalFromDoc = readPositiveInteger(campaignData?.totalNumbers ?? campaignData?.totalCotas)

  let end = RAFFLE_NUMBER_END
  if (explicitEnd && explicitEnd >= start) {
    end = explicitEnd
  } else if (totalFromDoc) {
    end = start + totalFromDoc - 1
  } else if (RAFFLE_NUMBER_END < start) {
    end = start
  }

  const total = Math.max(0, end - start + 1)
  return {
    campaignId,
    start,
    end,
    total,
  }
}

export function buildNumberStateDocId(campaignId: string, number: number): string {
  return `${campaignId}_${number}`
}

export function getNumberStateRef(db: Firestore, campaignId: string, number: number) {
  return db.collection('numberStates').doc(buildNumberStateDocId(campaignId, number))
}

export function sanitizeStoredNumberStatus(raw: unknown): NumberStatus {
  const value = sanitizeString(raw).toLowerCase()

  if (value === 'paid' || value === 'pago') {
    return 'pago'
  }

  if (value === 'reserved' || value === 'reservado') {
    return 'reservado'
  }

  return 'disponivel'
}

function parseStoredReservationExpiresAtMs(data: DocumentData | null | undefined): number | null {
  return readTimestampMillis(data?.reservationExpiresAt || data?.expiresAt)
}

function parseStoredReservedBy(data: DocumentData | null | undefined): string | null {
  return readString(data?.reservedBy)
}

export function buildNumberStateView(params: {
  number: number
  nowMs: number
  numberStateData?: DocumentData | null
}): NumberStateView {
  const stateData = params.numberStateData || null
  const data = stateData
  const rawStatus = sanitizeStoredNumberStatus(data?.status)
  const reservationExpiresAtMs = parseStoredReservationExpiresAtMs(data)
  const reservedBy = parseStoredReservedBy(data)
  const isExpiredReservation = rawStatus === 'reservado'
    && reservationExpiresAtMs !== null
    && reservationExpiresAtMs <= params.nowMs

  return {
    number: params.number,
    status: isExpiredReservation ? 'disponivel' : rawStatus,
    reservedBy,
    reservationExpiresAtMs,
  }
}

export function buildReservedNumberStateData(params: {
  campaignId: string
  number: number
  uid: string
  expiresAt: Timestamp
}): DocumentData {
  return {
    campaignId: params.campaignId,
    number: params.number,
    status: 'reservado',
    reservedBy: params.uid,
    reservedAt: FieldValue.serverTimestamp(),
    reservationExpiresAt: params.expiresAt,
    ownerUid: null,
    orderId: null,
    paidAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  }
}

export function buildPaidNumberStateData(params: {
  campaignId: string
  number: number
  userId: string
  orderId: string
}): DocumentData {
  return {
    campaignId: params.campaignId,
    number: params.number,
    status: 'pago',
    reservedBy: null,
    reservedAt: null,
    reservationExpiresAt: null,
    ownerUid: params.userId,
    orderId: params.orderId,
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
}
