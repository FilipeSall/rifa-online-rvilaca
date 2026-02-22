export const REGION = 'southamerica-east1'
export const HORSEPAY_BASE_URL = 'https://api.horsepay.io'

export type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'
export type OrderStatus = 'pending' | 'paid' | 'failed'
export type OrderType = 'deposit' | 'withdraw'

export const MAX_DEPOSIT_ORDER_ATTEMPTS = 3
export const DEPOSIT_RETRY_DELAY_MS = 1200

export const RESERVATION_DURATION_MS = 5 * 60 * 1000
export const DEFAULT_MIN_PURCHASE_QUANTITY = 10
export const MAX_PURCHASE_QUANTITY = 300
export const RAFFLE_NUMBER_START = 1
export const RAFFLE_NUMBER_END = 3_450_000
export const DEFAULT_NUMBER_WINDOW_PAGE_SIZE = 100
export const MAX_NUMBER_WINDOW_PAGE_SIZE = 240

export const CAMPAIGN_DOC_ID = 'campanha-bmw-r1200-gs-2026'
export const DEFAULT_CAMPAIGN_TITLE = 'Sorteio BMW R1200 GS'
export const DEFAULT_PRICE_PER_COTA = 0.99
export const DEFAULT_MAIN_PRIZE = 'BMW R1200 GS 2015/2016'
export const DEFAULT_SECOND_PRIZE = 'Honda CG Start 160 2026/2026'
export const DEFAULT_BONUS_PRIZE = '20 PIX de R$ 1.000'
export const DEFAULT_CAMPAIGN_STATUS = 'active'
export const CAMPAIGN_STATUS_VALUES = ['active', 'scheduled', 'paused', 'finished'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUS_VALUES)[number]
