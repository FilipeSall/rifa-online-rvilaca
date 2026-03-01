import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboardCharts } from '../hooks/useDashboardCharts'
import { useDashboardSummary } from '../hooks/useDashboardSummary'
import { formatCurrency, formatInteger } from '../utils/formatters'
import { KPI_CARDS } from '../utils/kpiCards'
import ConversionTooltip from './ConversionTooltip'
import KpiCard from './KpiCard'

const DEFAULT_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(20, 20, 20, 0.96)',
  border: '1px solid rgba(255, 0, 204, 0.25)',
  borderRadius: '12px',
  color: '#fff',
}

const DEFAULT_TOOLTIP_ITEM_STYLE = { color: '#f8fafc', fontWeight: 700 }
const DEFAULT_TOOLTIP_LABEL_STYLE = { color: '#ff00cc', fontWeight: 700 }

const BAR_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(20, 20, 20, 0.96)',
  border: '1px solid rgba(255, 0, 204, 0.2)',
  borderRadius: '12px',
  color: '#fff',
}

export default function DashboardTab() {
  const { isLoading, errorMessage, salesSeries, distributionSeries, kpis } = useDashboardSummary()
  const {
    revenueContainer,
    conversionContainer,
    volumeContainer,
    isRevenueAnimationActive,
    canRenderRevenueChart,
    canRenderConversionChart,
    canRenderVolumeChart,
  } = useDashboardCharts()
  const isInitialLoading = isLoading && salesSeries.length === 0 && !errorMessage

  return (
    <div className="space-y-6">
      {isInitialLoading ? (
        <section className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          <div className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-100 border-t-transparent" />
            Carregando dados do dashboard...
          </div>
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm text-amber-100">
          Falha ao carregar dashboard em tempo real: {errorMessage}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isInitialLoading
          ? KPI_CARDS.map((card) => (
            <article key={card.id} className="rounded-2xl border border-white/10 bg-luxury-card p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-8 w-32 animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-3 w-40 animate-pulse rounded bg-white/10" />
            </article>
          ))
          : KPI_CARDS.map((card, index) => (
            <KpiCard key={card.id} card={card} kpis={kpis} index={index} />
          ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <article className="flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-display text-xl font-bold text-white">Faturamento por dia</h3>
          </div>
          <div ref={revenueContainer.ref} className="h-[360px] min-w-0 xl:flex-1">
            {isInitialLoading ? (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            ) : canRenderRevenueChart ? (
              <AreaChart
                width={Math.floor(revenueContainer.size.width)}
                height={Math.floor(revenueContainer.size.height)}
                data={salesSeries}
                margin={{ top: 8, right: 10, bottom: 6, left: 6 }}
              >
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff00cc" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#ff00cc" stopOpacity={0.05} />
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
                  domain={[
                    (dataMin: number) => Math.max(0, dataMin - 12000),
                    (dataMax: number) => dataMax + 12000,
                  ]}
                  tick={{ fill: '#a3a3a3', fontSize: 12 }}
                  tickFormatter={(value) => `R$${Number(value / 1000).toFixed(0)}k`}
                  tickLine={false}
                  tickMargin={10}
                  width={58}
                />
                <Tooltip
                  contentStyle={DEFAULT_TOOLTIP_STYLE}
                  itemStyle={DEFAULT_TOOLTIP_ITEM_STYLE}
                  formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Faturamento']}
                  labelStyle={DEFAULT_TOOLTIP_LABEL_STYLE}
                />
                <Area
                  dataKey="revenue"
                  fill="url(#revenueGradient)"
                  isAnimationActive={isRevenueAnimationActive}
                  animationDuration={1000}
                  animationEasing="ease-out"
                  stroke="#ff00cc"
                  strokeWidth={3}
                  type="monotone"
                />
              </AreaChart>
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
        </article>

        <article className="flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-luxury-card p-5 xl:col-span-5">
          <h3 className="font-display text-xl font-bold text-white">Funil de conversao</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">Distribuicao real dos volumes</p>
          <div ref={conversionContainer.ref} className="h-72 min-w-0 pt-2">
            {isInitialLoading ? (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            ) : canRenderConversionChart ? (
              <PieChart
                width={Math.floor(conversionContainer.size.width)}
                height={Math.floor(conversionContainer.size.height)}
              >
                <Pie
                  data={distributionSeries}
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
                  {distributionSeries.map((entry) => (
                    <Cell key={entry.stage} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={ConversionTooltip} cursor={false} isAnimationActive={false} />
              </PieChart>
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isInitialLoading
              ? [1, 2].map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                  <div className="mt-2 h-4 w-12 animate-pulse rounded bg-white/10" />
                </div>
              ))
              : distributionSeries.map((entry) => (
                <div key={entry.stage} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500">{entry.stage}</p>
                  <p className="mt-1 text-sm font-bold text-white">{entry.value}%</p>
                </div>
              ))}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-luxury-card p-5">
        <h3 className="font-display text-xl font-bold text-white">Volume de pedidos por dia</h3>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">
          Fonte: métricas reais dos últimos 14 dias
          {salesSeries.length > 0 ? ` (${kpis.latestDayLabel} mais recente)` : ''}
        </p>
        <div ref={volumeContainer.ref} className="mt-4 h-72 min-w-0">
          {isInitialLoading ? (
            <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
          ) : canRenderVolumeChart ? (
            <BarChart
              width={Math.floor(volumeContainer.size.width)}
              height={Math.floor(volumeContainer.size.height)}
              data={salesSeries}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 8" vertical={false} />
              <XAxis axisLine={false} dataKey="day" tick={{ fill: '#a3a3a3', fontSize: 12 }} tickLine={false} />
              <YAxis axisLine={false} tick={{ fill: '#a3a3a3', fontSize: 12 }} tickLine={false} />
              <Tooltip
                contentStyle={BAR_TOOLTIP_STYLE}
                itemStyle={DEFAULT_TOOLTIP_ITEM_STYLE}
                formatter={(value) => [`${formatInteger(Number(value ?? 0))} pedidos`, 'Pedidos']}
                labelStyle={DEFAULT_TOOLTIP_LABEL_STYLE}
              />
              <Bar
                dataKey="orders"
                fill="#ff00cc"
                isAnimationActive={!isLoading}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
          )}
        </div>
      </section>
    </div>
  )
}
