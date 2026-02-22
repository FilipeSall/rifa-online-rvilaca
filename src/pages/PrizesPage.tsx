import { useMemo } from 'react'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import PrizeWinnersShowcase from '../components/winners/PrizeWinnersShowcase'
import { useTopBuyersDraw } from '../hooks/useTopBuyersDraw'

function formatDrawDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || '-'
  }

  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function formatPublishedAt(timestampMs: number) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestampMs))
}

function buildWinnerCalculationLabel(item: {
  resolvedBy: 'federal_extraction' | 'redundancy'
  attempts: Array<{ extractionIndex: number, extractionNumber: string, candidateCode: string, matchedPosition: number | null }>
  extractionNumbers: string[]
  comparisonDigits: number
  participantCount: number
  winningPosition: number
}) {
  if (item.resolvedBy === 'federal_extraction') {
    const winnerAttempt = item.attempts.find((attempt) => attempt.matchedPosition === item.winningPosition)
    if (!winnerAttempt) {
      return `Match direto na posição ${item.winningPosition}.`
    }

    const winnerCode = winnerAttempt.candidateCode.padStart(item.comparisonDigits, '0')
    return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> últimos ${item.comparisonDigits} dígitos = ${winnerCode} -> match na posição ${item.winningPosition}.`
  }

  const seed = item.extractionNumbers
    .map((value) => Number(value))
    .reduce((sum, value, index) => sum + (value * (index + 1)), 0)
  const modulo = item.participantCount > 0 ? seed % item.participantCount : 0
  const normalizedPosition = modulo === 0 ? item.participantCount : modulo

  return `Redundância: seed = Σ(extração × peso) = ${seed}; ${seed} mod ${item.participantCount} = ${modulo}; posição final = ${normalizedPosition}.`
}

function formatWinnerUserCode(item: {
  winningCode: string
  comparisonDigits: number
}) {
  return String(item.winningCode || '').padStart(item.comparisonDigits, '0')
}

function pickComparableWinnerTicket(item: {
  winningCode: string
  winnerTicketNumbers: string[]
}) {
  if (!item.winnerTicketNumbers.length) {
    return null
  }

  const matchByEnding = item.winnerTicketNumbers.find((ticket) => ticket.endsWith(item.winningCode))
  return matchByEnding || item.winnerTicketNumbers[0]
}

function formatLoteriaInputs(extractionNumbers: string[]) {
  return extractionNumbers
    .map((value, index) => `${index + 1}ª extração: ${value}`)
    .join(' | ')
}

export default function PrizesPage() {
  const { result, history, isHistoryLoading } = useTopBuyersDraw(true, 'public')
  const visibleResults = useMemo(() => {
    const merged = result ? [result, ...history] : history
    const uniqueByDrawId = new Map(merged.map((item) => [item.drawId, item]))
    return Array.from(uniqueByDrawId.values()).sort((left, right) => (right.publishedAtMs || 0) - (left.publishedAtMs || 0))
  }, [history, result])

  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-gold selection:text-black">
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_10%_18%,rgba(245,158,11,0.24),transparent_38%),radial-gradient(circle_at_92%_8%,rgba(34,197,94,0.18),transparent_34%),linear-gradient(180deg,#0c1118_0%,#111a24_100%)] py-14 lg:py-20">
          <div className="pointer-events-none absolute -left-12 top-8 h-52 w-52 rounded-full border border-white/10 opacity-35" />
          <div className="pointer-events-none absolute right-[-70px] top-[-70px] h-60 w-60 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="container relative z-10 mx-auto px-4 lg:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Arquivo oficial</p>
            <h1 className="mt-3 max-w-4xl font-luxury text-4xl font-black leading-[1.08] text-white lg:text-6xl">
              Página de Prêmios
            </h1>
            <p className="mt-4 max-w-3xl text-sm text-gray-200 lg:text-base">
              Consulte todos os ganhadores já publicados e o cálculo usado em cada apuração da Loteria Federal.
            </p>
          </div>
        </section>

        <PrizeWinnersShowcase mode="public" />

        <section className="pb-20">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(165deg,rgba(17,24,39,0.96),rgba(7,10,15,0.95))] p-5 shadow-[0_26px_70px_rgba(0,0,0,0.45)] lg:p-7">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Histórico auditável</p>
                  <h2 className="mt-1 font-luxury text-3xl font-black text-white">Ganhadores e cálculo usado</h2>
                </div>
                <span className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-gray-400">
                  {visibleResults.length} resultados
                </span>
              </div>

              {isHistoryLoading && visibleResults.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((row) => (
                    <div key={row} className="h-14 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : null}

              {!isHistoryLoading && visibleResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center text-sm text-gray-300">
                  Nenhum resultado publicado até o momento.
                </div>
              ) : null}

              {visibleResults.length > 0 ? (
                <div className="space-y-3">
                  {visibleResults.map((item) => (
                    <article
                      key={item.drawId}
                      className="rounded-xl border border-white/10 bg-black/30 p-4 lg:p-5"
                    >
                      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
                            Sorteio {formatDrawDate(item.drawDate)}
                          </p>
                          <p className="mt-1 text-lg font-black text-white">{item.winner.name}</p>
                          <p className="mt-1 text-xs text-gray-300">
                            Prêmio: <span className="font-semibold text-amber-100">{item.drawPrize}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Cálculo exato: <span className="font-semibold text-white">{buildWinnerCalculationLabel(item)}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Código do ganhador premiado: <span className="font-bold text-gold">{formatWinnerUserCode(item)}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Cupom do ganhador para conferência:{' '}
                            <span className="font-bold text-gold">{pickComparableWinnerTicket(item) || '-'}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Códigos da Loteria informados: <span className="font-mono text-white">{formatLoteriaInputs(item.extractionNumbers)}</span>
                          </p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100">Cálculo usado</p>
                          <p className="mt-1 text-cyan-50">
                            Últimos {item.comparisonDigits} dígitos das extrações oficiais.
                          </p>
                          <p className="mt-1 text-cyan-50">
                            Código vencedor <span className="font-black text-white">{item.winningCode}</span> ➜ posição{' '}
                            <span className="font-black text-white">{item.winningPosition}</span> do ranking.
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-right text-xs">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Publicado em</p>
                          <p className="mt-1 font-semibold text-white">{formatPublishedAt(item.publishedAtMs)}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                        {item.attempts.map((attempt) => {
                          const isFallback = attempt.extractionIndex > 5 || attempt.extractionNumber.includes('-')

                          return (
                            <div
                              key={`${item.drawId}-${attempt.extractionIndex}-${attempt.candidateCode}`}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                            >
                              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
                                Tentativa {attempt.extractionIndex}
                              </p>
                              <p className="mt-1 font-mono text-gray-200">
                                {isFallback ? 'Cálculo de redundância' : attempt.extractionNumber}
                              </p>
                              <p className="mt-1 text-gray-300">
                                Código <span className="font-bold text-gold">{attempt.candidateCode}</span>
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
