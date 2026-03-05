import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import {
  clearScheduleHighlightState,
  getScheduleInputClassName,
  shouldHighlightCampaignSchedule,
} from '../ui/campaignTab/domain/scheduleDomain'

type ScheduleHighlightLocation = {
  pathname: string
  search: string
  state: unknown
}

type ScheduleHighlightParams = {
  pulseDurationMs?: number
  locationOverride?: ScheduleHighlightLocation
  navigateOverride?: NavigateFunction
  setTimeoutFn?: typeof window.setTimeout
  clearTimeoutFn?: typeof window.clearTimeout
}

export function useScheduleHighlight(params: ScheduleHighlightParams = {}) {
  const locationFromRouter = useLocation()
  const navigateFromRouter = useNavigate()
  const location = params.locationOverride ?? locationFromRouter
  const navigate = params.navigateOverride ?? navigateFromRouter
  const pulseDurationMs = params.pulseDurationMs ?? 2000
  const setTimeoutFn = params.setTimeoutFn ?? window.setTimeout
  const clearTimeoutFn = params.clearTimeoutFn ?? window.clearTimeout

  const [shouldHighlightScheduleInputs, setShouldHighlightScheduleInputs] = useState(false)

  useEffect(() => {
    const shouldHighlight = shouldHighlightCampaignSchedule({
      search: location.search,
      state: location.state,
    })

    if (!shouldHighlight) {
      setShouldHighlightScheduleInputs(false)
      return
    }

    setShouldHighlightScheduleInputs(true)
    const timeout = setTimeoutFn(() => {
      setShouldHighlightScheduleInputs(false)
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: clearScheduleHighlightState(location.state),
      })
    }, pulseDurationMs)

    return () => {
      clearTimeoutFn(timeout)
    }
  }, [
    clearTimeoutFn,
    location.pathname,
    location.search,
    location.state,
    navigate,
    pulseDurationMs,
    setTimeoutFn,
  ])

  const scheduleInputClassName = useMemo(
    () => getScheduleInputClassName(shouldHighlightScheduleInputs),
    [shouldHighlightScheduleInputs],
  )

  return {
    shouldHighlightScheduleInputs,
    scheduleInputClassName,
  }
}
