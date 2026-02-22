export type AdminTabId = 'dashboard' | 'pedidos' | 'campanha' | 'financeiro'

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

export type OrderStatus = 'pago' | 'pendente' | 'cancelado'

export type AdminOrder = {
  id: string
  buyer: string
  quantity: number
  amount: number
  status: OrderStatus
  createdAt: string
}

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
  { id: 'pedidos', label: 'Pedidos', icon: 'receipt_long' },
  { id: 'campanha', label: 'Campanha', icon: 'campaign' },
  { id: 'financeiro', label: 'Financeiro', icon: 'account_balance_wallet' },
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

export const ADMIN_ORDERS: AdminOrder[] = [
  { id: 'PED-01914', buyer: 'Carlos Lima', quantity: 120, amount: 118.8, status: 'pago', createdAt: '22/02/2026 12:20' },
  { id: 'PED-01913', buyer: 'Luana Pires', quantity: 80, amount: 79.2, status: 'pendente', createdAt: '22/02/2026 12:11' },
  { id: 'PED-01912', buyer: 'Marta Souza', quantity: 40, amount: 39.6, status: 'pago', createdAt: '22/02/2026 12:07' },
  { id: 'PED-01911', buyer: 'Joao Arantes', quantity: 25, amount: 24.75, status: 'cancelado', createdAt: '22/02/2026 11:55' },
  { id: 'PED-01910', buyer: 'Pedro Alves', quantity: 200, amount: 198, status: 'pago', createdAt: '22/02/2026 11:42' },
]

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
