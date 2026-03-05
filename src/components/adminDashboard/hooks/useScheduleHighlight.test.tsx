import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useScheduleHighlight } from './useScheduleHighlight'

describe('useScheduleHighlight', () => {
  it('ativa highlight e limpa state apos timeout', () => {
    vi.useFakeTimers()
    const navigate = vi.fn()

    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/dashboard?tab=campanha']}>
        {children}
      </MemoryRouter>
    )

    const { result } = renderHook(
      () => useScheduleHighlight({
        locationOverride: {
          pathname: '/dashboard',
          search: '?tab=campanha',
          state: {
            highlightCampaignDates: true,
            highlightSource: 'home-hero-admin-cta',
          },
        },
        navigateOverride: navigate,
        pulseDurationMs: 2000,
      }),
      { wrapper },
    )

    expect(result.current.shouldHighlightScheduleInputs).toBe(true)
    expect(result.current.scheduleInputClassName).toContain('animate-pulse')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(navigate).toHaveBeenCalledWith('/dashboard?tab=campanha', {
      replace: true,
      state: {
        highlightCampaignDates: false,
        highlightSource: 'home-hero-admin-cta',
      },
    })

    vi.useRealTimers()
  })
})
