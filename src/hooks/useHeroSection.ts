import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HERO_CONFIG, HERO_COUNTDOWN_LABELS } from '../const/home'
import { useCampaignSettings } from './useCampaignSettings'
import { createCountdownItems, getCountdown, type Countdown } from '../utils/home'

function parseCampaignDate(value: string | null, useEndOfDay: boolean) {
  if (!value) {
    return null
  }

  const [yearRaw, monthRaw, dayRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const date = useEndOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.getTime()
}

export function useHeroSection() {
  const { campaign } = useCampaignSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const fallbackTargetTimeRef = useRef(Date.now() + HERO_CONFIG.countdownDurationMs)
  const targetTime = useMemo(() => {
    const startsAtMs = parseCampaignDate(campaign.startsAt, false)
    const endsAtMs = parseCampaignDate(campaign.endsAt, true)

    if (campaign.status === 'finished' || campaign.status === 'paused') {
      return 0
    }

    if (campaign.status === 'scheduled' && startsAtMs) {
      return startsAtMs
    }

    if (campaign.status === 'active' && endsAtMs) {
      return endsAtMs
    }

    return fallbackTargetTimeRef.current
  }, [campaign.endsAt, campaign.startsAt, campaign.status])
  const [animatedSoldPercentage, setAnimatedSoldPercentage] = useState(0)
  const [countdown, setCountdown] = useState<Countdown>(() => getCountdown(targetTime))

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
    setCountdown(getCountdown(targetTime))
  }, [targetTime])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextCountdown = getCountdown(targetTime)
      setCountdown(nextCountdown)

      if (nextCountdown.hasFinished) {
        window.clearInterval(interval)
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [targetTime])

  const handleOpenBuyModal = useCallback(() => {
    const targetId = 'comprar-numeros'
    const isHomePage = location.pathname === '/'
    const isSameHash = location.hash === `#${targetId}`

    if (isHomePage && isSameHash) {
      const targetElement = document.getElementById(targetId)
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    navigate(`/#${targetId}`)
  }, [location.hash, location.pathname, navigate])

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
