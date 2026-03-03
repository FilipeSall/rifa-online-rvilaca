import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import prizesPortrait from '../assets/IMG_9378.webp'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import CampaignDeadlineCountdownCard from '../components/winners/CampaignDeadlineCountdownCard'
import PrizeWinnersShowcase from '../components/winners/PrizeWinnersShowcase'
import { useMainRaffleDraw } from '../hooks/useMainRaffleDraw'
import { usePublicCampaignDeadline } from '../hooks/usePublicCampaignDeadline'
import { useTopBuyersDraw } from '../hooks/useTopBuyersDraw'
import { pickComparableWinnerTicketNumber } from '../utils/topBuyersWinner'

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
      return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> últimos ${item.comparisonDigits} dígitos = ${rawCode} -> aproximação: ${rawCode} -> ${resolvedCode} (${directionLabel}) -> match na posição ${item.winningPosition}.`
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
  return `${raw} -> ${attempt.candidateCode} (${directionLabel})`
}

function formatWinnerUserCode(item: {
  winningPosition: number
  participantCount: number
}) {
  const digits = Math.max(2, String(item.participantCount || 0).length)
  return String(item.winningPosition || 0).padStart(digits, '0')
}

function pickComparableWinnerTicket(item: {
  winningTicketNumber: string | null
  winningCode: string
  winningPosition: number
  comparisonDigits: number
  attempts: Array<{
    matchedPosition: number | null
    rawCandidateCode?: string
    candidateCode: string
  }>
  winnerTicketNumbers: string[]
}) {
  return pickComparableWinnerTicketNumber({
    winningTicketNumber: item.winningTicketNumber,
    winningCode: item.winningCode,
    winningPosition: item.winningPosition,
    comparisonDigits: item.comparisonDigits,
    attempts: item.attempts,
    winnerTicketNumbers: item.winnerTicketNumbers,
  })
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

  const direction = formatMainFallbackDirectionLabel(item.fallbackDirection)
  return `${item.targetNumberFormatted} -> ${item.winningNumberFormatted} (${direction})`
}

export default function PrizesPage() {
  const { hasDeadline, targetTimeMs, isExpired } = usePublicCampaignDeadline()
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
  const totalPublishedResults = visibleResults.length + visibleMainResults.length
  const latestPublicationMs = useMemo(() => {
    const publishedValues = [...visibleResults, ...visibleMainResults]
      .map((item) => item.publishedAtMs || 0)
      .filter((value) => Number.isFinite(value) && value > 0)
    return publishedValues.length > 0 ? Math.max(...publishedValues) : 0
  }, [visibleMainResults, visibleResults])
  const latestPublicationLabel = latestPublicationMs > 0
    ? formatPublishedAt(latestPublicationMs)
    : 'Aguardando primeira publicação'
  const [isPrizesPortraitLoaded, setIsPrizesPortraitLoaded] = useState(false)

  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-neon-pink selection:text-black">
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_14%_20%,rgba(245,158,11,0.24),transparent_36%),radial-gradient(circle_at_82%_12%,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_78%_78%,rgba(59,130,246,0.18),transparent_44%),linear-gradient(180deg,#080c13_0%,#0f1824_100%)] py-12 lg:py-20">
          <div className="pointer-events-none absolute -left-10 top-8 h-56 w-56 rounded-full border border-white/10 opacity-35" />
          <div className="pointer-events-none absolute right-[-60px] top-[-80px] h-72 w-72 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-120px] left-[28%] h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />

          <div className="container relative z-10 mx-auto px-4 lg:px-8">
            <div className="grid gap-10 xl:grid-cols-[1.06fr_0.94fr] xl:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Arquivo oficial</p>
                <h1 className="mt-3 max-w-4xl font-display text-4xl font-black leading-[1.05] text-white lg:text-6xl">
                  Premiação transparente, ganhadores reais.
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-200 lg:text-base">
                  Consulte todos os resultados publicados, com trilha matemática completa da Loteria Federal e validação de
                  cada número premiado.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    to="/comprar"
                    className="inline-flex h-11 items-center justify-center rounded-full border border-neon-pink/35 bg-[linear-gradient(120deg,rgba(255,0,204,0.2)_0%,rgba(79,70,229,0.22)_56%,rgba(0,242,255,0.16)_100%)] px-6 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-neon-pink/55 hover:bg-[linear-gradient(120deg,rgba(255,0,204,0.26)_0%,rgba(79,70,229,0.28)_56%,rgba(0,242,255,0.22)_100%)]"
                  >
                    Garantir números
                  </Link>
                  <Link
                    to="/regulamento"
                    className="inline-flex h-11 items-center justify-center rounded-full border border-white/15 bg-black/20 px-6 text-xs font-bold uppercase tracking-[0.16em] text-gray-100 transition-colors hover:border-amber-300/45 hover:text-amber-100"
                  >
                    Ver regulamento
                  </Link>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <article className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">Resultados oficiais</p>
                    <p className="mt-2 text-2xl font-black text-white">{totalPublishedResults}</p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Última atualização</p>
                    <p className="mt-2 text-sm font-bold text-white">{latestPublicationLabel}</p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">Modelo de apuração</p>
                    <p className="mt-2 text-sm font-semibold text-gray-100">Loteria Federal</p>
                  </article>
                </div>
              </div>

              <aside className="relative mx-auto w-full max-w-[420px] xl:mx-0 xl:justify-self-end">
                <div className="pointer-events-none absolute -left-7 top-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
                <div className="pointer-events-none absolute -right-8 bottom-6 h-48 w-48 rounded-full bg-neon-pink/20 blur-3xl" />
                <div className="relative overflow-hidden rounded-[2.1rem] border border-white/15 bg-[linear-gradient(155deg,rgba(255,255,255,0.08),rgba(15,20,32,0.92))] p-2 shadow-[0_35px_80px_rgba(0,0,0,0.52)]">
                  <div className="relative min-h-[260px] overflow-hidden rounded-[1.65rem] border border-white/10 bg-black sm:min-h-[320px]">
                    {!isPrizesPortraitLoaded ? (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 z-10 animate-pulse bg-[linear-gradient(140deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))]"
                      />
                    ) : null}
                    <img
                      src={prizesPortrait}
                      alt="Foto oficial da campanha com a moto de premiação"
                      className={`h-auto w-full object-contain transition-opacity duration-500 ${isPrizesPortraitLoaded ? 'opacity-100' : 'opacity-0'}`}
                      loading="lazy"
                      onLoad={() => setIsPrizesPortraitLoaded(true)}
                      onError={() => setIsPrizesPortraitLoaded(true)}
                    />
                    <CampaignDeadlineCountdownCard
                      hasDeadline={hasDeadline}
                      targetTimeMs={targetTimeMs}
                      isExpired={isExpired}
                    />
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <PrizeWinnersShowcase mode="public" />

        <section className="pb-12 pt-4">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="relative overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(158deg,rgba(19,28,41,0.95),rgba(6,10,15,0.97))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.48)] lg:p-7">
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-neon-pink/10 blur-3xl" />

              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Sorteio principal</p>
              <h2 className="mt-2 font-display text-3xl font-black text-white">BMW / CG / PIX por número da rifa</h2>
              <p className="mt-2 text-sm text-gray-300">
                Fórmula oficial: número alvo = resultado da extração selecionada MOD total da rifa. Se não houver número pago
                elegível no alvo, aplica fallback para o próximo pago acima e, se necessário, abaixo.
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
                  Nenhum resultado do sorteio principal publicado até o momento.
                </div>
              ) : null}

              {visibleMainResults.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {visibleMainResults.map((item) => {
                    const fallbackPath = buildMainRaffleFallbackPath(item)

                    return (
                      <article
                        key={item.drawId}
                        className="rounded-2xl border border-white/10 bg-[linear-gradient(165deg,rgba(7,10,14,0.8),rgba(7,10,14,0.55))] p-4 transition-colors hover:border-cyan-300/35 lg:p-5"
                      >
                        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                          <div>
                            <p className="text-lg font-black text-white">{item.drawPrize}</p>
                            <p className="mt-1 text-sm text-gray-200">
                              Número vencedor:{' '}
                              <span className="font-mono font-bold text-neon-pink">{item.winningNumberFormatted}</span> ({item.winner.name})
                            </p>
                            <p className="mt-1 text-xs text-gray-300">
                              Cálculo exato: <span className="font-semibold text-white">{buildMainRaffleCalculationLabel(item)}</span>
                            </p>
                            <p className="mt-1 text-xs text-gray-300">
                              Códigos da Loteria informados: <span className="font-mono text-white">{formatLoteriaInputs(item.extractionNumbers)}</span>
                            </p>
                            <p className="mt-1 text-xs text-gray-300">
                              Extração premiada: <span className="font-semibold text-white">1ª extração ({item.extractionNumbers[0] || '-'})</span>
                            </p>
                            <p className="mt-1 text-xs text-gray-300">
                              Rastro de aproximação:{' '}
                              <span className="font-semibold text-white">
                                {fallbackPath || 'não foi necessário (match exato no alvo)'}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-gray-300">
                              Extração usada: {item.selectedExtractionIndex} ({item.selectedExtractionNumber}) | alvo por MOD:{' '}
                              {item.targetNumberFormatted}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-right text-xs">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">Publicado em</p>
                            <p className="mt-1 font-semibold text-white">{formatPublishedAt(item.publishedAtMs)}</p>
                            <p className="mt-1 text-gray-400">Sorteio: {formatDrawDate(item.drawDate)}</p>
                          </div>
                        </div>
                      </article>
                    )
                  })}
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
                  <h2 className="mt-1 font-display text-3xl font-black text-white">Ganhadores e cálculo usado</h2>
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
                        className="rounded-xl border border-white/10 bg-black/30 p-4 transition-colors hover:border-neon-pink/35 lg:p-5"
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
                                ({directionLabel}).
                              </p>
                            ) : null}
                            <p className="mt-1 text-cyan-50">
                              Código final comparado <span className="font-black text-white">{String(resolvedWinnerCode).padStart(item.comparisonDigits, '0')}</span> {'->'} posição{' '}
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
                            const isFinalFallback = attempt.extractionNumber.includes('-')
                            const isNearestAttempt = !isFinalFallback && attempt.nearestDirection !== 'none'

                            return (
                              <div
                                key={`${item.drawId}-${attempt.extractionIndex}-${attempt.candidateCode}`}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                              >
                                <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
                                  Tentativa {attempt.extractionIndex}
                                </p>
                                <p className="mt-1 font-mono text-gray-200">
                                  {isFinalFallback
                                    ? 'Fallback de segurança'
                                    : attempt.extractionNumber + (isNearestAttempt ? ' (aprox.)' : '')}
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
