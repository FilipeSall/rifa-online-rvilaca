import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  CAMPAIGN_STATUS_OPTIONS,
  CAMPAIGN_DOC_ID,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_TICKET_PRICE,
} from '../const/campaign'
import { db, functions } from '../lib/firebase'
import type { CampaignSettings, CampaignStatus, UpsertCampaignSettingsInput, UpsertCampaignSettingsOutput } from '../types/campaign'

type CallableEnvelope<T> = T | { result?: T }

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function sanitizeCampaignTitle(value: unknown) {
  if (typeof value !== 'string') {
    return DEFAULT_CAMPAIGN_TITLE
  }

  const normalized = value.trim()
  return normalized || DEFAULT_CAMPAIGN_TITLE
}

function sanitizePrizeText(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

function sanitizePricePerCota(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_TICKET_PRICE
  }

  return Number(numeric.toFixed(2))
}

function sanitizeCampaignStatus(value: unknown): CampaignStatus {
  if (typeof value !== 'string') {
    return DEFAULT_CAMPAIGN_STATUS
  }

  const normalized = value.trim().toLowerCase()
  const allowed = new Set<string>(CAMPAIGN_STATUS_OPTIONS.map((option) => option.value))
  if (!allowed.has(normalized)) {
    return DEFAULT_CAMPAIGN_STATUS
  }

  return normalized as CampaignStatus
}

function sanitizeCampaignDate(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null
  }

  return normalized
}

function mapSnapshotToSettings(raw: unknown): CampaignSettings {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  return {
    id: CAMPAIGN_DOC_ID,
    title: sanitizeCampaignTitle(payload.title ?? payload.name),
    pricePerCota: sanitizePricePerCota(payload.pricePerCota),
    mainPrize: sanitizePrizeText(payload.mainPrize, DEFAULT_MAIN_PRIZE),
    secondPrize: sanitizePrizeText(payload.secondPrize, DEFAULT_SECOND_PRIZE),
    bonusPrize: sanitizePrizeText(payload.bonusPrize, DEFAULT_BONUS_PRIZE),
    status: sanitizeCampaignStatus(payload.status),
    startsAt: sanitizeCampaignDate(payload.startsAt),
    endsAt: sanitizeCampaignDate(payload.endsAt),
  }
}

export function useCampaignSettings() {
  const [campaign, setCampaign] = useState<CampaignSettings>({
    id: CAMPAIGN_DOC_ID,
    title: DEFAULT_CAMPAIGN_TITLE,
    pricePerCota: DEFAULT_TICKET_PRICE,
    mainPrize: DEFAULT_MAIN_PRIZE,
    secondPrize: DEFAULT_SECOND_PRIZE,
    bonusPrize: DEFAULT_BONUS_PRIZE,
    status: DEFAULT_CAMPAIGN_STATUS,
    startsAt: null,
    endsAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [exists, setExists] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const upsertCampaignSettings = useMemo(
    () => httpsCallable<UpsertCampaignSettingsInput, unknown>(functions, 'upsertCampaignSettings'),
    [],
  )

  useEffect(() => {
    const campaignRef = doc(db, 'campaigns', CAMPAIGN_DOC_ID)
    const unsubscribe = onSnapshot(
      campaignRef,
      (snapshot) => {
        setExists(snapshot.exists())

        if (snapshot.exists()) {
          setCampaign(mapSnapshotToSettings(snapshot.data()))
        } else {
          setCampaign({
            id: CAMPAIGN_DOC_ID,
            title: DEFAULT_CAMPAIGN_TITLE,
            pricePerCota: DEFAULT_TICKET_PRICE,
            mainPrize: DEFAULT_MAIN_PRIZE,
            secondPrize: DEFAULT_SECOND_PRIZE,
            bonusPrize: DEFAULT_BONUS_PRIZE,
            status: DEFAULT_CAMPAIGN_STATUS,
            startsAt: null,
            endsAt: null,
          })
        }

        setIsLoading(false)
      },
      () => {
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const saveCampaignSettings = useCallback(
    async (input: UpsertCampaignSettingsInput) => {
      setIsSaving(true)
      setErrorMessage(null)

      try {
        const response = await upsertCampaignSettings(input)
        const payload = unwrapCallableData(response.data as CallableEnvelope<UpsertCampaignSettingsOutput>)

        setCampaign({
          id: payload.campaignId,
          title: sanitizeCampaignTitle(payload.title),
          pricePerCota: sanitizePricePerCota(payload.pricePerCota),
          mainPrize: sanitizePrizeText(payload.mainPrize, DEFAULT_MAIN_PRIZE),
          secondPrize: sanitizePrizeText(payload.secondPrize, DEFAULT_SECOND_PRIZE),
          bonusPrize: sanitizePrizeText(payload.bonusPrize, DEFAULT_BONUS_PRIZE),
          status: sanitizeCampaignStatus(payload.status),
          startsAt: sanitizeCampaignDate(payload.startsAt),
          endsAt: sanitizeCampaignDate(payload.endsAt),
        })
        setExists(true)

        return payload
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nao foi possivel salvar a campanha.'
        setErrorMessage(message)
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [upsertCampaignSettings],
  )

  const ensureCampaignExists = useCallback(
    async () =>
      saveCampaignSettings({
        title: DEFAULT_CAMPAIGN_TITLE,
        pricePerCota: DEFAULT_TICKET_PRICE,
        mainPrize: DEFAULT_MAIN_PRIZE,
        secondPrize: DEFAULT_SECOND_PRIZE,
        bonusPrize: DEFAULT_BONUS_PRIZE,
        status: DEFAULT_CAMPAIGN_STATUS,
        startsAt: null,
        endsAt: null,
      }),
    [saveCampaignSettings],
  )

  return {
    campaign,
    exists,
    isLoading,
    isSaving,
    errorMessage,
    saveCampaignSettings,
    ensureCampaignExists,
  }
}
