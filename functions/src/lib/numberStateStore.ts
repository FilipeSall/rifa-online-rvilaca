import type { DocumentData } from 'firebase-admin/firestore'
import {
  CAMPAIGN_DOC_ID,
  RAFFLE_NUMBER_END,
  RAFFLE_NUMBER_START,
} from './constants.js'

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
