import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HERO_CONFIG, HERO_COUNTDOWN_LABELS } from '../const/home'
import { useCampaignSettings } from './useCampaignSettings'
import { createCountdownItems, getCountdown } from '../utils/home'
import { parseCampaignDateTime } from '../utils/campaignSchedule'

type CountdownDisplayMode = 'start' | 'end' | 'hidden'

type CountdownDisplayState = {
  mode: CountdownDisplayMode
  targetTimeMs: number | null
  title: string
  helper: string
}

function resolveCountdownDisplayState(
  startsAt: string | null,
  startsAtTime: string | null,
  endsAt: string | null,
  endsAtTime: string | null,
  nowMs: number,
): CountdownDisplayState {
  const startsAtMs = parseCampaignDateTime(startsAt, startsAtTime, false)
  const endsAtMs = parseCampaignDateTime(endsAt, endsAtTime, true)

  if (!startsAtMs && !endsAtMs) {
    return {
      mode: 'hidden',
      targetTimeMs: null,
      title: 'Em breve teremos uma campanha',
      helper: 'Aguarde os proximos anuncios.',
    }
  }

  if (startsAtMs && nowMs < startsAtMs) {
    return {
      mode: 'start',
      targetTimeMs: startsAtMs,
      title: 'A campanha comeca em',
      helper: 'As vendas serao liberadas na abertura oficial.',
    }
  }

  if (endsAtMs && nowMs <= endsAtMs) {
    return {
      mode: 'end',
      targetTimeMs: endsAtMs,
      title: 'A campanha encerra em',
      helper: 'Participe antes do encerramento.',
    }
  }

  if (endsAtMs && nowMs > endsAtMs) {
    return {
      mode: 'hidden',
      targetTimeMs: null,
      title: 'Campanha encerrada',
      helper: 'Confira os resultados desta edicao.',
    }
  }

  return {
    mode: 'hidden',
    targetTimeMs: null,
    title: 'Em breve teremos uma campanha',
    helper: 'Aguarde os proximos anuncios.',
  }
}

export function useHeroSection(targetSoldPercentage: number = HERO_CONFIG.targetSoldPercentage) {
  const { campaign } = useCampaignSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const countdownDisplayState = useMemo(
    () =>
      resolveCountdownDisplayState(
        campaign.startsAt,
        campaign.startsAtTime,
        campaign.endsAt,
        campaign.endsAtTime,
        nowMs,
      ),
    [campaign.endsAt, campaign.endsAtTime, campaign.startsAt, campaign.startsAtTime, nowMs],
  )
  const targetTimeMs = countdownDisplayState.targetTimeMs
  const [animatedSoldPercentage, setAnimatedSoldPercentage] = useState(0)
  const animatedSoldPercentageRef = useRef(0)

  useEffect(() => {
    animatedSoldPercentageRef.current = animatedSoldPercentage
  }, [animatedSoldPercentage])

  useEffect(() => {
    const safeTarget = Math.max(0, Math.min(100, Math.round(targetSoldPercentage)))
    let animationFrame = 0
    let startTime = 0
    const startValue = animatedSoldPercentageRef.current

    const timeout = window.setTimeout(() => {
      const animate = (timestamp: number) => {
        if (!startTime) {
          startTime = timestamp
        }

        const elapsed = timestamp - startTime
        const progress = Math.min(elapsed / HERO_CONFIG.progressAnimationDurationMs, 1)
        const value = Math.round(startValue + (safeTarget - startValue) * progress)
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
  }, [targetSoldPercentage])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

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

  const handleOpenCampaignSettings = useCallback(() => {
    navigate('/dashboard?tab=campanha', {
      state: {
        highlightCampaignDates: true,
        highlightSource: 'home-hero-admin-cta',
      },
    })
  }, [navigate])

  const countdownItems = useMemo(
    () => createCountdownItems(getCountdown(targetTimeMs ?? 0, nowMs), HERO_COUNTDOWN_LABELS),
    [nowMs, targetTimeMs],
  )

  return {
    animatedSoldPercentage,
    countdownItems,
    countdownDisplayState,
    handleOpenBuyModal,
    handleOpenCampaignSettings,
  }
}
