import { useMemo, useState } from 'react'
import { CAMPAIGN_STATUS_OPTIONS, DEFAULT_BONUS_PRIZE, DEFAULT_CAMPAIGN_TITLE, DEFAULT_MAIN_PRIZE, DEFAULT_SECOND_PRIZE } from '../../../const/campaign'
import type { CampaignCoupon, CampaignCouponDiscountType, CampaignStatus } from '../../../types/campaign'
import { useCampaignForm } from '../hooks/useCampaignForm'
import { formatCurrency, getCampaignStatusLabel } from '../utils/formatters'

function generateCouponCode() {
  const seed = Math.random().toString(36).slice(2, 8).toUpperCase()
  const suffix = String(Date.now()).slice(-4)
  return `CUPOM-${seed}-${suffix}`
}

function formatCouponValue(coupon: CampaignCoupon) {
  if (coupon.discountType === 'percent') {
    return `${coupon.discountValue.toFixed(2).replace(/\.00$/, '')}%`
  }

  return formatCurrency(coupon.discountValue)
}

export default function CampaignTab() {
  const {
    campaign,
    isLoading,
    isSaving,
    title,
    pricePerCotaInput,
    minPurchaseQuantityInput,
    mainPrize,
    secondPrize,
    bonusPrize,
    status,
    startsAt,
    endsAt,
    coupons,
    setTitle,
    setPricePerCotaInput,
    setMinPurchaseQuantityInput,
    setMainPrize,
    setSecondPrize,
    setBonusPrize,
    setStatus,
    setStartsAt,
    setEndsAt,
    handleSaveCampaignSettings,
    persistCoupons,
  } = useCampaignForm()

  const [isCouponCreatorOpen, setIsCouponCreatorOpen] = useState(false)
  const [couponCodeMode, setCouponCodeMode] = useState<'manual' | 'auto'>('auto')
  const [couponCodeInput, setCouponCodeInput] = useState(generateCouponCode())
  const [couponDiscountType, setCouponDiscountType] = useState<CampaignCouponDiscountType>('percent')
  const [couponValueInput, setCouponValueInput] = useState('10')

  const activeCoupons = useMemo(() => coupons.filter((item) => item.active).length, [coupons])

  const canAddCoupon = useMemo(() => {
    const normalizedCode = couponCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
    const parsedValue = Number(couponValueInput.replace(',', '.'))
    return normalizedCode.length > 0 && Number.isFinite(parsedValue) && parsedValue > 0
  }, [couponCodeInput, couponValueInput])

  const handleGenerateCouponCode = () => {
    setCouponCodeInput(generateCouponCode())
  }

  const handleAddCoupon = async () => {
    const normalizedCode = couponCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
    const parsedValue = Number(couponValueInput.replace(',', '.'))

    if (!normalizedCode) {
      return
    }

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return
    }

    const normalizedValue = couponDiscountType === 'percent'
      ? Number(Math.min(parsedValue, 100).toFixed(2))
      : Number(parsedValue.toFixed(2))

    if (normalizedValue <= 0) {
      return
    }

    const nextCoupon: CampaignCoupon = {
      code: normalizedCode,
      discountType: couponDiscountType,
      discountValue: normalizedValue,
      active: true,
      createdAt: new Date().toISOString(),
    }

    const deduped = coupons.filter((item) => item.code !== nextCoupon.code)
    const nextCoupons = [nextCoupon, ...deduped].slice(0, 100)
    const saved = await persistCoupons(nextCoupons)
    if (!saved) {
      return
    }

    setCouponValueInput(couponDiscountType === 'percent' ? '10' : '5')
    if (couponCodeMode === 'auto') {
      handleGenerateCouponCode()
    }
  }

  const handleToggleCoupon = async (code: string) => {
    const nextCoupons = coupons.map((item) => (
      item.code === code
        ? {
            ...item,
            active: !item.active,
          }
        : item
    ))
    await persistCoupons(nextCoupons)
  }

  const handleRemoveCoupon = async (code: string) => {
    const nextCoupons = coupons.filter((item) => item.code !== code)
    await persistCoupons(nextCoupons)
  }

  return (
    <section className="space-y-6">
      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-44 w-44 rounded-full bg-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Central da Campanha</p>
            <h3 className="mt-2 font-luxury text-3xl font-bold text-white">Operacao comercial com controle total</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Configure preço, compra mínima e cupons da campanha em tempo real.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gold/20 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Preço atual</p>
              <p className="mt-1 text-lg font-black text-gold">{formatCurrency(campaign.pricePerCota)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Status</p>
              <p className="mt-1 text-lg font-black text-emerald-300">{getCampaignStatusLabel(status)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Compra mínima</p>
              <p className="mt-1 text-lg font-black text-white">{campaign.minPurchaseQuantity}</p>
            </div>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Cupons ativos</p>
              <p className="mt-1 text-lg font-black text-cyan-100">{activeCoupons}</p>
            </div>
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,168,0,0.16),transparent_48%)]" />
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Preview ao vivo</p>
            <h4 className="mt-3 font-luxury text-2xl font-bold text-white">{title.trim() || DEFAULT_CAMPAIGN_TITLE}</h4>
            <p className="mt-2 text-sm text-gray-300">
              Visual de como a comunicação principal da campanha fica após o salvamento.
            </p>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-gold/25 bg-black/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gold">1º prêmio</p>
                <p className="mt-1 text-sm font-semibold text-white">{mainPrize.trim() || DEFAULT_MAIN_PRIZE}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">2º prêmio</p>
                <p className="mt-1 text-sm font-semibold text-white">{secondPrize.trim() || DEFAULT_SECOND_PRIZE}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-300">Prêmio extra</p>
                <p className="mt-1 text-sm font-semibold text-white">{bonusPrize.trim() || DEFAULT_BONUS_PRIZE}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-title">
                Nome da campanha
              </label>
              <input
                id="campaign-title"
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-main-prize">
                  1º prêmio
                </label>
                <input
                  id="campaign-main-prize"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="text"
                  value={mainPrize}
                  onChange={(event) => setMainPrize(event.target.value)}
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-second-prize">
                  2º prêmio
                </label>
                <input
                  id="campaign-second-prize"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="text"
                  value={secondPrize}
                  onChange={(event) => setSecondPrize(event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-emerald-300" htmlFor="campaign-bonus-prize">
                Prêmio extra (20 PIX)
              </label>
              <input
                id="campaign-bonus-prize"
                className="mt-2 h-11 w-full rounded-md border border-emerald-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-300/60"
                type="text"
                value={bonusPrize}
                onChange={(event) => setBonusPrize(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-status">
                  Status da campanha
                </label>
                <select
                  id="campaign-status"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as CampaignStatus)}
                >
                  {CAMPAIGN_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at">
                  Inicio
                </label>
                <input
                  id="campaign-starts-at"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at">
                  Fim
                </label>
                <input
                  id="campaign-ends-at"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                  type="date"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ticket-price">
                  Preço por cota (R$)
                </label>
                <input
                  id="campaign-ticket-price"
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-gold outline-none transition-colors focus:border-gold/60"
                  inputMode="decimal"
                  type="text"
                  value={pricePerCotaInput}
                  onChange={(event) => setPricePerCotaInput(event.target.value)}
                />
              </div>

              <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3">
                <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-min-purchase">
                  Compra mínima (cotas)
                </label>
                <input
                  id="campaign-min-purchase"
                  className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
                  inputMode="numeric"
                  type="text"
                  value={minPurchaseQuantityInput}
                  onChange={(event) => setMinPurchaseQuantityInput(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex h-11 items-center rounded-lg bg-gold px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-70"
              type="button"
              disabled={isLoading || isSaving}
              onClick={handleSaveCampaignSettings}
            >
              {isSaving ? 'Salvando...' : 'Salvar campanha'}
            </button>
          </div>
        </article>
      </div>

      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(34,211,238,0.18),transparent_38%)]" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Cupons da campanha</p>
              <h4 className="mt-1 text-xl font-bold text-white">Descontos com controle fino</h4>
            </div>
            <button
              className="inline-flex h-10 items-center rounded-lg border border-cyan-200/35 bg-cyan-500/15 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/25"
              type="button"
              onClick={() => setIsCouponCreatorOpen((current) => !current)}
            >
              {isCouponCreatorOpen ? 'Fechar criador' : 'Novo cupom'}
            </button>
          </div>

          {isCouponCreatorOpen ? (
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-cyan-200/25 bg-black/25 p-4 lg:grid-cols-12">
              <div className="space-y-2 lg:col-span-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Tipo de desconto</p>
                <div className="inline-flex rounded-lg border border-white/10 bg-black/35 p-1">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponDiscountType === 'percent' ? 'bg-cyan-300 text-black' : 'text-gray-300'}`}
                    onClick={() => setCouponDiscountType('percent')}
                  >
                    Percentual
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponDiscountType === 'fixed' ? 'bg-cyan-300 text-black' : 'text-gray-300'}`}
                    onClick={() => setCouponDiscountType('fixed')}
                  >
                    Valor fixo
                  </button>
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Codigo</p>
                <div className="inline-flex rounded-lg border border-white/10 bg-black/35 p-1">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponCodeMode === 'auto' ? 'bg-gold text-black' : 'text-gray-300'}`}
                    onClick={() => {
                      setCouponCodeMode('auto')
                      if (!couponCodeInput.trim()) {
                        setCouponCodeInput(generateCouponCode())
                      }
                    }}
                  >
                    Automatico
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-2 text-xs font-bold ${couponCodeMode === 'manual' ? 'bg-gold text-black' : 'text-gray-300'}`}
                    onClick={() => setCouponCodeMode('manual')}
                  >
                    Manual
                  </button>
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400" htmlFor="coupon-discount-value">
                  Valor do desconto
                </label>
                <div className="relative">
                  {couponDiscountType === 'fixed' ? (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-cyan-100/90">
                      R$
                    </span>
                  ) : null}
                  <input
                    id="coupon-discount-value"
                    className={`h-11 w-full rounded-md border border-white/10 bg-black/40 text-sm font-semibold text-white outline-none focus:border-cyan-200/60 ${
                      couponDiscountType === 'fixed' ? 'pl-11 pr-3' : 'pl-3 pr-10'
                    }`}
                    inputMode="decimal"
                    type="text"
                    value={couponValueInput}
                    onChange={(event) => setCouponValueInput(event.target.value)}
                    placeholder={couponDiscountType === 'percent' ? 'Ex: 10' : 'Ex: 5,00'}
                  />
                  {couponDiscountType === 'percent' ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-cyan-100/90">
                      %
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400" htmlFor="coupon-code-input">
                  Codigo do cupom
                </label>
                <div className="flex gap-2">
                  <input
                    id="coupon-code-input"
                    className="h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold uppercase tracking-widest text-white outline-none focus:border-gold/60"
                    type="text"
                    value={couponCodeInput}
                    onChange={(event) => setCouponCodeInput(event.target.value)}
                    readOnly={couponCodeMode === 'auto'}
                  />
                  {couponCodeMode === 'auto' ? (
                    <button
                      type="button"
                      className="h-11 rounded-md border border-gold/30 bg-gold/10 px-3 text-xs font-bold uppercase tracking-wide text-gold"
                      onClick={handleGenerateCouponCode}
                    >
                      Gerar
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="lg:col-span-12">
                <button
                  className="inline-flex h-11 items-center rounded-lg bg-cyan-300 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  type="button"
                  onClick={handleAddCoupon}
                  disabled={!canAddCoupon}
                >
                  Adicionar cupom
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {coupons.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400 lg:col-span-2">
                Nenhum cupom cadastrado para esta campanha.
              </p>
            ) : null}

            {coupons.map((coupon) => (
              <div key={coupon.code} className="rounded-xl border border-white/10 bg-black/30 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Codigo</p>
                    <p className="mt-1 font-mono text-sm font-bold tracking-wider text-white">{coupon.code}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${coupon.active ? 'border border-emerald-400/30 bg-emerald-500/15 text-emerald-200' : 'border border-gray-500/40 bg-gray-600/15 text-gray-300'}`}>
                    {coupon.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-300">
                  Desconto: <span className="font-black text-cyan-100">{formatCouponValue(coupon)}</span>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-emerald-200"
                    onClick={() => handleToggleCoupon(coupon.code)}
                  >
                    {coupon.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-md border border-red-400/35 bg-red-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-red-200"
                    onClick={() => handleRemoveCoupon(coupon.code)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  )
}
