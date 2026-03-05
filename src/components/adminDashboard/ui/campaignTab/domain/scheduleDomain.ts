const DEFAULT_SCHEDULE_INPUT_CLASS_NAME = 'rounded-xl border border-white/10 bg-black/25 px-4 py-3'
const HIGHLIGHT_SCHEDULE_INPUT_CLASS_NAME = 'rounded-xl border border-neon-pink/70 bg-neon-pink/10 px-4 py-3 animate-pulse shadow-[0_0_0_1px_rgba(255,0,204,0.45),0_0_30px_rgba(255,0,204,0.35)]'

export function shouldHighlightCampaignSchedule(params: {
  search: string
  state: unknown
}) {
  const searchParams = new URLSearchParams(params.search)
  const locationState = params.state && typeof params.state === 'object'
    ? (params.state as Record<string, unknown>)
    : null

  return searchParams.get('tab') === 'campanha'
    && locationState?.highlightCampaignDates === true
    && locationState?.highlightSource === 'home-hero-admin-cta'
}

export function clearScheduleHighlightState(state: unknown) {
  if (!state || typeof state !== 'object') {
    return {
      highlightCampaignDates: false,
    }
  }

  return {
    ...(state as Record<string, unknown>),
    highlightCampaignDates: false,
  }
}

export function getScheduleInputClassName(shouldHighlight: boolean) {
  return shouldHighlight
    ? HIGHLIGHT_SCHEDULE_INPUT_CLASS_NAME
    : DEFAULT_SCHEDULE_INPUT_CLASS_NAME
}

export function isEndOnSameDayAsStart(startsAt: string, endsAt: string) {
  return Boolean(startsAt && endsAt && startsAt === endsAt)
}

export function resolveMinEndTime(params: {
  startsAt: string
  endsAt: string
  startsAtTime: string
}) {
  return isEndOnSameDayAsStart(params.startsAt, params.endsAt) && params.startsAtTime
    ? params.startsAtTime
    : undefined
}

export function shouldClearSkipWeekId(topBuyersSkipWeekId: string, topBuyersNextDrawWeekId: string) {
  if (!topBuyersSkipWeekId) {
    return false
  }

  return topBuyersSkipWeekId !== topBuyersNextDrawWeekId
}
