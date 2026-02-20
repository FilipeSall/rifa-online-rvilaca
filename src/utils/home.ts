export type Countdown = {
  days: number
  hours: number
  minutes: number
  seconds: number
  hasFinished: boolean
}

export type CountdownItem = {
  value: string
  label: string
}

export function getCountdown(targetTime: number, now = Date.now()): Countdown {
  const remainingMs = Math.max(targetTime - now, 0)
  const totalSeconds = Math.floor(remainingMs / 1000)

  const days = Math.floor(totalSeconds / (24 * 60 * 60))
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return {
    days,
    hours,
    minutes,
    seconds,
    hasFinished: remainingMs === 0,
  }
}

export function formatUnit(value: number): string {
  return value.toString().padStart(2, '0')
}

export function createCountdownItems(countdown: Countdown, labels: readonly string[]): CountdownItem[] {
  return [
    { value: formatUnit(countdown.days), label: labels[0] },
    { value: formatUnit(countdown.hours), label: labels[1] },
    { value: formatUnit(countdown.minutes), label: labels[2] },
    { value: formatUnit(countdown.seconds), label: labels[3] },
  ]
}

export function getRankingPositionClass(position: number): string {
  if (position === 1) {
    return 'bg-gold text-black'
  }

  if (position === 2) {
    return 'bg-gray-700 text-white'
  }

  return 'bg-gray-900 text-gray-400'
}

export function getGoogleAuthErrorMessage(code: string): string | null {
  if (code === 'auth/popup-closed-by-user') {
    return null
  }

  return 'Não foi possível entrar com Google agora. Tente novamente.'
}
