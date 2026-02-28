import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
    CAMPAIGN_PACK_QUANTITIES,
    CAMPAIGN_STATUS_OPTIONS,
    CAMPAIGN_DOC_ID,
    buildDefaultCampaignPackPrices,
    DEFAULT_ADDITIONAL_PRIZES,
    DEFAULT_BONUS_PRIZE,
    DEFAULT_CAMPAIGN_STATUS,
    DEFAULT_CAMPAIGN_TITLE,
    DEFAULT_MAIN_PRIZE,
    DEFAULT_SECOND_PRIZE,
    DEFAULT_SUPPORT_WHATSAPP_NUMBER,
    DEFAULT_TICKET_PRICE,
    DEFAULT_TOTAL_NUMBERS,
} from '../const/campaign'
import { MAX_QUANTITY } from '../const/purchaseNumbers'
import { db, functions } from '../lib/firebase'
import type {
    CampaignFeaturedVideoMedia,
    CampaignFeaturedPromotion,
    CampaignCoupon,
    CampaignCouponDiscountType,
    CampaignHeroCarouselMedia,
    CampaignMidias,
    CampaignPackPrice,
    CampaignSettings,
    CampaignStatus,
    UpsertCampaignSettingsInput,
    UpsertCampaignSettingsOutput,
} from '../types/campaign'

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

function sanitizeCampaignTime(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
        return null
    }

    return normalized
}

function sanitizeSupportWhatsappNumber(value: unknown) {
    if (typeof value !== 'string') {
        return DEFAULT_SUPPORT_WHATSAPP_NUMBER
    }

    const normalized = value.trim()
    return normalized || DEFAULT_SUPPORT_WHATSAPP_NUMBER
}

function sanitizeTotalNumbers(value: unknown) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return DEFAULT_TOTAL_NUMBERS
    }

    return parsed
}

function sanitizeCampaignPackPrices(value: unknown, unitPriceFallback: number): CampaignPackPrice[] {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.values(value as Record<string, unknown>)
            : []
    const normalized: CampaignPackPrice[] = []
    const used = new Set<number>()

    for (const rawItem of items) {
        if (!rawItem || typeof rawItem !== 'object') {
            continue
        }

        const item = rawItem as Partial<CampaignPackPrice>
        const quantity = Number(item.quantity)
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY || used.has(quantity)) {
            continue
        }

        normalized.push({
            quantity,
            price: Number((quantity * unitPriceFallback).toFixed(2)),
            active: item.active !== false,
        })
        used.add(quantity)

        if (normalized.length >= CAMPAIGN_PACK_QUANTITIES.length) {
            break
        }
    }

    for (const fallbackQuantity of CAMPAIGN_PACK_QUANTITIES) {
        if (normalized.length >= CAMPAIGN_PACK_QUANTITIES.length) {
            break
        }
        if (used.has(fallbackQuantity)) {
            continue
        }
        normalized.push({
            quantity: fallbackQuantity,
            price: Number((fallbackQuantity * unitPriceFallback).toFixed(2)),
            active: true,
        })
        used.add(fallbackQuantity)
    }

    return normalized
}

function sanitizeCampaignFeaturedPromotion(value: unknown, allowedQuantities?: number[]): CampaignFeaturedPromotion | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const payload = value as Record<string, unknown>
    const targetQuantity = Number(payload.targetQuantity)
    if (!Number.isInteger(targetQuantity) || targetQuantity <= 0 || targetQuantity > MAX_QUANTITY) {
        return null
    }
    if (Array.isArray(allowedQuantities) && !allowedQuantities.includes(targetQuantity)) {
        return null
    }

    const discountType: CampaignCouponDiscountType = payload.discountType === 'fixed' ? 'fixed' : 'percent'
    const rawValue = Number(payload.discountValue)
    if (!Number.isFinite(rawValue) || rawValue < 0) {
        return null
    }

    const discountValue = discountType === 'percent'
        ? Number(Math.min(rawValue, 100).toFixed(2))
        : Number(rawValue.toFixed(2))

    const label = typeof payload.label === 'string' ? payload.label.trim().slice(0, 80) : ''

    return {
        active: payload.active === true,
        targetQuantity,
        discountType,
        discountValue,
        label,
    }
}

function sanitizeCouponDiscountType(value: unknown): CampaignCouponDiscountType {
    return value === 'fixed' ? 'fixed' : 'percent'
}

function sanitizeCouponCode(value: unknown) {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (!normalized) {
        return ''
    }

    return normalized.replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
}

function sanitizeCouponValue(value: unknown, discountType: CampaignCouponDiscountType) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0
    }

    if (discountType === 'percent') {
        return Number(Math.min(parsed, 100).toFixed(2))
    }

    return Number(parsed.toFixed(2))
}

function sanitizeCouponCreatedAt(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
        return value
    }

    return new Date().toISOString()
}

function sanitizeCoupons(value: unknown): CampaignCoupon[] {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.values(value as Record<string, unknown>)
            : []

    if (items.length === 0) {
        return []
    }

    const deduplicated = new Map<string, CampaignCoupon>()

    for (const rawItem of items) {
        const item = rawItem && typeof rawItem === 'object' ? (rawItem as Record<string, unknown>) : {}
        const discountType = sanitizeCouponDiscountType(item.discountType)
        const code = sanitizeCouponCode(item.code)
        const discountValue = sanitizeCouponValue(item.discountValue, discountType)
        const active = item.active !== false
        const createdAt = sanitizeCouponCreatedAt(item.createdAt)

        if (!code || discountValue <= 0) {
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

function getDefaultCampaignMidias(): CampaignMidias {
    return {
        heroCarousel: [],
        featuredVideo: null,
    }
}

function sanitizeHeroCarouselMediaId(value: unknown) {
    if (typeof value !== 'string') {
        return ''
    }

    const normalized = value.trim()
    return normalized.slice(0, 96)
}

function sanitizeHeroCarouselMediaUrl(value: unknown) {
    if (typeof value !== 'string') {
        return ''
    }

    const normalized = value.trim()
    if (!/^https?:\/\//i.test(normalized)) {
        return ''
    }

    return normalized
}

function sanitizeHeroCarouselMediaStoragePath(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    return normalized.slice(0, 260)
}

function sanitizeHeroCarouselMediaAlt(value: unknown) {
    if (typeof value !== 'string') {
        return ''
    }

    return value.trim().slice(0, 140)
}

function sanitizeHeroCarouselMediaOrder(value: unknown, fallback: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0) {
        return fallback
    }

    return parsed
}

function sanitizeHeroCarouselMediaCreatedAt(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
        return value
    }

    return new Date().toISOString()
}

function sanitizeHeroCarousel(value: unknown): CampaignHeroCarouselMedia[] {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
            ? Object.values(value as Record<string, unknown>)
            : []

    if (items.length === 0) {
        return []
    }

    const deduplicated = new Map<string, CampaignHeroCarouselMedia>()

    for (let index = 0; index < items.length; index += 1) {
        const rawItem = items[index]
        const item = rawItem && typeof rawItem === 'object' ? (rawItem as Record<string, unknown>) : {}
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

function sanitizeFeaturedVideoId(value: unknown) {
    if (typeof value !== 'string') {
        return ''
    }

    return value.trim().slice(0, 96)
}

function sanitizeFeaturedVideoUrl(value: unknown) {
    if (typeof value !== 'string') {
        return ''
    }

    const normalized = value.trim()
    if (!/^https?:\/\//i.test(normalized)) {
        return ''
    }

    return normalized
}

function sanitizeFeaturedVideoStoragePath(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    return normalized.slice(0, 260)
}

function sanitizeFeaturedVideoCreatedAt(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
        return value
    }

    return new Date().toISOString()
}

function sanitizeFeaturedVideo(value: unknown): CampaignFeaturedVideoMedia | null {
    if (!value || typeof value !== 'object') {
        return null
    }

    const payload = value as Record<string, unknown>
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

function sanitizeCampaignMidias(value: unknown): CampaignMidias {
    if (!value || typeof value !== 'object') {
        return getDefaultCampaignMidias()
    }

    const payload = value as Record<string, unknown>

    return {
        heroCarousel: sanitizeHeroCarousel(payload.heroCarousel),
        featuredVideo: sanitizeFeaturedVideo(payload.featuredVideo),
    }
}

function mapSnapshotToSettings(raw: unknown): CampaignSettings {
    const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const pricePerCota = sanitizePricePerCota(payload.pricePerCota)

    const packPrices = sanitizeCampaignPackPrices(payload.packPrices, pricePerCota)
    return {
        id: CAMPAIGN_DOC_ID,
        title: sanitizeCampaignTitle(payload.title ?? payload.name),
        pricePerCota,
        mainPrize: sanitizePrizeText(payload.mainPrize, DEFAULT_MAIN_PRIZE),
        secondPrize: sanitizePrizeText(payload.secondPrize, DEFAULT_SECOND_PRIZE),
        bonusPrize: sanitizePrizeText(payload.bonusPrize, DEFAULT_BONUS_PRIZE),
        totalNumbers: sanitizeTotalNumbers(payload.totalNumbers ?? payload.totalCotas),
        additionalPrizes: Array.isArray(payload.additionalPrizes)
            ? payload.additionalPrizes.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
            : DEFAULT_ADDITIONAL_PRIZES,
        supportWhatsappNumber: sanitizeSupportWhatsappNumber(payload.supportWhatsappNumber),
        whatsappContactMessage: typeof payload.whatsappContactMessage === 'string' ? payload.whatsappContactMessage.trim().slice(0, 500) : undefined,
        status: sanitizeCampaignStatus(payload.status),
        startsAt: sanitizeCampaignDate(payload.startsAt),
        startsAtTime: sanitizeCampaignTime(payload.startsAtTime),
        endsAt: sanitizeCampaignDate(payload.endsAt),
        endsAtTime: sanitizeCampaignTime(payload.endsAtTime),
        packPrices,
        featuredPromotion: sanitizeCampaignFeaturedPromotion(
            payload.featuredPromotion,
            packPrices.map((item) => item.quantity),
        ),
        coupons: sanitizeCoupons(payload.coupons),
        midias: sanitizeCampaignMidias(payload.midias ?? payload.media),
    }
}

function createDefaultCampaignSettings(): CampaignSettings {
    return {
        id: CAMPAIGN_DOC_ID,
        title: DEFAULT_CAMPAIGN_TITLE,
        pricePerCota: DEFAULT_TICKET_PRICE,
        mainPrize: DEFAULT_MAIN_PRIZE,
        secondPrize: DEFAULT_SECOND_PRIZE,
        bonusPrize: DEFAULT_BONUS_PRIZE,
        totalNumbers: DEFAULT_TOTAL_NUMBERS,
        additionalPrizes: DEFAULT_ADDITIONAL_PRIZES,
        supportWhatsappNumber: DEFAULT_SUPPORT_WHATSAPP_NUMBER,
        whatsappContactMessage: undefined,
        status: DEFAULT_CAMPAIGN_STATUS,
        startsAt: null,
        startsAtTime: null,
        endsAt: null,
        endsAtTime: null,
        packPrices: buildDefaultCampaignPackPrices(DEFAULT_TICKET_PRICE),
        featuredPromotion: null,
        coupons: [],
        midias: getDefaultCampaignMidias(),
    }
}

export function useCampaignSettings() {
    const [campaign, setCampaign] = useState<CampaignSettings>(createDefaultCampaignSettings())
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
                    setCampaign(createDefaultCampaignSettings())
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
                const pricePerCota = sanitizePricePerCota(payload.pricePerCota)
                const packPrices = sanitizeCampaignPackPrices(payload.packPrices, pricePerCota)

                setCampaign({
                    id: payload.campaignId,
                    title: sanitizeCampaignTitle(payload.title),
                    pricePerCota,
                    mainPrize: sanitizePrizeText(payload.mainPrize, DEFAULT_MAIN_PRIZE),
                    secondPrize: sanitizePrizeText(payload.secondPrize, DEFAULT_SECOND_PRIZE),
                    bonusPrize: sanitizePrizeText(payload.bonusPrize, DEFAULT_BONUS_PRIZE),
                    totalNumbers: sanitizeTotalNumbers(payload.totalNumbers),
                    additionalPrizes: Array.isArray(payload.additionalPrizes)
                        ? payload.additionalPrizes.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
                        : DEFAULT_ADDITIONAL_PRIZES,
                    supportWhatsappNumber: sanitizeSupportWhatsappNumber(payload.supportWhatsappNumber),
                    whatsappContactMessage: typeof payload.whatsappContactMessage === 'string'
                        ? payload.whatsappContactMessage.trim().slice(0, 500)
                        : undefined,
                    status: sanitizeCampaignStatus(payload.status),
                    startsAt: sanitizeCampaignDate(payload.startsAt),
                    startsAtTime: sanitizeCampaignTime(payload.startsAtTime),
                    endsAt: sanitizeCampaignDate(payload.endsAt),
                    endsAtTime: sanitizeCampaignTime(payload.endsAtTime),
                    packPrices,
                    featuredPromotion: sanitizeCampaignFeaturedPromotion(
                        payload.featuredPromotion,
                        packPrices.map((item) => item.quantity),
                    ),
                    coupons: sanitizeCoupons(payload.coupons),
                    midias: sanitizeCampaignMidias(payload.midias),
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
                totalNumbers: DEFAULT_TOTAL_NUMBERS,
                additionalPrizes: DEFAULT_ADDITIONAL_PRIZES,
                supportWhatsappNumber: DEFAULT_SUPPORT_WHATSAPP_NUMBER,
                whatsappContactMessage: undefined,
                status: DEFAULT_CAMPAIGN_STATUS,
                startsAt: null,
                startsAtTime: null,
                endsAt: null,
                endsAtTime: null,
                packPrices: buildDefaultCampaignPackPrices(DEFAULT_TICKET_PRICE),
                featuredPromotion: null,
                coupons: [],
                midias: getDefaultCampaignMidias(),
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
