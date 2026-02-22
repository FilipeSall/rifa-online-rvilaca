import type { OrderDocument } from '../types/order'
import { mapOrderDocToAdminRow, type AdminOrderRow, type AdminOrderStatus } from '../utils/adminOrders'

export type AdminTabId = 'dashboard' | 'campanha'

export type AdminTab = {
  id: AdminTabId
  label: string
  icon: string
}

export type SalesPoint = {
  day: string
  revenue: number
  orders: number
}

export type ConversionPoint = {
  stage: string
  value: number
  fill: string
}

export type OrderStatus = AdminOrderStatus
export type AdminOrder = AdminOrderRow

export type FinancialEntry = {
  id: string
  date: string
  grossAmount: number
  netAmount: number
  fees: number
  status: 'conciliado' | 'pendente'
}

export const ADMIN_TABS: AdminTab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'campanha', label: 'Campanha', icon: 'campaign' },
]

export const ADMIN_KPIS = {
  totalRevenue: 1489240.9,
  soldNumbers: 2242500,
  availableNumbers: 1207500,
  conversionRate: 18.9,
  avgTicket: 66.4,
  dailyOrders: 912,
}

export const SALES_SERIES: SalesPoint[] = [
  { day: 'Seg', revenue: 112340, orders: 712 },
  { day: 'Ter', revenue: 124050, orders: 764 },
  { day: 'Qua', revenue: 135870, orders: 812 },
  { day: 'Qui', revenue: 141920, orders: 856 },
  { day: 'Sex', revenue: 158200, orders: 934 },
  { day: 'Sab', revenue: 172450, orders: 988 },
  { day: 'Dom', revenue: 188610, orders: 1056 },
]

export const CONVERSION_SERIES: ConversionPoint[] = [
  { stage: 'Visitas', value: 100, fill: '#1f2937' },
  { stage: 'Selecao', value: 46, fill: '#f5a800' },
  { stage: 'Reserva', value: 31, fill: '#f2b83a' },
  { stage: 'Pagamento', value: 19, fill: '#ffcc4d' },
]

function buildReservedNumbers(start: number, quantity: number) {
  return Array.from({ length: quantity }, (_, index) => start + index)
}

export const ADMIN_ORDER_DOCUMENTS_MOCK: OrderDocument[] = [
  {
    externalId: 'PED-01914',
    userId: 'u_carlos_lima',
    type: 'deposit',
    payerName: 'Carlos Lima',
    amount: 118.8,
    status: 'paid',
    reservedNumbers: buildReservedNumbers(540001, 120),
    createdAt: '2026-02-22T12:20:00-03:00',
    updatedAt: '2026-02-22T12:20:00-03:00',
  },
  {
    externalId: 'PED-01913',
    userId: 'u_luana_pires',
    type: 'deposit',
    payerName: 'Luana Pires',
    amount: 79.2,
    status: 'pending',
    reservedNumbers: buildReservedNumbers(540300, 80),
    createdAt: '2026-02-22T12:11:00-03:00',
    updatedAt: '2026-02-22T12:11:00-03:00',
  },
  {
    externalId: 'PED-01912',
    userId: 'u_marta_souza',
    type: 'deposit',
    payerName: 'Marta Souza',
    amount: 39.6,
    status: 'paid',
    reservedNumbers: buildReservedNumbers(540500, 40),
    createdAt: '2026-02-22T12:07:00-03:00',
    updatedAt: '2026-02-22T12:07:00-03:00',
  },
  {
    externalId: 'PED-01911',
    userId: 'u_joao_arantes',
    type: 'deposit',
    payerName: 'Joao Arantes',
    amount: 24.75,
    status: 'failed',
    reservedNumbers: buildReservedNumbers(540700, 25),
    failureReason: 'missing_pix_payload',
    createdAt: '2026-02-22T11:55:00-03:00',
    updatedAt: '2026-02-22T11:55:00-03:00',
  },
  {
    externalId: 'PED-01910',
    userId: 'u_pedro_alves',
    type: 'deposit',
    payerName: 'Pedro Alves',
    amount: 198,
    status: 'paid',
    reservedNumbers: buildReservedNumbers(541000, 200),
    createdAt: '2026-02-22T11:42:00-03:00',
    updatedAt: '2026-02-22T11:42:00-03:00',
  },
]

export const ADMIN_ORDERS: AdminOrder[] = ADMIN_ORDER_DOCUMENTS_MOCK.map(mapOrderDocToAdminRow)

export const FINANCIAL_ENTRIES: FinancialEntry[] = [
  { id: 'MOV-8841', date: '22/02/2026', grossAmount: 221430.32, netAmount: 216981.71, fees: 4448.61, status: 'conciliado' },
  { id: 'MOV-8837', date: '21/02/2026', grossAmount: 198210.77, netAmount: 194228.94, fees: 3981.83, status: 'conciliado' },
  { id: 'MOV-8833', date: '20/02/2026', grossAmount: 177132.6, netAmount: 173576.95, fees: 3555.65, status: 'pendente' },
]

export const CAMPAIGN_DRAFT = {
  drawDate: '15/03/2026',
  ticketPrice: 0.99,
  regulationVersion: 'v2.3',
  mainPrize: 'BMW R1200 GS 2015/2016',
  secondPrize: 'Honda CG Start 160 2026/2026',
}
