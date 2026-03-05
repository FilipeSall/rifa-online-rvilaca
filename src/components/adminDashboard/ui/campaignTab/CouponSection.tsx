import { memo } from 'react'
import { formatCouponValue } from './domain/couponDomain'
import type { CouponSectionProps } from './types'

function CouponSectionComponent({ controller }: CouponSectionProps) {
  return (
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
            onClick={() => controller.setIsCouponCreatorOpen((current) => !current)}
            data-testid="campaign-coupon-toggle-creator"
          >
            {controller.isCouponCreatorOpen ? 'Fechar criador' : 'Novo cupom'}
          </button>
        </div>

        {controller.isCouponCreatorOpen ? (
          <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-cyan-200/25 bg-black/25 p-4 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Tipo de desconto</p>
              <div className="inline-flex rounded-lg border border-white/10 bg-black/35 p-1">
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-xs font-bold ${controller.couponDiscountType === 'percent' ? 'bg-cyan-300 text-black' : 'text-gray-300'}`}
                  onClick={() => controller.setCouponDiscountType('percent')}
                >
                  Percentual
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-xs font-bold ${controller.couponDiscountType === 'fixed' ? 'bg-cyan-300 text-black' : 'text-gray-300'}`}
                  onClick={() => controller.setCouponDiscountType('fixed')}
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
                  className={`rounded-md px-3 py-2 text-xs font-bold ${controller.couponCodeMode === 'auto' ? 'bg-neon-pink text-black' : 'text-gray-300'}`}
                  onClick={() => {
                    controller.setCouponCodeMode('auto')
                  }}
                >
                  Automatico
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-xs font-bold ${controller.couponCodeMode === 'manual' ? 'bg-neon-pink text-black' : 'text-gray-300'}`}
                  onClick={() => controller.setCouponCodeMode('manual')}
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
                {controller.couponDiscountType === 'fixed' ? (
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-cyan-100/90">
                    R$
                  </span>
                ) : null}
                <input
                  id="coupon-discount-value"
                  className={`h-11 w-full rounded-md border border-white/10 bg-black/40 text-sm font-semibold text-white outline-none focus:border-cyan-200/60 ${
                    controller.couponDiscountType === 'fixed' ? 'pl-11 pr-3' : 'pl-3 pr-10'
                  }`}
                  inputMode="decimal"
                  type="text"
                  value={controller.couponValueInput}
                  onChange={(event) => controller.setCouponValueInput(event.target.value)}
                  placeholder={controller.couponDiscountType === 'percent' ? 'Ex: 10' : 'Ex: 5,00'}
                />
                {controller.couponDiscountType === 'percent' ? (
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
                  className="h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold uppercase tracking-widest text-white outline-none focus:border-neon-pink/60"
                  type="text"
                  value={controller.couponCodeInput}
                  onChange={(event) => controller.setCouponCodeInput(event.target.value)}
                  readOnly={controller.couponCodeMode === 'auto'}
                  data-testid="campaign-coupon-code-input"
                />
                {controller.couponCodeMode === 'auto' ? (
                  <button
                    type="button"
                    className="h-11 rounded-md border border-neon-pink/30 bg-neon-pink/10 px-3 text-xs font-bold uppercase tracking-wide text-neon-pink"
                    onClick={controller.handleGenerateCouponCode}
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
                onClick={() => {
                  void controller.handleAddCoupon()
                }}
                disabled={!controller.canAddCoupon}
                data-testid="campaign-coupon-add-button"
              >
                Adicionar cupom
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {controller.coupons.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400 lg:col-span-2">
              Nenhum cupom cadastrado para esta campanha.
            </p>
          ) : null}

          {controller.coupons.map((coupon) => (
            <div key={coupon.code} className="rounded-xl border border-white/10 bg-black/30 px-4 py-4" data-testid={`campaign-coupon-item-${coupon.code}`}>
              {(() => {
                const isToggleLoading = controller.couponAction?.code === coupon.code && controller.couponAction.type === 'toggle'
                const isRemoveLoading = controller.couponAction?.code === coupon.code && controller.couponAction.type === 'remove'

                return (
                  <>
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
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          void controller.handleToggleCoupon(coupon.code)
                        }}
                        disabled={controller.couponAction !== null}
                      >
                        {isToggleLoading ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                        ) : null}
                        {isToggleLoading ? 'Processando...' : coupon.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-red-400/35 bg-red-500/10 px-3 text-[11px] font-bold uppercase tracking-wider text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          void controller.handleRemoveCoupon(coupon.code)
                        }}
                        disabled={controller.couponAction !== null}
                      >
                        {isRemoveLoading ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                        ) : null}
                        {isRemoveLoading ? 'Removendo...' : 'Remover'}
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

const CouponSection = memo(CouponSectionComponent)

export default CouponSection
