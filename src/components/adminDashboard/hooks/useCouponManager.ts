import { useMemo, useState } from 'react'
import type { CampaignCoupon, CampaignCouponDiscountType } from '../../../types/campaign'
import {
  buildCouponFromDraft,
  canCreateCoupon,
  removeCouponByCode,
  toggleCouponByCode,
  upsertCouponByCode,
} from '../ui/campaignTab/domain/couponDomain'
import { generateCouponCode } from '../ui/campaignTab/utils/couponUtils'

type CouponManagerParams = {
  coupons: CampaignCoupon[]
  persistCoupons: (nextCoupons: CampaignCoupon[]) => Promise<boolean>
  generateCode?: () => string
  nowIso?: () => string
}

export function useCouponManager(params: CouponManagerParams) {
  const generateCode = params.generateCode ?? generateCouponCode
  const nowIso = params.nowIso ?? (() => new Date().toISOString())

  const [isCouponCreatorOpen, setIsCouponCreatorOpen] = useState(false)
  const [couponCodeMode, setCouponCodeMode] = useState<'manual' | 'auto'>('auto')
  const [couponCodeInput, setCouponCodeInput] = useState(generateCode)
  const [couponDiscountType, setCouponDiscountType] = useState<CampaignCouponDiscountType>('percent')
  const [couponValueInput, setCouponValueInput] = useState('10')
  const [couponAction, setCouponAction] = useState<{ code: string; type: 'toggle' | 'remove' } | null>(null)

  const canAddCoupon = useMemo(
    () => canCreateCoupon({ couponCodeInput, couponValueInput }),
    [couponCodeInput, couponValueInput],
  )

  const handleSetCouponCodeMode = (nextMode: 'manual' | 'auto') => {
    setCouponCodeMode(nextMode)
    if (nextMode === 'auto' && !couponCodeInput.trim()) {
      setCouponCodeInput(generateCode())
    }
  }

  const handleGenerateCouponCode = () => {
    setCouponCodeInput(generateCode())
  }

  const handleAddCoupon = async () => {
    const nextCoupon = buildCouponFromDraft({
      couponCodeInput,
      couponValueInput,
      couponDiscountType,
      nowIso: nowIso(),
    })

    if (!nextCoupon) {
      return
    }

    const nextCoupons = upsertCouponByCode(params.coupons, nextCoupon)
    const saved = await params.persistCoupons(nextCoupons)
    if (!saved) {
      return
    }

    setCouponValueInput(couponDiscountType === 'percent' ? '10' : '5')
    if (couponCodeMode === 'auto') {
      handleGenerateCouponCode()
    }
  }

  const handleToggleCoupon = async (code: string) => {
    setCouponAction({ code, type: 'toggle' })
    try {
      const nextCoupons = toggleCouponByCode(params.coupons, code)
      await params.persistCoupons(nextCoupons)
    } finally {
      setCouponAction(null)
    }
  }

  const handleRemoveCoupon = async (code: string) => {
    setCouponAction({ code, type: 'remove' })
    try {
      const nextCoupons = removeCouponByCode(params.coupons, code)
      await params.persistCoupons(nextCoupons)
    } finally {
      setCouponAction(null)
    }
  }

  return {
    coupons: params.coupons,
    isCouponCreatorOpen,
    setIsCouponCreatorOpen,
    couponCodeMode,
    setCouponCodeMode: handleSetCouponCodeMode,
    couponCodeInput,
    setCouponCodeInput,
    couponDiscountType,
    setCouponDiscountType,
    couponValueInput,
    setCouponValueInput,
    couponAction,
    canAddCoupon,
    handleGenerateCouponCode,
    handleAddCoupon,
    handleToggleCoupon,
    handleRemoveCoupon,
  }
}
