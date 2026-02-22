export type Section = 'numeros' | 'comprovantes'
export type TicketStatus = 'pago' | 'aguardando' | 'cancelado'

export type UserTicket = {
  number: string
  numericNumber: number
  orderId: string
  date: string
  status: TicketStatus
  createdAtMs: number | null
}

export type UserOrder = {
  id: string
  cotas: number
  numbers: number[]
  amount: number | null
  totalBrl: string
  date: string
  status: TicketStatus
  copyPaste: string | null
  createdAtMs: number | null
  campaignId: string | null
}

export type TicketFilter = 'Todos' | 'Pagos' | 'Aguardando' | 'Cancelados'
export type ReceiptFilter = 'Todos' | 'Aprovados' | 'Pendentes' | 'Cancelados'

export type DashboardNavItem = {
  icon: string
  label: string
  section: Section | null
}
