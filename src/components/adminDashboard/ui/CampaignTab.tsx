import { CAMPAIGN_STATUS_OPTIONS, DEFAULT_BONUS_PRIZE, DEFAULT_CAMPAIGN_TITLE, DEFAULT_MAIN_PRIZE, DEFAULT_SECOND_PRIZE } from '../../../const/campaign'
import type { CampaignStatus } from '../../../types/campaign'
import { useCampaignForm } from '../hooks/useCampaignForm'
import { formatCurrency, getCampaignStatusLabel } from '../utils/formatters'

export default function CampaignTab() {
  const {
    campaign,
    isLoading,
    isSaving,
    title,
    pricePerCotaInput,
    mainPrize,
    secondPrize,
    bonusPrize,
    status,
    startsAt,
    endsAt,
    setTitle,
    setPricePerCotaInput,
    setMainPrize,
    setSecondPrize,
    setBonusPrize,
    setStatus,
    setStartsAt,
    setEndsAt,
    handleSaveCampaignSettings,
  } = useCampaignForm()

  return (
    <section className="space-y-6">
      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
        <div className="pointer-events-none absolute -left-12 top-0 h-44 w-44 rounded-full bg-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">Central da Campanha</p>
            <h3 className="mt-2 font-luxury text-3xl font-bold text-white">Edição visual e comercial em tempo real</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Atualize nome, premiação e preço por cota em um único fluxo. Tudo que você salvar já vira referência para o restante do projeto.
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
    </section>
  )
}
