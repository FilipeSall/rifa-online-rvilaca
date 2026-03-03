import { useMemo, useState } from 'react'
import { FAQ_ITEMS, type RankingItem } from '../../const/home'
import { TOP_BUYERS_SCHEDULE_TIMEZONE, TOP_BUYERS_WEEKDAY_OPTIONS } from '../../const/campaign'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { normalizeTopBuyersWeeklySchedule, resolveFreezeAtMs, resolveNextDrawAtMs } from '../../utils/topBuyersSchedule'

function formatDrawDate(drawDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) return drawDate || '-'
  const parsed = new Date(`${drawDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return drawDate
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed)
}
import { useChampionsRanking } from '../../hooks/useChampionsRanking'
import { useTopBuyersDraw } from '../../hooks/useTopBuyersDraw'
import { useWeeklyTopBuyersRanking } from '../../hooks/useWeeklyTopBuyersRanking'

type RankingBoardProps = {
  title: string
  subtitle: string
  items: RankingItem[]
  isLoading: boolean
  emptyMessage: string
  footer: string
  accentClassName: string
  errorMessage: string | null
}

function formatDateTime(timestampMs: number | null) {
  if (!timestampMs || !Number.isFinite(timestampMs)) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }).format(new Date(timestampMs))
}

function formatWeekId(weekId: string | null) {
  if (!weekId) {
    return '-'
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekId.trim())
  if (!match) {
    return weekId
  }

  return `${match[3]}/${match[2]}/${match[1]}`
}

function formatWinningPosition(position: number, participantCount: number) {
  const digits = Math.max(2, String(participantCount || 0).length)
  return String(position || 0).padStart(digits, '0')
}

function RankingBoard({
  title,
  subtitle,
  items,
  isLoading,
  emptyMessage,
  footer,
  accentClassName,
  errorMessage,
}: RankingBoardProps) {
  const hasItems = items.length > 0
  const visibleItems = items.slice(0, 10)

  return (
    <article className="bg-luxury-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
      <div className={`h-1 w-full ${accentClassName}`} />
      <div className="px-5 py-4 border-b border-white/10 bg-white/5">
        <h3 className="text-xl font-display font-bold text-white">{title}</h3>
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      </div>

      <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/10">
        <div className="col-span-2 text-center">Pos</div>
        <div className="col-span-7">Participante</div>
        <div className="col-span-3 text-right">Cotas</div>
      </div>

      <div className="divide-y divide-white/5 min-h-[430px]">
        {isLoading && !hasItems ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : null}

        {!isLoading && !hasItems ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-300">{emptyMessage}</p>
          </div>
        ) : null}

        {visibleItems.map(({ pos, name, cotas }) => (
          <div key={`${title}-${pos}-${name}`} className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-white/5 transition-colors">
            <div className="col-span-2 flex justify-center">
              {pos <= 3 ? (
                <div className="w-8 h-8 rounded-full bg-neon-pink/20 border border-neon-pink/35 flex items-center justify-center text-neon-pink font-black">
                  {pos}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-luxury-border border border-white/10 flex items-center justify-center text-gray-300 font-bold text-xs">
                  {pos}
                </div>
              )}
            </div>
            <div className="col-span-7">
              <span className="text-sm font-medium text-gray-200">{name}</span>
            </div>
            <div className="col-span-3 text-right">
              <span className="text-sm font-bold text-white">{cotas}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 bg-white/5 border-t border-white/10">
        {errorMessage ? (
          <p className="text-xs text-red-300">{errorMessage}</p>
        ) : (
          <p className="text-xs text-gray-400">{footer}</p>
        )}
      </div>
    </article>
  )
}

function RankingSection() {
  const generalRanking = useChampionsRanking()
  const weeklyRanking = useWeeklyTopBuyersRanking()
  const { result: latestDrawResult } = useTopBuyersDraw()
  const { campaign } = useCampaignSettings()
  const topBuyersSchedule = useMemo(
    () => normalizeTopBuyersWeeklySchedule(campaign.topBuyersWeeklySchedule),
    [campaign.topBuyersWeeklySchedule],
  )
  const topBuyersNextDrawAtMs = useMemo(
    () => resolveNextDrawAtMs(topBuyersSchedule),
    [topBuyersSchedule],
  )
  const topBuyersNextFreezeAtMs = useMemo(
    () => resolveFreezeAtMs(topBuyersNextDrawAtMs),
    [topBuyersNextDrawAtMs],
  )
  const topBuyersWeekdayLabel = useMemo(
    () => TOP_BUYERS_WEEKDAY_OPTIONS.find((item) => item.value === topBuyersSchedule.dayOfWeek)?.label || 'Sexta-feira',
    [topBuyersSchedule.dayOfWeek],
  )

  const weeklySubtitle = useMemo(() => {
    if (!weeklyRanking.weekStartAtMs || !weeklyRanking.weekEndAtMs) {
      return `Congelamento semanal no horario do sorteio (${topBuyersWeekdayLabel} ${topBuyersSchedule.drawTime}, ${TOP_BUYERS_SCHEDULE_TIMEZONE}).`
    }

    return `Semana ${formatWeekId(weeklyRanking.weekId)} | ${formatDateTime(weeklyRanking.weekStartAtMs)} ate ${formatDateTime(weeklyRanking.weekEndAtMs)}.`
  }, [
    topBuyersSchedule.drawTime,
    topBuyersWeekdayLabel,
    weeklyRanking.weekEndAtMs,
    weeklyRanking.weekId,
    weeklyRanking.weekStartAtMs,
  ])

  return (
    <section className="py-20 bg-luxury-bg relative overflow-hidden" id="ganhadores">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-pink/5 via-luxury-bg to-luxury-bg pointer-events-none" />
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="text-center mb-14">
          <span className="text-neon-pink font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Top Compradores</span>
          <div className="flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-neon-pink text-4xl">trophy</span>
            <h2 className="text-3xl lg:text-4xl font-display font-bold text-white">Ranking Geral + Ranking Semanal</h2>
          </div>
          <p className="text-gray-400 mt-4 max-w-3xl mx-auto">
            Transparencia total com dois painéis: desempenho histórico da campanha e Top 50 da semana com regras oficiais.
          </p>
          {latestDrawResult ? (
            <p className="mt-3 text-xs text-amber-200">
              Ultimo ganhador semanal publicado: <span className="font-bold">{latestDrawResult.winner.name}</span>{' '}
              (data {formatDrawDate(latestDrawResult.drawDate)}, posicao do jogador premiado{' '}
              {formatWinningPosition(latestDrawResult.winningPosition, latestDrawResult.participantCount)}).
            </p>
          ) : null}
          <p className="mt-2 text-xs text-cyan-100/85">
            Próximo sorteio Top: <span className="font-bold">{formatDateTime(topBuyersNextDrawAtMs)}</span> | congelamento do ranking:
            <span className="font-bold"> {formatDateTime(topBuyersNextFreezeAtMs)}</span> ({TOP_BUYERS_SCHEDULE_TIMEZONE}).
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <RankingBoard
            accentClassName="bg-gradient-to-r from-amber-400 via-neon-pink to-yellow-300"
            emptyMessage="Ainda nao ha compras pagas para montar o ranking geral."
            errorMessage={generalRanking.errorMessage}
            footer="Ranking geral por quantidade total de cotas pagas na campanha."
            isLoading={generalRanking.isLoading}
            items={generalRanking.items}
            subtitle="Classificacao acumulada em toda a edicao."
            title="Ranking Geral"
          />

          <RankingBoard
            accentClassName="bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-300"
            emptyMessage="Ainda nao ha compras pagas na janela semanal."
            errorMessage={weeklyRanking.errorMessage}
            footer={`Regra: ranking congela no horario do sorteio semanal (${topBuyersWeekdayLabel} ${topBuyersSchedule.drawTime}), desempate por compra mais antiga.`}
            isLoading={weeklyRanking.isLoading}
            items={weeklyRanking.items}
            subtitle={weeklySubtitle}
            title="Ranking Semanal (Top 50)"
          />
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="py-20 bg-luxury-card border-t border-white/5" id="faq">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-neon-pink font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Dúvidas?</span>
          <div className="flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-neon-pink text-4xl">help</span>
            <h2 className="text-3xl lg:text-4xl font-display font-bold text-white">Perguntas Frequentes</h2>
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {FAQ_ITEMS.map(({ q, a }, index) => {
            const isOpen = openIndex === index
            return (
              <article
                key={q}
                className={`group overflow-hidden rounded-xl border bg-luxury-bg transition-all duration-300 hover:border-neon-pink/30 ${
                  isOpen ? 'border-neon-pink shadow-[0_0_0_1px_rgba(255,0,204,0.2),0_10px_22px_rgba(255,0,204,0.14)]' : 'border-white/5'
                }`}
              >
                <button
                  className="flex w-full cursor-pointer items-center justify-between p-6 text-left select-none"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                >
                  <span className="text-lg font-medium text-white group-hover:text-neon-pink transition-colors">{q}</span>
                  <span
                    className={`material-symbols-outlined transition-transform duration-300 ${
                      isOpen ? 'rotate-180 text-neon-pink' : 'text-gray-500'
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-6 text-sm leading-relaxed text-gray-400 border-t border-white/5 pt-4">{a}</div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default function WinnersFaqSection() {
  return (
    <>
      <RankingSection />
      <FaqSection />
    </>
  )
}
