import { CAMPAIGN_PACK_QUANTITIES } from '../../../../const/campaign'
import { CustomSelect } from '../../../ui/CustomSelect'
import { formatCurrency } from '../../utils/formatters'
import type { CommercialRulesSectionProps } from './types'

export default function CommercialRulesSection({ controller }: CommercialRulesSectionProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-luxury-card p-5">
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100">3. Regras comerciais</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ticket-price">
              Preco por cota (R$)
            </label>
            <input
              id="campaign-ticket-price"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-neon-pink outline-none transition-colors focus:border-neon-pink/60"
              inputMode="decimal"
              type="text"
              value={controller.pricePerCotaInput}
              onChange={(event) => controller.setPricePerCotaInput(event.target.value)}
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 md:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Desconto por venda</p>
            <p className="mt-1 text-[11px] text-gray-300">
              Numero de ingressos para obter descontos por venda.
            </p>
            <div className="mt-3 space-y-3">
              {controller.promotionDrafts.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhuma regra cadastrada. Clique em adicionar para criar.</p>
              ) : (
                controller.promotionDrafts.map((promotion, index) => (
                  <div key={`promotion-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
                        Regra {index + 1}
                      </p>
                      <button
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300 transition hover:text-red-200"
                        type="button"
                        onClick={() => controller.handleRemovePromotion(index)}
                      >
                        Remover
                      </button>
                    </div>
                    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
                      <div className="md:col-span-1">
                        <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor={`campaign-discount-min-quantity-${index}`}>
                          Quantidade minima
                        </label>
                        <input
                          id={`campaign-discount-min-quantity-${index}`}
                          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                          inputMode="numeric"
                          type="text"
                          value={String(promotion.targetQuantity)}
                          onChange={(event) => controller.handlePromotionMinimumQuantityChange(index, event.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor={`campaign-discount-type-${index}`}>
                          Tipo de desconto
                        </label>
                        <CustomSelect
                          id={`campaign-discount-type-${index}`}
                          value={promotion.discountType}
                          options={controller.promotionDiscountTypeOptions}
                          onChange={(nextValue) => controller.handlePromotionDiscountTypeChange(index, nextValue === 'fixed' ? 'fixed' : 'percent')}
                        />
                      </div>
                      <div className="md:col-span-1">
                        <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor={`campaign-discount-value-${index}`}>
                          {promotion.discountType === 'percent' ? 'Valor do desconto (%)' : 'Valor fixo do desconto (R$)'}
                        </label>
                        <input
                          id={`campaign-discount-value-${index}`}
                          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
                          inputMode="decimal"
                          type="text"
                          value={promotion.discountValue.toString().replace('.', ',')}
                          onChange={(event) => controller.handlePromotionDiscountInputChange(index, event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
              <button
                className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-neon-pink/60 hover:text-neon-pink"
                type="button"
                onClick={controller.handleAddPromotion}
              >
                Adicionar regra de desconto
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          O desconto progressivo aplica automaticamente quando a compra atingir a quantidade minima configurada. As promocoes nao se acumulam;
          a maior regra elegivel prevalece.
        </p>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">Tabela de 8 brackets e tag mais compradas</p>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
              {controller.activePackPrices} ativos
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {controller.packPrices.slice(0, CAMPAIGN_PACK_QUANTITIES.length).map((pack, index) => {
              const quantity = pack.quantity
              const currentPrice = Number((quantity * controller.safePricePerCota).toFixed(2))
              const isMostPurchasedTagForRow = pack.mostPurchasedTag === true

              return (
                <div
                  key={`pack-${index}`}
                  className={`relative rounded-lg border p-3 transition-colors ${
                    isMostPurchasedTagForRow
                      ? 'border-amber-300/45 bg-amber-500/10'
                      : 'border-white/10 bg-black/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-white">Bracket {index + 1}</p>
                    <button
                      type="button"
                      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                        pack.active
                          ? 'border border-emerald-300/40 bg-emerald-500/15 text-emerald-200'
                          : 'border border-gray-500/40 bg-gray-500/10 text-gray-300'
                      }`}
                      onClick={() => controller.handlePackPriceActiveToggle(index)}
                    >
                      {pack.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                  <label className="mt-2 block text-[10px] uppercase tracking-[0.13em] text-cyan-100" htmlFor={`campaign-pack-quantity-${index}`}>
                    Numero de cotas
                  </label>
                  <input
                    id={`campaign-pack-quantity-${index}`}
                    className="mt-2 h-9 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none focus:border-cyan-200/70"
                    inputMode="numeric"
                    type="text"
                    value={String(quantity)}
                    onChange={(event) => controller.handlePackQuantityInputChange(index, event.target.value)}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-cyan-100">Valor automatico:</span>
                    <span className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white">
                      {formatCurrency(currentPrice)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border px-2 text-[10px] font-black uppercase tracking-[0.11em] transition ${
                      isMostPurchasedTagForRow
                        ? 'border-amber-300/55 bg-amber-300/25 text-amber-100'
                        : 'border-amber-300/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                    onClick={() => controller.handleToggleMostPurchasedTag(index)}
                    disabled={pack.active === false}
                  >
                    {isMostPurchasedTagForRow ? 'Tag ativa' : 'Tag mais compradas'}
                  </button>
                  {pack.active === false ? (
                    <p className="mt-2 text-[10px] text-gray-500">
                      Ative este pacote para selecionar a tag.
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </article>
  )
}
