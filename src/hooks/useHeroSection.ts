import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HERO_CONFIG, HERO_COUNTDOWN_LABELS } from '../const/home'
import { createCountdownItems, getCountdown, type Countdown, type CountdownItem } from '../utils/home'

export function useHeroSection() {
  const targetTimeRef = useRef(Date.now() + HERO_CONFIG.countdownDurationMs)
  const [animatedSoldPercentage, setAnimatedSoldPercentage] = useState(0)
  const [countdown, setCountdown] = useState<Countdown>(() => getCountdown(targetTimeRef.current))

  useEffect(() => {
    let animationFrame = 0
    let startTime = 0

    const timeout = window.setTimeout(() => {
      const animate = (timestamp: number) => {
        if (!startTime) {
          startTime = timestamp
        }

        const elapsed = timestamp - startTime
        const progress = Math.min(elapsed / HERO_CONFIG.progressAnimationDurationMs, 1)
        const value = Math.round(HERO_CONFIG.targetSoldPercentage * progress)
        setAnimatedSoldPercentage(value)

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animate)
        }
      }

      animationFrame = window.requestAnimationFrame(animate)
    }, HERO_CONFIG.progressAnimationDelayMs)

    return () => {
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextCountdown = getCountdown(targetTimeRef.current)
      setCountdown(nextCountdown)

      if (nextCountdown.hasFinished) {
        window.clearInterval(interval)
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  const handleOpenBuyModal = useCallback(() => {
    // TODO: conectar com modal de compra quando o fluxo estiver implementado.
  }, [])

  const countdownItems = useMemo(
    () => createCountdownItems(countdown, HERO_COUNTDOWN_LABELS),
    [countdown],
  )

  return {
    animatedSoldPercentage,
    countdownItems,
    handleOpenBuyModal,
  }
}
