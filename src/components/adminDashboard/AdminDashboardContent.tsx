import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ADMIN_KPIS,
  ADMIN_ORDERS,
  ADMIN_TABS,
  CAMPAIGN_DRAFT,
  CONVERSION_SERIES,
  FINANCIAL_ENTRIES,
  SALES_SERIES,
  type AdminTabId,
  type OrderStatus,
} from '../../const/adminDashboard'

type AdminDashboardContentProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
  onSignOut: () => void
}

type MetricKey = keyof typeof ADMIN_KPIS

const KPI_CARDS = [
  {
    id: 'faturamento',
    label: 'Faturamento Total',
    icon: 'payments',
    metricKey: 'totalRevenue' as MetricKey,
    value: (value: number) => formatCurrency(value),
    tone: 'from-emerald-400/20 to-emerald-500/5',
  },
  {
    id: 'vendidos',
    label: 'Numeros Vendidos',
    icon: 'confirmation_number',
    metricKey: 'soldNumbers' as MetricKey,
    value: (value: number) => formatInteger(Math.round(value)),
    tone: 'from-gold/30 to-gold/5',
  },
  {
    id: 'disponiveis',
    label: 'Numeros Disponiveis',
    icon: 'inventory_2',
    metricKey: 'availableNumbers' as MetricKey,
    value: (value: number) => formatInteger(Math.round(value)),
    tone: 'from-sky-400/20 to-sky-500/5',
  },
  {
    id: 'conversao',
    label: 'Conversao',
    icon: 'timeline',
    metricKey: 'conversionRate' as MetricKey,
    value: (value: number) => `${value.toFixed(1)}%`,
    tone: 'from-violet-400/20 to-violet-500/5',
  },
  {
    id: 'ticket',
    label: 'Ticket Medio',
    icon: 'shopping_cart',
    metricKey: 'avgTicket' as MetricKey,
    value: (value: number) => formatCurrency(value),
    tone: 'from-amber-300/20 to-amber-500/5',
  },
  {
    id: 'vendas-dia',
    label: 'Vendas por Dia',
    icon: 'show_chart',
    metricKey: 'dailyOrders' as MetricKey,
    value: (value: number) => formatInteger(Math.round(value)),
    tone: 'from-rose-400/20 to-rose-500/5',
  },
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function getOrderStatusClass(status: OrderStatus) {
  if (status === 'pago') {
    return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
  }

  if (status === 'pendente') {
    return 'border-amber-300/30 bg-amber-500/15 text-amber-100'
  }

  return 'border-rose-400/30 bg-rose-500/15 text-rose-200'
}

function ConversionTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const entry = payload[0]
  const stage = String(entry.payload?.stage ?? entry.name ?? 'Etapa')
  const value = Number(entry.value ?? 0)

  return (
    <div className="rounded-xl border border-gold/35 bg-[rgba(20,20,20,0.96)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-gold">{stage}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}%</p>
    </div>
  )
}

function useCountUp(targetValue: number, durationMs = 1600) {
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    const start = performance.now()
    let frameId = 0

    const tick = (now: number) => {
      const elapsed = now - start
      const linearProgress = Math.min(elapsed / durationMs, 1)
      const easedProgress = 1 - (1 - linearProgress) ** 3
      setAnimatedValue(targetValue * easedProgress)

      if (linearProgress < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [durationMs, targetValue])

  return animatedValue
}

type KpiCardProps = {
  card: (typeof KPI_CARDS)[number]
  index: number
}

function KpiCard({ card, index }: KpiCardProps) {
  const targetValue = Number(ADMIN_KPIS[card.metricKey] ?? 0)
  const animatedValue = useCountUp(targetValue)

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-luxury-card p-5 transition-all duration-500 hover:-translate-y-1 hover:border-gold/35 hover:shadow-glow-gold"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.tone} opacity-80`} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">{card.label}</p>
          <p className="mt-3 text-3xl font-black text-white">{card.value(animatedValue)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-gold">
          <span className="material-symbols-outlined">{card.icon}</span>
        </div>
      </div>
    </article>
  )
}

function DashboardTab() {
  const [areChartsReady, setAreChartsReady] = useState(false)
  const [isRevenueAnimationActive, setIsRevenueAnimationActive] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAreChartsReady(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!areChartsReady) {
      return
    }

    setIsRevenueAnimationActive(true)

    const timer = window.setTimeout(() => {
      setIsRevenueAnimationActive(false)
    }, 1200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [areChartsReady])

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {KPI_CARDS.map((card, index) => (
          <KpiCard key={card.id} card={card} index={index} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <article className="flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-luxury text-xl font-bold text-white">Faturamento por dia</h3>
          </div>
          <div className="h-[360px] min-w-0 xl:flex-1">
            {areChartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart
                  data={SALES_SERIES}
                  margin={{ top: 8, right: 10, bottom: 6, left: 6 }}
                >
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F5A800" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#F5A800" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 8" />
                  <XAxis
                    axisLine={false}
                    dataKey="day"
                    height={32}
                    padding={{ left: 12, right: 12 }}
                    tick={{ fill: '#a3a3a3', fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={['dataMin - 12000', 'dataMax + 12000']}
                    tick={{ fill: '#a3a3a3', fontSize: 12 }}
                    tickFormatter={(value) => `R$${Number(value / 1000).toFixed(0)}k`}
                    tickLine={false}
                    tickMargin={10}
                    width={58}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(20, 20, 20, 0.96)',
                      border: '1px solid rgba(245, 168, 0, 0.25)',
                      borderRadius: '12px',
                      color: '#fff',
                    }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 700 }}
                    formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Faturamento']}
                    labelStyle={{ color: '#f5a800', fontWeight: 700 }}
                  />
                  <Area
                    dataKey="revenue"
                    fill="url(#revenueGradient)"
                    isAnimationActive={isRevenueAnimationActive}
                    animationDuration={1000}
                    animationEasing="ease-out"
                    stroke="#F5A800"
                    strokeWidth={3}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
        </article>

        <article className="flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-luxury-card p-5 xl:col-span-5">
          <h3 className="font-luxury text-xl font-bold text-white">Funil de conversao</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">Visita ate pagamento</p>
          <div className="h-72 min-w-0 pt-2">
            {areChartsReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={CONVERSION_SERIES}
                    cx="50%"
                    cy="50%"
                    dataKey="value"
                    nameKey="stage"
                    innerRadius={55}
                    outerRadius={98}
                    isAnimationActive
                    animationBegin={120}
                    animationDuration={900}
                    animationEasing="ease-out"
                    paddingAngle={3}
                  >
                    {CONVERSION_SERIES.map((entry) => (
                      <Cell key={entry.stage} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={ConversionTooltip}
                    cursor={false}
                    isAnimationActive={false}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CONVERSION_SERIES.map((entry) => (
              <div key={entry.stage} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500">{entry.stage}</p>
                <p className="mt-1 text-sm font-bold text-white">{entry.value}%</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-luxury-card p-5">
        <h3 className="font-luxury text-xl font-bold text-white">Volume de pedidos por dia</h3>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">Suporte a picos de acesso</p>
        <div className="mt-4 h-72 min-w-0">
          {areChartsReady ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={SALES_SERIES}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 8" vertical={false} />
                <XAxis axisLine={false} dataKey="day" tick={{ fill: '#a3a3a3', fontSize: 12 }} tickLine={false} />
                <YAxis axisLine={false} tick={{ fill: '#a3a3a3', fontSize: 12 }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(20, 20, 20, 0.96)',
                    border: '1px solid rgba(245, 168, 0, 0.2)',
                    borderRadius: '12px',
                    color: '#fff',
                  }}
                  itemStyle={{ color: '#f8fafc', fontWeight: 700 }}
                  formatter={(value) => [`${formatInteger(Number(value ?? 0))} pedidos`, 'Pedidos']}
                  labelStyle={{ color: '#f5a800', fontWeight: 700 }}
                />
                <Bar
                  dataKey="orders"
                  fill="#F5A800"
                  isAnimationActive={false}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
          )}
        </div>
      </section>
    </div>
  )
}

function OrdersTab() {
  return (
    <section className="rounded-2xl border border-white/10 bg-luxury-card p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-luxury text-2xl font-bold text-white">Gestao de pedidos</h3>
          <p className="mt-1 text-sm text-gray-400">Lista de compradores, status de pagamento e acoes operacionais.</p>
        </div>
        <button
          className="inline-flex h-10 items-center rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-bold uppercase tracking-[0.16em] text-gold hover:bg-gold/20"
          type="button"
        >
          Exportar relatorio
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-black/30 text-left text-[10px] uppercase tracking-[0.2em] text-gray-400">
            <tr>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Comprador</th>
              <th className="px-4 py-3">Cotas</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ADMIN_ORDERS.map((order) => (
              <tr key={order.id} className="bg-luxury-bg/60 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-bold text-white">{order.id}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">{order.buyer}</p>
                  <p className="text-xs text-gray-500">{order.createdAt}</p>
                </td>
                <td className="px-4 py-3 text-white">{order.quantity}</td>
                <td className="px-4 py-3 text-gold">{formatCurrency(order.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${getOrderStatusClass(order.status)}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button className="rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:border-gold/40" type="button">
                      Reenviar
                    </button>
                    <button className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-200 hover:bg-rose-500/20" type="button">
                      Cancelar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CampaignTab() {
  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-white/10 bg-luxury-card p-5">
        <h3 className="font-luxury text-2xl font-bold text-white">Gestao da campanha</h3>
        <p className="mt-2 text-sm text-gray-400">Edicao de premios, data do sorteio, preco da cota e regulamento.</p>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-luxury-card p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Premios</p>
          <div className="mt-4 space-y-3 text-sm text-white">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">1o premio</p>
              <p className="mt-1 font-semibold">{CAMPAIGN_DRAFT.mainPrize}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">2o premio</p>
              <p className="mt-1 font-semibold">{CAMPAIGN_DRAFT.secondPrize}</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-luxury-card p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Data do sorteio</p>
              <p className="mt-1 text-lg font-bold text-white">{CAMPAIGN_DRAFT.drawDate}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Preco da cota</p>
              <p className="mt-1 text-lg font-bold text-gold">{formatCurrency(CAMPAIGN_DRAFT.ticketPrice)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Regulamento</p>
              <p className="mt-1 text-lg font-bold text-white">{CAMPAIGN_DRAFT.regulationVersion}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center rounded-lg bg-gold px-4 text-xs font-black uppercase tracking-[0.14em] text-black hover:bg-gold-hover" type="button">
              Salvar alteracoes
            </button>
            <button className="inline-flex h-10 items-center rounded-lg border border-white/20 bg-black/25 px-4 text-xs font-bold uppercase tracking-[0.14em] text-white hover:border-gold/30" type="button">
              Upload de imagens
            </button>
          </div>
        </article>
      </div>
    </section>
  )
}

function FinanceTab() {
  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-white/10 bg-luxury-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-luxury text-2xl font-bold text-white">Gestao financeira</h3>
            <p className="mt-2 text-sm text-gray-400">Extrato de pagamentos, conciliacao PIX e exportacao de planilhas.</p>
          </div>
          <button className="inline-flex h-10 items-center rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-gold hover:bg-gold/20" type="button">
            Exportar planilha
          </button>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <article className="rounded-xl border border-white/10 bg-luxury-card p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Bruto acumulado</p>
          <p className="mt-2 text-2xl font-black text-white">{formatCurrency(596773.69)}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-luxury-card p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Liquido acumulado</p>
          <p className="mt-2 text-2xl font-black text-emerald-300">{formatCurrency(584787.6)}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-luxury-card p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Taxas gateway</p>
          <p className="mt-2 text-2xl font-black text-amber-200">{formatCurrency(11986.09)}</p>
        </article>
      </div>

      <article className="overflow-x-auto rounded-2xl border border-white/10 bg-luxury-card">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-black/30 text-left text-[10px] uppercase tracking-[0.2em] text-gray-400">
            <tr>
              <th className="px-4 py-3">Movimento</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Bruto</th>
              <th className="px-4 py-3">Taxas</th>
              <th className="px-4 py-3">Liquido</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {FINANCIAL_ENTRIES.map((entry) => (
              <tr key={entry.id} className="bg-luxury-bg/60 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-bold text-white">{entry.id}</td>
                <td className="px-4 py-3 text-white">{entry.date}</td>
                <td className="px-4 py-3 text-white">{formatCurrency(entry.grossAmount)}</td>
                <td className="px-4 py-3 text-amber-200">-{formatCurrency(entry.fees)}</td>
                <td className="px-4 py-3 text-emerald-200">{formatCurrency(entry.netAmount)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      entry.status === 'conciliado'
                        ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                        : 'border-amber-300/30 bg-amber-500/15 text-amber-100'
                    }`}
                  >
                    {entry.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  )
}

export default function AdminDashboardContent({ activeTab, onTabChange, onSignOut }: AdminDashboardContentProps) {
  return (
    <div className="flex min-h-[calc(100vh-80px)] bg-luxury-bg">
      <aside className="sticky top-20 hidden min-h-[calc(100vh-80px)] w-72 flex-col border-r border-white/10 bg-luxury-card/80 p-5 backdrop-blur-md lg:flex">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.24em] text-gold">Painel administrativo</p>
        <div className="space-y-1">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                activeTab === tab.id
                  ? 'border-gold/35 bg-gold/15 text-gold shadow-glow-gold'
                  : 'border-transparent text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white'
              }`}
              type="button"
              onClick={() => onTabChange(tab.id)}
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              <span className="text-sm font-semibold uppercase tracking-[0.1em]">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Status da operacao</p>
          <p className="mt-2 text-sm font-semibold text-white">Webhook PIX ativo</p>
          <p className="mt-1 text-xs text-emerald-300">Conexao estavel</p>
        </div>

        <button
          className="mt-auto inline-flex h-11 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-bold uppercase tracking-[0.14em] text-rose-200 hover:bg-rose-500/20"
          type="button"
          onClick={onSignOut}
        >
          Sair da conta
        </button>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-luxury-card p-1 lg:hidden">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex-1 rounded-lg py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                activeTab === tab.id ? 'bg-gold text-black' : 'text-gray-400'
              }`}
              type="button"
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'dashboard' ? <DashboardTab /> : null}
          {activeTab === 'pedidos' ? <OrdersTab /> : null}
          {activeTab === 'campanha' ? <CampaignTab /> : null}
          {activeTab === 'financeiro' ? <FinanceTab /> : null}
        </div>
      </main>
    </div>
  )
}
