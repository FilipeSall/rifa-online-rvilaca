import { useEffect, useRef, useState } from 'react'
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
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'react-toastify'
import {
  ADMIN_KPIS,
  ADMIN_TABS,
  CONVERSION_SERIES,
  SALES_SERIES,
  type AdminTabId,
} from '../../const/adminDashboard'
import {
  CAMPAIGN_STATUS_OPTIONS,
  DEFAULT_BONUS_PRIZE,
  DEFAULT_CAMPAIGN_STATUS,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_TICKET_PRICE,
} from '../../const/campaign'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import type { CampaignStatus } from '../../types/campaign'

type AdminDashboardContentProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
  onSignOut: () => void
}

type ElementSize = {
  width: number
  height: number
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

function getCampaignStatusLabel(status: CampaignStatus) {
  return CAMPAIGN_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Ativa'
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

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize({ width, height })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return { ref, size }
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
  const revenueContainer = useElementSize<HTMLDivElement>()
  const conversionContainer = useElementSize<HTMLDivElement>()
  const volumeContainer = useElementSize<HTMLDivElement>()

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

  const canRenderRevenueChart =
    areChartsReady && revenueContainer.size.width > 0 && revenueContainer.size.height > 0
  const canRenderConversionChart =
    areChartsReady && conversionContainer.size.width > 0 && conversionContainer.size.height > 0
  const canRenderVolumeChart =
    areChartsReady && volumeContainer.size.width > 0 && volumeContainer.size.height > 0

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
          <div ref={revenueContainer.ref} className="h-[360px] min-w-0 xl:flex-1">
            {canRenderRevenueChart ? (
              <AreaChart
                width={Math.floor(revenueContainer.size.width)}
                height={Math.floor(revenueContainer.size.height)}
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
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
        </article>

        <article className="flex h-full min-w-0 flex-col rounded-2xl border border-white/10 bg-luxury-card p-5 xl:col-span-5">
          <h3 className="font-luxury text-xl font-bold text-white">Funil de conversao</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">Visita ate pagamento</p>
          <div ref={conversionContainer.ref} className="h-72 min-w-0 pt-2">
            {canRenderConversionChart ? (
              <PieChart
                width={Math.floor(conversionContainer.size.width)}
                height={Math.floor(conversionContainer.size.height)}
              >
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
                <Tooltip content={ConversionTooltip} cursor={false} isAnimationActive={false} />
              </PieChart>
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
        <div ref={volumeContainer.ref} className="mt-4 h-72 min-w-0">
          {canRenderVolumeChart ? (
            <BarChart
              width={Math.floor(volumeContainer.size.width)}
              height={Math.floor(volumeContainer.size.height)}
              data={SALES_SERIES}
            >
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
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.03]" />
          )}
        </div>
      </section>
    </div>
  )
}

function CampaignTab() {
  const {
    campaign,
    exists,
    isLoading,
    isSaving,
    ensureCampaignExists,
    saveCampaignSettings,
  } = useCampaignSettings()
  const [title, setTitle] = useState(DEFAULT_CAMPAIGN_TITLE)
  const [pricePerCotaInput, setPricePerCotaInput] = useState(DEFAULT_TICKET_PRICE.toFixed(2))
  const [mainPrize, setMainPrize] = useState(DEFAULT_MAIN_PRIZE)
  const [secondPrize, setSecondPrize] = useState(DEFAULT_SECOND_PRIZE)
  const [bonusPrize, setBonusPrize] = useState(DEFAULT_BONUS_PRIZE)
  const [status, setStatus] = useState<CampaignStatus>(DEFAULT_CAMPAIGN_STATUS)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const hasEnsuredCampaignRef = useRef(false)

  useEffect(() => {
    setTitle(campaign.title)
    setPricePerCotaInput(campaign.pricePerCota.toFixed(2))
    setMainPrize(campaign.mainPrize)
    setSecondPrize(campaign.secondPrize)
    setBonusPrize(campaign.bonusPrize)
    setStatus(campaign.status)
    setStartsAt(campaign.startsAt ?? '')
    setEndsAt(campaign.endsAt ?? '')
  }, [
    campaign.bonusPrize,
    campaign.mainPrize,
    campaign.pricePerCota,
    campaign.secondPrize,
    campaign.status,
    campaign.startsAt,
    campaign.endsAt,
    campaign.title,
  ])

  useEffect(() => {
    if (isLoading || exists || hasEnsuredCampaignRef.current) {
      return
    }

    hasEnsuredCampaignRef.current = true
    ensureCampaignExists().catch(() => {
      toast.error('Nao foi possivel criar a campanha no banco de dados.', {
        toastId: 'campaign-seed-error',
      })
    })
  }, [ensureCampaignExists, exists, isLoading])

  const handleSaveCampaignSettings = async () => {
    const normalizedTitle = title.trim() || DEFAULT_CAMPAIGN_TITLE
    const normalizedMainPrize = mainPrize.trim() || DEFAULT_MAIN_PRIZE
    const normalizedSecondPrize = secondPrize.trim() || DEFAULT_SECOND_PRIZE
    const normalizedBonusPrize = bonusPrize.trim() || DEFAULT_BONUS_PRIZE
    const normalizedPriceText = pricePerCotaInput.replace(',', '.').trim()
    const normalizedPrice = Number(normalizedPriceText)

    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      toast.error('Informe um valor valido para a cota.', {
        toastId: 'campaign-invalid-price',
      })
      return
    }

    if (startsAt && endsAt && startsAt > endsAt) {
      toast.error('A data de inicio nao pode ser maior que a data de fim.', {
        toastId: 'campaign-invalid-date-range',
      })
      return
    }

    try {
      await saveCampaignSettings({
        title: normalizedTitle,
        pricePerCota: Number(normalizedPrice.toFixed(2)),
        mainPrize: normalizedMainPrize,
        secondPrize: normalizedSecondPrize,
        bonusPrize: normalizedBonusPrize,
        status,
        startsAt: startsAt.trim() ? startsAt : null,
        endsAt: endsAt.trim() ? endsAt : null,
      })
      toast.success('Campanha e premiacao atualizadas no banco e sincronizadas com o site.', {
        toastId: 'campaign-settings-saved',
      })
    } catch {
      toast.error('Falha ao salvar campanha. Verifique permissao de admin e tente novamente.', {
        toastId: 'campaign-settings-save-error',
      })
    }
  }

  return (
    <section className="space-y-6">
      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-44 w-44 rounded-full bg-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Central da Campanha</p>
            <h3 className="mt-2 font-luxury text-3xl font-bold text-white">Edição visual e comercial em tempo real</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Atualize nome, premiação e preço por cota em um único fluxo. Tudo que você salvar já vira referência para o restante do projeto.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gold/20 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Preço atual</p>
              <p className="mt-1 text-lg font-black text-gold">{formatCurrency(campaign.pricePerCota)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Status</p>
              <p className="mt-1 text-lg font-black text-emerald-300">{getCampaignStatusLabel(status)}</p>
            </div>
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,168,0,0.16),transparent_48%)]" />
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Preview ao vivo</p>
            <h4 className="mt-3 font-luxury text-2xl font-bold text-white">{title.trim() || DEFAULT_CAMPAIGN_TITLE}</h4>
            <p className="mt-2 text-sm text-gray-300">
              Visual de como a comunicação principal da campanha fica após o salvamento.
            </p>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-gold/25 bg-black/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gold">1º prêmio</p>
                <p className="mt-1 text-sm font-semibold text-white">{mainPrize.trim() || DEFAULT_MAIN_PRIZE}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">2º prêmio</p>
                <p className="mt-1 text-sm font-semibold text-white">{secondPrize.trim() || DEFAULT_SECOND_PRIZE}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-300">Prêmio extra</p>
                <p className="mt-1 text-sm font-semibold text-white">{bonusPrize.trim() || DEFAULT_BONUS_PRIZE}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-title">
                Nome da campanha
              </label>
              <input
                id="campaign-title"
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-main-prize">
                  1º prêmio
                </label>
                <input
                  id="campaign-main-prize"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="text"
                  value={mainPrize}
                  onChange={(event) => setMainPrize(event.target.value)}
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-second-prize">
                  2º prêmio
                </label>
                <input
                  id="campaign-second-prize"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="text"
                  value={secondPrize}
                  onChange={(event) => setSecondPrize(event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-emerald-300" htmlFor="campaign-bonus-prize">
                Prêmio extra (20 PIX)
              </label>
              <input
                id="campaign-bonus-prize"
                className="mt-2 h-11 w-full rounded-md border border-emerald-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-300/60"
                type="text"
                value={bonusPrize}
                onChange={(event) => setBonusPrize(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-status">
                  Status da campanha
                </label>
                <select
                  id="campaign-status"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as CampaignStatus)}
                >
                  {CAMPAIGN_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at">
                  Inicio
                </label>
                <input
                  id="campaign-starts-at"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at">
                  Fim
                </label>
                <input
                  id="campaign-ends-at"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="date"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ticket-price">
                Preço por cota (R$)
              </label>
              <input
                id="campaign-ticket-price"
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-gold outline-none transition-colors focus:border-gold/60"
                inputMode="decimal"
                type="text"
                value={pricePerCotaInput}
                onChange={(event) => setPricePerCotaInput(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex h-11 items-center rounded-lg bg-gold px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled={isLoading || isSaving}
              onClick={handleSaveCampaignSettings}
            >
              {isSaving ? 'Salvando...' : 'Salvar campanha'}
            </button>
          </div>
        </article>
      </div>
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
          {activeTab === 'campanha' ? <CampaignTab /> : null}
        </div>
      </main>
    </div>
  )
}
