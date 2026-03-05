import type { PrizesSectionProps } from './types'

export default function PrizesSection({ controller }: PrizesSectionProps) {
  return (
    <section className="rounded-2xl border border-amber-300/25 bg-amber-500/5 p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200">2. Premiacao</p>
      <div className="mt-3 space-y-4">
        <div className="rounded-xl border border-amber-300/25 bg-black/30 px-4 py-3">
          <label className="text-[10px] uppercase tracking-[0.16em] text-amber-100" htmlFor="campaign-total-numbers">
            Total de numeros da campanha
          </label>
          <input
            id="campaign-total-numbers"
            className="mt-2 h-11 w-full rounded-md border border-amber-300/30 bg-black/35 px-3 text-sm font-semibold text-amber-50 outline-none transition-colors focus:border-amber-200/80"
            type="text"
            value={controller.totalNumbersInput}
            onChange={(event) => controller.setTotalNumbersInput(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Ex: 3450000"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-main-prize">
              1º premio
            </label>
            <input
              id="campaign-main-prize"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
              type="text"
              value={controller.mainPrize}
              onChange={(event) => controller.setMainPrize(event.target.value)}
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-second-prize">
              2º premio
            </label>
            <input
              id="campaign-second-prize"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
              type="text"
              value={controller.secondPrize}
              onChange={(event) => controller.setSecondPrize(event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
          <label className="text-[10px] uppercase tracking-[0.16em] text-emerald-300" htmlFor="campaign-bonus-prize">
            Premio extra
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px]">
            <input
              id="campaign-bonus-prize"
              className="h-11 w-full rounded-md border border-emerald-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-300/60"
              type="text"
              value={controller.bonusPrize}
              onChange={(event) => controller.setBonusPrize(event.target.value)}
            />
            <input
              id="campaign-bonus-prize-quantity"
              className="h-11 w-full rounded-md border border-emerald-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-300/60"
              type="text"
              inputMode="numeric"
              placeholder="Qtd."
              value={controller.bonusPrizeQuantityInput}
              onChange={(event) => controller.setBonusPrizeQuantityInput(event.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>

        <div className="rounded-xl border border-purple-400/20 bg-purple-500/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-purple-300">
              Premios adicionais <span className="normal-case tracking-normal text-purple-400/60">(opcional)</span>
            </p>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-purple-300/30 bg-purple-500/15 px-2.5 text-[11px] font-bold text-purple-200 transition hover:bg-purple-500/25"
              onClick={() => controller.setAdditionalPrizes((current) => [...current, { label: '', quantity: 1 }])}
            >
              + Adicionar
            </button>
          </div>
          {controller.additionalPrizes.length === 0 ? (
            <p className="mt-2 text-xs text-purple-400/50">Nenhum premio adicional cadastrado.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {controller.additionalPrizes.map((prize, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    className="h-10 w-full rounded-md border border-purple-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-purple-300/60"
                    type="text"
                    value={prize.label}
                    placeholder="Ex: iPhone 15 Pro, Viagem..."
                    onChange={(event) => {
                      controller.setAdditionalPrizes((current) => {
                        const next = [...current]
                        next[index] = {
                          ...next[index],
                          label: event.target.value,
                        }
                        return next
                      })
                    }}
                  />
                  <input
                    className="h-10 w-24 flex-shrink-0 rounded-md border border-purple-300/25 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-purple-300/60"
                    type="text"
                    inputMode="numeric"
                    placeholder="Qtd."
                    value={String(prize.quantity || 1)}
                    onChange={(event) => {
                      controller.setAdditionalPrizes((current) => {
                        const next = [...current]
                        next[index] = {
                          ...next[index],
                          quantity: Number(event.target.value.replace(/\D/g, '')) || 1,
                        }
                        return next
                      })
                    }}
                  />
                  <button
                    type="button"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-red-400/30 bg-red-500/10 text-base font-bold text-red-300 transition hover:bg-red-500/20"
                    onClick={() => controller.setAdditionalPrizes((current) => current.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
