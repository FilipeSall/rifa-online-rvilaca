import { useMemo } from 'react'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import PrizeWinnersShowcase from '../components/winners/PrizeWinnersShowcase'
import { useMainRaffleDraw } from '../hooks/useMainRaffleDraw'
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
  attempts: Array<{
    extractionIndex: number
    extractionNumber: string
    rawCandidateCode?: string
    candidateCode: string
    nearestDirection?: 'none' | 'below' | 'above'
    nearestDistance?: number | null
    matchedPosition: number | null
  }>
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

    const rawCode = (winnerAttempt.rawCandidateCode || winnerAttempt.candidateCode).padStart(item.comparisonDigits, '0')
    const resolvedCode = winnerAttempt.candidateCode.padStart(item.comparisonDigits, '0')
    const hasPath = rawCode !== resolvedCode

    if (hasPath) {
      const directionLabel = winnerAttempt.nearestDirection === 'below' ? 'abaixo' : 'acima'
      return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> últimos ${item.comparisonDigits} dígitos = ${rawCode} -> aproximação: ${rawCode} -> ${resolvedCode} (${directionLabel}, dist ${winnerAttempt.nearestDistance ?? '?'}) -> match na posição ${item.winningPosition}.`
    }

    return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> últimos ${item.comparisonDigits} dígitos = ${resolvedCode} -> match na posição ${item.winningPosition}.`
  }

  return 'Fallback de segurança: nenhuma extração encontrou código elegível e o sistema aplicou posição final de contingência.'
}

function formatNearestPath(attempt: {
  rawCandidateCode?: string
  candidateCode: string
  nearestDirection?: 'none' | 'below' | 'above'
  nearestDistance?: number | null
}) {
  const raw = (attempt.rawCandidateCode || '').trim()
  if (!raw || raw === attempt.candidateCode) {
    return null
  }

  const directionLabel = attempt.nearestDirection === 'below'
    ? 'abaixo'
    : attempt.nearestDirection === 'above'
      ? 'acima'
      : 'proximo'
  const distanceLabel = Number.isFinite(Number(attempt.nearestDistance))
    ? String(attempt.nearestDistance)
    : '?'
  return `${raw} (${directionLabel}, dist ${distanceLabel})`
}

function formatWinnerUserCode(item: {
  winningPosition: number
  participantCount: number
}) {
  const digits = Math.max(2, String(item.participantCount || 0).length)
  return String(item.winningPosition || 0).padStart(digits, '0')
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

function formatMainFallbackDirectionLabel(direction: 'none' | 'above' | 'below') {
  if (direction === 'above') {
    return 'acima'
  }
  if (direction === 'below') {
    return 'abaixo'
  }
  return 'match exato'
}

function buildMainRaffleCalculationLabel(item: {
  selectedExtractionIndex: number
  selectedExtractionNumber: string
  raffleTotalNumbers: number
  moduloTargetOffset: number
  targetNumberFormatted: string
  winningNumberFormatted: string
  fallbackDirection: 'none' | 'above' | 'below'
}) {
  const total = Math.max(1, Number(item.raffleTotalNumbers) || 1)
  const selected = item.selectedExtractionNumber || '-'
  const modulo = String(item.moduloTargetOffset || 0)
  const target = item.targetNumberFormatted || '-'
  const winning = item.winningNumberFormatted || '-'
  const direction = formatMainFallbackDirectionLabel(item.fallbackDirection)
  return `Extração ${item.selectedExtractionIndex} (${selected}) MOD ${total} = ${modulo} -> alvo ${target} -> vencedor ${winning} (${direction}).`
}

function buildMainRaffleFallbackPath(item: {
  targetNumber: number
  winningNumber: number
  targetNumberFormatted: string
  winningNumberFormatted: string
  fallbackDirection: 'none' | 'above' | 'below'
}) {
  if (item.fallbackDirection === 'none') {
    return null
  }

  const distance = Math.abs((item.winningNumber || 0) - (item.targetNumber || 0))
  const direction = formatMainFallbackDirectionLabel(item.fallbackDirection)
  return `${item.targetNumberFormatted} -> ${item.winningNumberFormatted} (${direction}, dist ${distance})`
}

export default function PrizesPage() {
  const { result, history, isHistoryLoading } = useTopBuyersDraw(false, 'public')
  const {
    result: latestMainResult,
    history: mainHistory,
    isHistoryLoading: isMainHistoryLoading,
  } = useMainRaffleDraw(false)
  const visibleResults = useMemo(() => {
    const merged = result ? [result, ...history] : history
    const uniqueByDrawId = new Map(merged.map((item) => [item.drawId, item]))
    return Array.from(uniqueByDrawId.values()).sort((left, right) => (right.publishedAtMs || 0) - (left.publishedAtMs || 0))
  }, [history, result])
  const visibleMainResults = useMemo(() => {
    const merged = latestMainResult ? [latestMainResult, ...mainHistory] : mainHistory
    const uniqueByDrawId = new Map(merged.map((item) => [item.drawId, item]))
    return Array.from(uniqueByDrawId.values()).sort((left, right) => (right.publishedAtMs || 0) - (left.publishedAtMs || 0))
  }, [latestMainResult, mainHistory])

  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-neon-pink selection:text-black">
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

        <section className="pb-12">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(165deg,rgba(17,24,39,0.96),rgba(7,10,15,0.95))] p-5 lg:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Sorteio principal</p>
              <h2 className="mt-2 font-luxury text-3xl font-black text-white">BMW / CG / PIX por numero da rifa</h2>
              <p className="mt-2 text-sm text-gray-300">
                Formula oficial: numero alvo = resultado da extracao selecionada MOD total da rifa. Se nao houver numero pago
                elegivel no alvo, aplica fallback para o proximo pago acima e, se necessario, abaixo.
              </p>

              {isMainHistoryLoading && visibleMainResults.length === 0 ? (
                <div className="mt-4 space-y-2">
                  {[1, 2, 3].map((row) => (
                    <div key={row} className="h-14 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : null}

              {!isMainHistoryLoading && visibleMainResults.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-gray-300">
                  Nenhum resultado do sorteio principal publicado ate o momento.
                </div>
              ) : null}

              {visibleMainResults.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {visibleMainResults.map((item) => (
                    <article key={item.drawId} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <p className="text-lg font-black text-white">{item.drawPrize}</p>
                      <p className="mt-1 text-sm text-gray-200">
                        Numero vencedor: <span className="font-mono font-bold text-neon-pink">{item.winningNumberFormatted}</span> (
                        {item.winner.name})
                      </p>
                      <p className="mt-1 text-xs text-gray-300">
                        Cálculo exato:{' '}
                        <span className="font-semibold text-white">{buildMainRaffleCalculationLabel(item)}</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-300">
                        Códigos da Loteria informados:{' '}
                        <span className="font-mono text-white">{formatLoteriaInputs(item.extractionNumbers)}</span>
                      </p>
                      {buildMainRaffleFallbackPath(item) ? (
                        <p className="mt-1 text-xs text-gray-300">
                          Rastro de aproximação:{' '}
                          <span className="font-semibold text-white">{buildMainRaffleFallbackPath(item)}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-300">
                          Rastro de aproximação:{' '}
                          <span className="font-semibold text-white">não foi necessário (match exato no alvo)</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-300">
                        Extração usada: {item.selectedExtractionIndex} ({item.selectedExtractionNumber}) | alvo por MOD:{' '}
                        {item.targetNumberFormatted}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">Data: {item.drawDate}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

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
                  {visibleResults.map((item) => {
                    const winnerAttempt = item.attempts.find((attempt) => attempt.matchedPosition === item.winningPosition)
                    const rawWinnerCode = winnerAttempt?.rawCandidateCode || winnerAttempt?.candidateCode || item.winningCode
                    const resolvedWinnerCode = winnerAttempt?.candidateCode || item.winningCode
                    const hasApproximationPath = Boolean(rawWinnerCode && resolvedWinnerCode && rawWinnerCode !== resolvedWinnerCode)
                    const directionLabel = winnerAttempt?.nearestDirection === 'below'
                      ? 'abaixo'
                      : winnerAttempt?.nearestDirection === 'above'
                        ? 'acima'
                        : 'proximo'

                    return (
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
                            Posição do jogador premiado: <span className="font-bold text-neon-pink">{formatWinnerUserCode(item)}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Número premiado:{' '}
                            <span className="font-bold text-neon-pink">{pickComparableWinnerTicket(item) || '-'}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Códigos da Loteria informados: <span className="font-mono text-white">{formatLoteriaInputs(item.extractionNumbers)}</span>
                          </p>
                        </div>
                        <div className="rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100">Cálculo usado</p>
                          <p className="mt-1 text-cyan-50">
                            Últimos {item.comparisonDigits} dígitos da extração {winnerAttempt?.extractionIndex || 1} ({winnerAttempt?.extractionNumber || item.extractionNumbers[0] || '-'}) ={' '}
                            <span className="font-black text-white">{String(rawWinnerCode).padStart(item.comparisonDigits, '0')}</span>.
                          </p>
                          {hasApproximationPath ? (
                            <p className="mt-1 text-cyan-50">
                              Aproximação aplicada:{' '}
                              <span className="font-black text-white">
                                {String(rawWinnerCode).padStart(item.comparisonDigits, '0')}{' -> '}{String(resolvedWinnerCode).padStart(item.comparisonDigits, '0')}
                              </span>{' '}
                              ({directionLabel}, dist {winnerAttempt?.nearestDistance ?? '?'}).
                            </p>
                          ) : null}
                          <p className="mt-1 text-cyan-50">
                            Código final comparado <span className="font-black text-white">{String(resolvedWinnerCode).padStart(item.comparisonDigits, '0')}</span> ➜ posição{' '}
                            <span className="font-black text-white">{formatWinnerUserCode(item)}</span> do ranking.
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
                                {isFallback ? 'Fallback de segurança' : attempt.extractionNumber}
                              </p>
                              <p className="mt-1 text-gray-300">
                                Código <span className="font-bold text-neon-pink">{attempt.candidateCode}</span>
                              </p>
                              {formatNearestPath(attempt) ? (
                                <p className="mt-1 text-gray-300">
                                  Caminho <span className="font-mono text-white">{formatNearestPath(attempt)}</span>
                                </p>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </article>
                    )
                  })}
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
