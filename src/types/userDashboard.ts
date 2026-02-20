export type Section = 'numeros' | 'comprovantes'
export type TicketStatus = 'pago' | 'aguardando' | 'cancelado'

export type MockTicket = {
  number: string
  orderId: string
  date: string
  status: TicketStatus
}

export type MockOrder = {
  id: string
  cotas: number
  totalBrl: string
  date: string
  status: TicketStatus
}

export type TicketFilter = 'Todos' | 'Pagos' | 'Aguardando' | 'Cancelados'
export type ReceiptFilter = 'Todos' | 'Aprovados' | 'Pendentes' | 'Cancelados'

export type DashboardNavItem = {
  icon: string
  label: string
  section: Section | null
}
