import { useEffect, useState } from 'react'
import { useElementSize } from './useElementSize'

export function useDashboardCharts() {
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

  return {
    revenueContainer,
    conversionContainer,
    volumeContainer,
    isRevenueAnimationActive,
    canRenderRevenueChart,
    canRenderConversionChart,
    canRenderVolumeChart,
  }
}
