export const CAMPAIGN_DOC_ID = 'campanha-bmw-r1200-gs-2026'
export const DEFAULT_CAMPAIGN_TITLE = 'Sorteio BMW R1200 GS'
export const DEFAULT_TICKET_PRICE = 0.15
export const DEFAULT_MAIN_PRIZE = 'BMW R1200 GS 2015/2016'
export const DEFAULT_SECOND_PRIZE = 'Honda CG Start 160 2026/2026'
export const DEFAULT_BONUS_PRIZE = '20 PIX de R$ 1.000'
export const DEFAULT_TOTAL_NUMBERS = 3_450_000
export const DEFAULT_ADDITIONAL_PRIZES: string[] = []
export const DEFAULT_SUPPORT_WHATSAPP_NUMBER = '+55 62 8507-4477'
export const DEFAULT_CAMPAIGN_STATUS = 'active' as const
export const DEFAULT_TOP_BUYERS_DRAW_DAY_OF_WEEK = 5 as const
export const DEFAULT_TOP_BUYERS_DRAW_TIME = '14:00' as const
export const TOP_BUYERS_SCHEDULE_TIMEZONE = 'America/Sao_Paulo' as const
export const CAMPAIGN_PACK_QUANTITIES = [20, 50, 100, 250, 350, 500, 750, 1000] as const
export const DEFAULT_CAMPAIGN_FEATURED_PROMOTION = {
  active: true,
  targetQuantity: 500,
  discountType: 'percent',
  discountValue: 5,
  label: 'Mais compradas',
} as const

export const CAMPAIGN_STATUS_OPTIONS = [
  { value: 'active', label: 'Ativa' },
  { value: 'scheduled', label: 'Agendada' },
  { value: 'paused', label: 'Pausada' },
  { value: 'finished', label: 'Encerrada' },
] as const

export const TOP_BUYERS_WEEKDAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
] as const

export function buildDefaultCampaignPackPrices(unitPrice: number = DEFAULT_TICKET_PRICE) {
  return CAMPAIGN_PACK_QUANTITIES.map((quantity) => ({
    quantity,
    price: Number((quantity * unitPrice).toFixed(2)),
    active: true,
    mostPurchasedTag: quantity === 100,
  }))
}
