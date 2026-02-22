import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase'

type DashboardDailyPoint = {
  date: string
  revenue: number
  paidOrders: number
  soldNumbers: number
}

type DashboardSummaryResponse = {
  totalRevenue: number
  paidOrders: number
  soldNumbers: number
  avgTicket: number
  daily: DashboardDailyPoint[]
}

type CallableEnvelope<T> = T | { result?: T }

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function formatDailyLabel(date: string) {
  if (!date) {
    return '--'
  }

  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsed)
}

export function useDashboardSummary() {
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummaryResponse>({
    totalRevenue: 0,
    paidOrders: 0,
    soldNumbers: 0,
    avgTicket: 0,
    daily: [],
  })

  useEffect(() => {
    const getDashboardSummary = httpsCallable<Record<string, never>, unknown>(functions, 'getDashboardSummary')
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const response = await getDashboardSummary({})
        const payload = unwrapCallableData(response.data as CallableEnvelope<DashboardSummaryResponse>)
        if (cancelled) {
          return
        }

        const safeDaily = Array.isArray(payload.daily)
          ? payload.daily
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
              date: typeof item.date === 'string' ? item.date : '',
              revenue: Number(item.revenue) || 0,
              paidOrders: Number(item.paidOrders) || 0,
              soldNumbers: Number(item.soldNumbers) || 0,
            }))
          : []

        setSummary({
          totalRevenue: Number(payload.totalRevenue) || 0,
          paidOrders: Number(payload.paidOrders) || 0,
          soldNumbers: Number(payload.soldNumbers) || 0,
          avgTicket: Number(payload.avgTicket) || 0,
          daily: safeDaily,
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Falha ao carregar dashboard.')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void load()
    }, 45000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const salesSeries = useMemo(
    () =>
      summary.daily
        .slice()
        .reverse()
        .map((item) => ({
          day: formatDailyLabel(item.date),
          revenue: item.revenue,
          orders: item.paidOrders,
        })),
    [summary.daily],
  )

  const latestDay = salesSeries[salesSeries.length - 1] || { day: '--', revenue: 0, orders: 0 }
  const totalDailyRevenue = salesSeries.reduce((acc, item) => acc + item.revenue, 0)
  const totalDailyOrders = salesSeries.reduce((acc, item) => acc + item.orders, 0)
  const avgOrdersPerDay = salesSeries.length > 0 ? totalDailyOrders / salesSeries.length : 0
  const avgRevenuePerDay = salesSeries.length > 0 ? totalDailyRevenue / salesSeries.length : 0

  const kpis = useMemo(
    () => ({
      totalRevenue: summary.totalRevenue,
      soldNumbers: summary.soldNumbers,
      paidOrders: summary.paidOrders,
      avgTicket: summary.avgTicket,
      dailyOrders: avgOrdersPerDay,
      dailyRevenue: avgRevenuePerDay,
      latestDayLabel: latestDay.day,
    }),
    [
      avgOrdersPerDay,
      avgRevenuePerDay,
      latestDay.day,
      summary.avgTicket,
      summary.paidOrders,
      summary.soldNumbers,
      summary.totalRevenue,
    ],
  )

  const distributionSeries = useMemo(() => {
    const paidOrders = summary.paidOrders
    const soldNumbers = summary.soldNumbers
    const total = paidOrders + soldNumbers

    if (total <= 0) {
      return [
        { stage: 'Pedidos pagos', value: 0, fill: '#f5a800' },
        { stage: 'Numeros vendidos', value: 0, fill: '#22c55e' },
      ]
    }

    return [
      {
        stage: 'Pedidos pagos',
        value: Number(((paidOrders / total) * 100).toFixed(1)),
        fill: '#f5a800',
      },
      {
        stage: 'Numeros vendidos',
        value: Number(((soldNumbers / total) * 100).toFixed(1)),
        fill: '#22c55e',
      },
    ]
  }, [summary.paidOrders, summary.soldNumbers])

  return {
    isLoading,
    errorMessage,
    salesSeries,
    distributionSeries,
    kpis,
  }
}

