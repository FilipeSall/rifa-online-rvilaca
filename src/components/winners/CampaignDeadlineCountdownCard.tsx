import { useEffect, useState } from 'react'
import { HERO_COUNTDOWN_LABELS } from '../../const/home'
import { CAMPAIGN_DEADLINE_TIMEZONE } from '../../const/publicCampaignDeadline'
import { createCountdownItems, getCountdown } from '../../utils/home'

type CampaignDeadlineCountdownCardProps = {
  hasDeadline: boolean
  targetTimeMs: number | null
  isExpired: boolean
}

function formatDeadlineDateTime(valueMs: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: CAMPAIGN_DEADLINE_TIMEZONE,
  }).format(new Date(valueMs))
}

export default function CampaignDeadlineCountdownCard({
  hasDeadline,
  targetTimeMs,
  isExpired,
}: CampaignDeadlineCountdownCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!hasDeadline || targetTimeMs === null) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasDeadline, targetTimeMs])

  if (!hasDeadline || targetTimeMs === null) {
    return null
  }

  const hasFinished = isExpired || nowMs >= targetTimeMs
  const deadlineDateTimeLabel = formatDeadlineDateTime(targetTimeMs)
  const countdownItems = createCountdownItems(getCountdown(targetTimeMs, nowMs), HERO_COUNTDOWN_LABELS)

  return (
    <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/20 bg-[linear-gradient(155deg,rgba(8,17,34,0.96),rgba(12,26,48,0.92))] px-3 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">
          Prazo final da campanha
        </p>
        <p className="text-[10px] font-semibold text-gray-200">{deadlineDateTimeLabel}</p>
      </div>

      {hasFinished ? (
        <p className="mt-2 text-sm font-black uppercase tracking-[0.12em] text-amber-200">
          Campanha encerrada
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {countdownItems.map((item) => (
            <article
              key={item.label}
              className="rounded-lg border border-white/15 bg-black/35 px-2 py-2 text-center"
            >
              <p className="font-mono text-lg font-black leading-none text-white">{item.value}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gray-300">{item.label}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
