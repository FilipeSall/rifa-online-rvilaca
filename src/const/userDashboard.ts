import type {
  DashboardNavItem,
  ReceiptFilter,
  TicketFilter,
} from '../types/userDashboard'

export const TICKET_FILTERS: TicketFilter[] = ['Todos', 'Pagos', 'Aguardando', 'Cancelados']
export const RECEIPT_FILTERS: ReceiptFilter[] = ['Todos', 'Aprovados', 'Pendentes', 'Cancelados']

export const NAV_ITEMS: DashboardNavItem[] = [
  { icon: 'confirmation_number', label: 'Meus Numeros', section: 'numeros' },
  { icon: 'receipt_long', label: 'Comprovantes', section: 'comprovantes' },
  { icon: 'emoji_events', label: 'Resultados', section: null },
]
