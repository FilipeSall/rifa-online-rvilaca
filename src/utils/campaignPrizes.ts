import {
  DEFAULT_BONUS_PRIZE,
  DEFAULT_BONUS_PRIZE_QUANTITY,
} from '../const/campaign'
import type { CampaignAdditionalPrize, CampaignSettings } from '../types/campaign'

const LEGACY_PREFIXED_PRIZE_REGEX = /^\s*(\d+)\s+(.+)$/
export const MAX_PRIZE_QUANTITY = 100

export type DrawPrizeOption = {
  value: string
  label: string
}

function sanitizePrizeLabel(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, 160)
}

export function sanitizePrizeQuantity(value: unknown, fallback = 1): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, MAX_PRIZE_QUANTITY)
}

export function normalizeBonusPrizeFromRaw(rawPrize: unknown, rawQuantity: unknown): {
  label: string
  quantity: number
} {
  const explicitQuantity = Number(rawQuantity)
  const hasExplicitQuantity = Number.isInteger(explicitQuantity) && explicitQuantity > 0
  const normalizedRawPrize = sanitizePrizeLabel(rawPrize)

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

export function normalizeAdditionalPrizesFromRaw(raw: unknown): CampaignAdditionalPrize[] {
  if (!Array.isArray(raw)) {
    return []
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

export function formatPrizeLabelWithQuantity(label: string, quantity: number): string {
  const normalizedLabel = sanitizePrizeLabel(label)
  if (!normalizedLabel) {
    return ''
  }

  const normalizedQuantity = sanitizePrizeQuantity(quantity, 1)
  if (normalizedQuantity <= 1) {
    return normalizedLabel
  }

  return `${normalizedQuantity} ${normalizedLabel}`
}

function buildUnitValue(params: {
  label: string
  source: 'main' | 'second' | 'bonus' | 'additional'
  unitIndex: number
  quantity: number
  additionalGroupIndex?: number
}) {
  const { label, source, unitIndex, quantity, additionalGroupIndex = 0 } = params
  const normalizedLabel = sanitizePrizeLabel(label)
  if (!normalizedLabel) {
    return ''
  }

  if (source === 'bonus' && quantity > 1) {
    return `${normalizedLabel} (Premio Extra ${unitIndex})`
  }

  if (source === 'additional' && quantity > 1) {
    return `${normalizedLabel} (Premio Adicional ${additionalGroupIndex + 1}.${unitIndex})`
  }

  return normalizedLabel
}

function pushUniqueOption(options: DrawPrizeOption[], option: DrawPrizeOption) {
  if (!option.value || !option.label) {
    return
  }

  if (options.some((item) => item.value === option.value)) {
    return
  }

  options.push(option)
}

function buildPrizeOptions(params: {
  includeMainPrize: boolean
  campaign: Pick<
    CampaignSettings,
    'mainPrize' | 'secondPrize' | 'bonusPrize' | 'bonusPrizeQuantity' | 'additionalPrizes'
  >
}): DrawPrizeOption[] {
  const { includeMainPrize, campaign } = params
  const options: DrawPrizeOption[] = []

  const normalizedMainPrize = sanitizePrizeLabel(campaign.mainPrize)
  if (includeMainPrize && normalizedMainPrize) {
    pushUniqueOption(options, {
      value: normalizedMainPrize,
      label: normalizedMainPrize,
    })
  }

  const normalizedSecondPrize = sanitizePrizeLabel(campaign.secondPrize)
  if (normalizedSecondPrize) {
    pushUniqueOption(options, {
      value: normalizedSecondPrize,
      label: normalizedSecondPrize,
    })
  }

  const normalizedBonusPrize = sanitizePrizeLabel(campaign.bonusPrize)
  const normalizedBonusQuantity = sanitizePrizeQuantity(campaign.bonusPrizeQuantity, DEFAULT_BONUS_PRIZE_QUANTITY)
  if (normalizedBonusPrize) {
    for (let index = 1; index <= normalizedBonusQuantity; index += 1) {
      pushUniqueOption(options, {
        value: buildUnitValue({
          label: normalizedBonusPrize,
          source: 'bonus',
          unitIndex: index,
          quantity: normalizedBonusQuantity,
        }),
        label: normalizedBonusPrize,
      })
    }
  }

  for (let prizeIndex = 0; prizeIndex < campaign.additionalPrizes.length; prizeIndex += 1) {
    const prize = campaign.additionalPrizes[prizeIndex]
    const label = sanitizePrizeLabel(prize.label)
    if (!label) {
      continue
    }

    const quantity = sanitizePrizeQuantity(prize.quantity, 1)
    for (let unitIndex = 1; unitIndex <= quantity; unitIndex += 1) {
      pushUniqueOption(options, {
        value: buildUnitValue({
          label,
          source: 'additional',
          unitIndex,
          quantity,
          additionalGroupIndex: prizeIndex,
        }),
        label,
      })
    }
  }

  return options
}

export function buildMainRafflePrizeOptions(
  campaign: Pick<
    CampaignSettings,
    'mainPrize' | 'secondPrize' | 'bonusPrize' | 'bonusPrizeQuantity' | 'additionalPrizes'
  >,
): DrawPrizeOption[] {
  return buildPrizeOptions({ includeMainPrize: true, campaign })
}

export function buildTopBuyersPrizeOptions(
  campaign: Pick<
    CampaignSettings,
    'mainPrize' | 'secondPrize' | 'bonusPrize' | 'bonusPrizeQuantity' | 'additionalPrizes'
  >,
): DrawPrizeOption[] {
  return buildPrizeOptions({ includeMainPrize: false, campaign })
}
