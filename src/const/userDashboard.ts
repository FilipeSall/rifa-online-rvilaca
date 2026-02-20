import type {
  DashboardNavItem,
  MockOrder,
  MockTicket,
  ReceiptFilter,
  TicketFilter,
} from '../types/userDashboard'

export const MOCK_TICKETS: MockTicket[] = [
  { number: '054231', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '089142', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '1345820', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '2891034', orderId: 'PED-0051', date: '18 Fev 2026, 09:15', status: 'aguardando' },
  { number: '0023445', orderId: 'PED-0029', date: '10 Jan 2026, 10:00', status: 'cancelado' },
]

export const MOCK_ORDERS: MockOrder[] = [
  { id: 'PED-0042', cotas: 3, totalBrl: 'R$ 7,50', date: '15 Fev 2026, 14:30', status: 'pago' },
  { id: 'PED-0051', cotas: 1, totalBrl: 'R$ 2,50', date: '18 Fev 2026, 09:15', status: 'aguardando' },
  { id: 'PED-0029', cotas: 5, totalBrl: 'R$ 12,50', date: '10 Jan 2026, 10:00', status: 'cancelado' },
]

export const TICKET_FILTERS: TicketFilter[] = ['Todos', 'Pagos', 'Aguardando', 'Cancelados']
export const RECEIPT_FILTERS: ReceiptFilter[] = ['Todos', 'Aprovados', 'Pendentes', 'Cancelados']

export const NAV_ITEMS: DashboardNavItem[] = [
  { icon: 'confirmation_number', label: 'Meus Numeros', section: 'numeros' },
  { icon: 'receipt_long', label: 'Comprovantes', section: 'comprovantes' },
  { icon: 'emoji_events', label: 'Resultados', section: null },
]
