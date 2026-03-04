import type { DocumentData } from 'firebase-admin/firestore'
import {
  DEFAULT_ADDITIONAL_PRIZES,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_BONUS_PRIZE_QUANTITY,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  type CampaignAdditionalPrize,
} from './constants.js'
import { sanitizeString } from './shared.js'

const LEGACY_PREFIXED_PRIZE_REGEX = /^\s*(\d+)\s+(.+)$/
export const MAX_PRIZE_QUANTITY = 100

function sanitizePrizeLabel(value: unknown): string {
  return sanitizeString(value).slice(0, 160)
}

export function sanitizePrizeQuantity(value: unknown, fallback = 1): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, MAX_PRIZE_QUANTITY)
}

export function readCampaignBonusPrizeConfig(data: DocumentData | undefined): {
  label: string
  quantity: number
} {
  const explicitQuantity = Number(data?.bonusPrizeQuantity)
  const hasExplicitQuantity = Number.isInteger(explicitQuantity) && explicitQuantity > 0
  const normalizedRawPrize = sanitizePrizeLabel(data?.bonusPrize)

  if (normalizedRawPrize) {
    if (hasExplicitQuantity) {
      return {
        label: normalizedRawPrize,
        quantity: sanitizePrizeQuantity(explicitQuantity, DEFAULT_BONUS_PRIZE_QUANTITY),
      }
    }

    const legacyMatch = normalizedRawPrize.match(LEGACY_PREFIXED_PRIZE_REGEX)
    if (legacyMatch) {
      const legacyQuantity = sanitizePrizeQuantity(Number(legacyMatch[1]), DEFAULT_BONUS_PRIZE_QUANTITY)
      const legacyLabel = sanitizePrizeLabel(legacyMatch[2])
      if (legacyLabel) {
        return {
          label: legacyLabel,
          quantity: legacyQuantity,
        }
      }
    }

    return {
      label: normalizedRawPrize,
      quantity: DEFAULT_BONUS_PRIZE_QUANTITY,
    }
  }

  return {
    label: DEFAULT_BONUS_PRIZE,
    quantity: hasExplicitQuantity
      ? sanitizePrizeQuantity(explicitQuantity, DEFAULT_BONUS_PRIZE_QUANTITY)
      : DEFAULT_BONUS_PRIZE_QUANTITY,
  }
}

export function readCampaignAdditionalPrizes(data: DocumentData | undefined): CampaignAdditionalPrize[] {
  const raw = data?.additionalPrizes
  if (!Array.isArray(raw)) {
    return DEFAULT_ADDITIONAL_PRIZES
  }

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        const label = sanitizePrizeLabel(item)
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
      const label = sanitizePrizeLabel(payload.label)
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

function buildPrizeUnitValue(params: {
  label: string
  source: 'bonus' | 'additional'
  unitIndex: number
  quantity: number
  additionalGroupIndex?: number
}): string {
  const { label, source, unitIndex, quantity, additionalGroupIndex = 0 } = params

  if (source === 'bonus' && quantity > 1) {
    return `${label} (Premio Extra ${unitIndex})`
  }

  if (source === 'additional' && quantity > 1) {
    return `${label} (Premio Adicional ${additionalGroupIndex + 1}.${unitIndex})`
  }

  return label
}

function buildPrizeValues(params: {
  campaignData: DocumentData | undefined
  includeMainPrize: boolean
  includeSecondPrize: boolean
}): string[] {
  const values: string[] = []
  const pushUnique = (value: string) => {
    if (!value || values.includes(value)) {
      return
    }

    values.push(value)
  }

  const mainPrize = sanitizePrizeLabel(params.campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
  if (params.includeMainPrize && mainPrize) {
    pushUnique(mainPrize)
  }

  const secondPrize = sanitizePrizeLabel(params.campaignData?.secondPrize) || DEFAULT_SECOND_PRIZE
  if (params.includeSecondPrize && secondPrize) {
    pushUnique(secondPrize)
  }

  const bonusPrizeConfig = readCampaignBonusPrizeConfig(params.campaignData)
  if (bonusPrizeConfig.label) {
    for (let unitIndex = 1; unitIndex <= bonusPrizeConfig.quantity; unitIndex += 1) {
      pushUnique(buildPrizeUnitValue({
        label: bonusPrizeConfig.label,
        source: 'bonus',
        unitIndex,
        quantity: bonusPrizeConfig.quantity,
      }))
    }
  }

  const additionalPrizes = readCampaignAdditionalPrizes(params.campaignData)
  for (let additionalIndex = 0; additionalIndex < additionalPrizes.length; additionalIndex += 1) {
    const additionalPrize = additionalPrizes[additionalIndex]
    if (!additionalPrize?.label) {
      continue
    }

    for (let unitIndex = 1; unitIndex <= additionalPrize.quantity; unitIndex += 1) {
      pushUnique(buildPrizeUnitValue({
        label: additionalPrize.label,
        source: 'additional',
        unitIndex,
        quantity: additionalPrize.quantity,
        additionalGroupIndex: additionalIndex,
      }))
    }
  }

  return values
}

export function buildMainRaffleDrawPrizeValues(campaignData: DocumentData | undefined): string[] {
  return buildPrizeValues({
    campaignData,
    includeMainPrize: true,
    includeSecondPrize: true,
  })
}

export function buildTopBuyersDrawPrizeValues(campaignData: DocumentData | undefined): string[] {
  return buildPrizeValues({
    campaignData,
    includeMainPrize: false,
    includeSecondPrize: true,
  })
}
