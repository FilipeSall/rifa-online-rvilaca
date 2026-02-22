export const CAMPAIGN_DOC_ID = 'campanha-bmw-r1200-gs-2026'
export const DEFAULT_CAMPAIGN_TITLE = 'Sorteio BMW R1200 GS'
export const DEFAULT_TICKET_PRICE = 0.99
export const DEFAULT_MAIN_PRIZE = 'BMW R1200 GS 2015/2016'
export const DEFAULT_SECOND_PRIZE = 'Honda CG Start 160 2026/2026'
export const DEFAULT_BONUS_PRIZE = '20 PIX de R$ 1.000'
export const DEFAULT_CAMPAIGN_STATUS = 'active' as const

export const CAMPAIGN_STATUS_OPTIONS = [
  { value: 'active', label: 'Ativa' },
  { value: 'scheduled', label: 'Agendada' },
  { value: 'paused', label: 'Pausada' },
  { value: 'finished', label: 'Encerrada' },
] as const
