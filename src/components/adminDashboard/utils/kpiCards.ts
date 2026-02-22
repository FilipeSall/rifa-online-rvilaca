import { ADMIN_KPIS } from '../../../const/adminDashboard'
import { formatCurrency, formatInteger } from './formatters'

type MetricKey = keyof typeof ADMIN_KPIS

export type KpiCardConfig = {
  id: string
  label: string
  icon: string
  metricKey: MetricKey
  value: (value: number) => string
  tone: string
}

export const KPI_CARDS: KpiCardConfig[] = [
  {
    id: 'faturamento',
    label: 'Faturamento Total',
    icon: 'payments',
    metricKey: 'totalRevenue',
    value: (value: number) => formatCurrency(value),
    tone: 'from-emerald-400/20 to-emerald-500/5',
  },
  {
    id: 'vendidos',
    label: 'Numeros Vendidos',
    icon: 'confirmation_number',
    metricKey: 'soldNumbers',
    value: (value: number) => formatInteger(Math.round(value)),
    tone: 'from-gold/30 to-gold/5',
  },
  {
    id: 'disponiveis',
    label: 'Numeros Disponiveis',
    icon: 'inventory_2',
    metricKey: 'availableNumbers',
    value: (value: number) => formatInteger(Math.round(value)),
    tone: 'from-sky-400/20 to-sky-500/5',
  },
  {
    id: 'conversao',
    label: 'Conversao',
    icon: 'timeline',
    metricKey: 'conversionRate',
    value: (value: number) => `${value.toFixed(1)}%`,
    tone: 'from-violet-400/20 to-violet-500/5',
  },
  {
    id: 'ticket',
    label: 'Ticket Medio',
    icon: 'shopping_cart',
    metricKey: 'avgTicket',
    value: (value: number) => formatCurrency(value),
    tone: 'from-amber-300/20 to-amber-500/5',
  },
  {
    id: 'vendas-dia',
    label: 'Vendas por Dia',
    icon: 'show_chart',
    metricKey: 'dailyOrders',
    value: (value: number) => formatInteger(Math.round(value)),
    tone: 'from-rose-400/20 to-rose-500/5',
  },
]
