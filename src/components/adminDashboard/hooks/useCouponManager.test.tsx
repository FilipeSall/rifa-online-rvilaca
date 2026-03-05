import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignCoupon } from '../../../types/campaign'
import { useCouponManager } from './useCouponManager'

describe('useCouponManager', () => {
  it('adiciona cupom e reseta valor apos sucesso', async () => {
    const persistCoupons = vi.fn(async (_nextCoupons: CampaignCoupon[]) => true)
    const { result } = renderHook(() => useCouponManager({
      coupons: [],
      persistCoupons,
      generateCode: () => 'AUTO-CODE',
      nowIso: () => '2026-01-01T00:00:00.000Z',
    }))

    act(() => {
      result.current.setCouponCodeMode('manual')
      result.current.setCouponCodeInput('  cupom_10 ')
      result.current.setCouponDiscountType('percent')
      result.current.setCouponValueInput('15')
    })

    await act(async () => {
      await result.current.handleAddCoupon()
    })

    expect(persistCoupons).toHaveBeenCalledTimes(1)
    const firstCoupon = (persistCoupons.mock.calls[0]?.[0] as Array<Record<string, unknown>>)?.[0]
    expect(firstCoupon).toMatchObject({
      code: 'CUPOM_10',
      discountValue: 15,
      discountType: 'percent',
      active: true,
    })
    expect(result.current.couponValueInput).toBe('10')
  })

  it('gera codigo quando alterna para modo automatico com input vazio', () => {
    const { result } = renderHook(() => useCouponManager({
      coupons: [],
      persistCoupons: async () => true,
      generateCode: () => 'AUTO-XYZ',
    }))

    act(() => {
      result.current.setCouponCodeMode('manual')
      result.current.setCouponCodeInput('')
    })

    act(() => {
      result.current.setCouponCodeMode('auto')
    })

    expect(result.current.couponCodeInput).toBe('AUTO-XYZ')
  })
})
