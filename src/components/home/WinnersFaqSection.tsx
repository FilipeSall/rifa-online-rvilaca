import { useMemo, useState } from 'react'
import { FAQ_ITEMS, type RankingItem } from '../../const/home'
import { TOP_BUYERS_SCHEDULE_TIMEZONE } from '../../const/campaign'
import { useChampionsRanking } from '../../hooks/useChampionsRanking'
import { useScopedCampaignSettings } from '../../hooks/useScopedCampaignSettings'
import { useTopBuyersDraw } from '../../hooks/useTopBuyersDraw'
import { useWeeklyTopBuyersRanking } from '../../hooks/useWeeklyTopBuyersRanking'

function formatDrawDate(drawDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) return drawDate || '-'
  const parsed = new Date(`${drawDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return drawDate
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed)
}

type RankingBoardProps = {
  title: string
  subtitle: string
  items: RankingItem[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
  isLoading: boolean
  emptyMessage: string
  footer: string
  accentClassName: string
  errorMessage: string | null
}

type PaginationToken = number | 'ellipsis'

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

function buildPaginationTokens(currentPage: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 1) {
    return []
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const tokens: PaginationToken[] = [1]
  const middleStart = Math.max(2, currentPage - 1)
  const middleEnd = Math.min(totalPages - 1, currentPage + 1)

  if (middleStart > 2) {
    tokens.push('ellipsis')
  }

  for (let page = middleStart; page <= middleEnd; page += 1) {
    tokens.push(page)
  }

  if (middleEnd < totalPages - 1) {
    tokens.push('ellipsis')
  }

  tokens.push(totalPages)

  return tokens
}

function RankingBoard({
  title,
  subtitle,
  items,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  isLoading,
  emptyMessage,
  footer,
  accentClassName,
  errorMessage,
}: RankingBoardProps) {
  const hasItems = items.length > 0
  const canPaginate = totalPages > 1
  const visibleItems = items
  const windowStart = totalItems > 0 ? (page - 1) * pageSize + 1 : 0
  const windowEnd = totalItems > 0 ? Math.min(page * pageSize, totalItems) : 0
  const paginationTokens = useMemo(() => buildPaginationTokens(page, totalPages), [page, totalPages])
  const previousDisabled = page <= 1 || isLoading
  const nextDisabled = page >= totalPages || isLoading

  return (
    <article className="bg-luxury-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
      <div className={`h-1 w-full ${accentClassName}`} />
      <div className="px-5 py-4 border-b border-white/10 bg-white/5">
        <h3 className="text-xl font-display font-bold text-white">{title}</h3>
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            <span className={`h-1.5 w-1.5 rounded-full ${isLoading ? 'bg-amber-300 animate-pulse' : 'bg-emerald-300'}`} />
            Pagina {page} de {Math.max(totalPages, 1)}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            Exibindo {windowStart}-{windowEnd} de {totalItems}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/10">
        <div className="col-span-2 text-center">Pos</div>
        <div className="col-span-7">Participante</div>
        <div className="col-span-3 text-right">Cotas</div>
      </div>

      <div className="divide-y divide-white/5 min-h-[500px]">
        {isLoading && !hasItems ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
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

      {canPaginate ? (
        <div className="px-5 py-4 border-t border-white/10 bg-gradient-to-r from-white/[0.02] via-white/[0.08] to-white/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-xs font-semibold text-gray-200 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-neon-pink/40 hover:text-neon-pink"
              type="button"
              disabled={previousDisabled}
              onClick={() => onPageChange(page - 1)}
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              Anterior
            </button>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {paginationTokens.map((token, tokenIndex) => (
                token === 'ellipsis' ? (
                  <span key={`ellipsis-${tokenIndex}`} className="px-1.5 text-xs text-gray-400">...</span>
                ) : (
                  <button
                    key={`page-${token}`}
                    className={`h-9 min-w-9 rounded-xl border px-2 text-xs font-bold transition ${
                      token === page
                        ? 'border-transparent bg-gradient-to-br from-neon-pink via-fuchsia-500 to-blue-500 text-white shadow-[0_10px_22px_rgba(255,0,204,0.32)]'
                        : 'border-white/15 bg-black/20 text-gray-300 hover:border-neon-pink/40 hover:text-neon-pink'
                    }`}
                    type="button"
                    aria-label={`Ir para a pagina ${token}`}
                    onClick={() => onPageChange(token)}
                  >
                    {token}
                  </button>
                )
              ))}
            </div>

            <button
              className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-xs font-semibold text-gray-200 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-neon-pink/40 hover:text-neon-pink"
              type="button"
              disabled={nextDisabled}
              onClick={() => onPageChange(page + 1)}
            >
              Proxima
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      ) : null}

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
  const { campaign } = useScopedCampaignSettings()
  const [generalPage, setGeneralPage] = useState(1)
  const [weeklyPage, setWeeklyPage] = useState(1)
  const generalRanking = useChampionsRanking(generalPage)
  const weeklyRanking = useWeeklyTopBuyersRanking(weeklyPage)
  const { result: latestDrawResult } = useTopBuyersDraw()
  const weeklyRankingLimit = useMemo(() => {
    const parsed = Number(campaign.topBuyersRankingLimit)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 50
    }

    return Math.min(parsed, 50)
  }, [campaign.topBuyersRankingLimit])

  const weeklySubtitle = useMemo(() => {
    if (!weeklyRanking.weekStartAtMs || !weeklyRanking.weekEndAtMs) {
      return 'Ranking do ciclo atual com atualização em tempo real.'
    }

    return `Ciclo ${formatWeekId(weeklyRanking.weekId)} | ${formatDateTime(weeklyRanking.weekStartAtMs)} ate ${formatDateTime(weeklyRanking.weekEndAtMs)}.`
  }, [weeklyRanking.weekEndAtMs, weeklyRanking.weekId, weeklyRanking.weekStartAtMs])

  const handleGeneralPageChange = (nextPage: number) => {
    const maxPage = generalRanking.totalPages > 0 ? generalRanking.totalPages : 1
    const normalized = Math.max(1, Math.min(nextPage, maxPage))
    setGeneralPage(normalized)
  }

  const handleWeeklyPageChange = (nextPage: number) => {
    const maxPage = weeklyRanking.totalPages > 0 ? weeklyRanking.totalPages : 1
    const normalized = Math.max(1, Math.min(nextPage, maxPage))
    setWeeklyPage(normalized)
  }

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
            Transparencia total com dois painéis: desempenho histórico da campanha e ranking do ciclo atual com regras oficiais.
          </p>
          {latestDrawResult ? (
            <p className="mt-3 text-xs text-amber-200">
              Ultimo ganhador semanal publicado: <span className="font-bold">{latestDrawResult.winner.name}</span>{' '}
              (data {formatDrawDate(latestDrawResult.drawDate)}, posicao do jogador premiado{' '}
              {formatWinningPosition(latestDrawResult.winningPosition, latestDrawResult.participantCount)}).
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <RankingBoard
            accentClassName="bg-gradient-to-r from-amber-400 via-neon-pink to-yellow-300"
            emptyMessage="Ainda nao ha compras pagas para montar o ranking geral."
            errorMessage={generalRanking.errorMessage}
            footer="Ranking geral por quantidade total de cotas pagas na campanha."
            isLoading={generalRanking.isLoading}
            items={generalRanking.items}
            onPageChange={handleGeneralPageChange}
            page={generalRanking.page}
            pageSize={generalRanking.pageSize}
            subtitle="Classificacao acumulada em toda a edicao."
            title="Ranking Geral"
            totalItems={generalRanking.totalItems}
            totalPages={generalRanking.totalPages}
          />

          <RankingBoard
            accentClassName="bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-300"
            emptyMessage="Ainda nao ha compras pagas na janela semanal."
            errorMessage={weeklyRanking.errorMessage}
            footer="Ranking atualizado em tempo real. Desempate por compra mais antiga. O ciclo reinicia após cada publicação do Sorteio Top."
            isLoading={weeklyRanking.isLoading}
            items={weeklyRanking.items}
            onPageChange={handleWeeklyPageChange}
            page={weeklyRanking.page}
            pageSize={weeklyRanking.pageSize}
            subtitle={weeklySubtitle}
            title={`Ranking Semanal (Top ${weeklyRankingLimit})`}
            totalItems={weeklyRanking.totalItems}
            totalPages={weeklyRanking.totalPages}
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
