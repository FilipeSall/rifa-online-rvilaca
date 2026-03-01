import { Link } from 'react-router-dom'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { useMainRaffleDraw } from '../../hooks/useMainRaffleDraw'
import { useTopBuyersDraw } from '../../hooks/useTopBuyersDraw'

type PrizeWinnersShowcaseProps = {
  mode?: 'public' | 'dashboard'
}

function formatDateLabel(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue || '-'
  }

  const parsed = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return dateValue
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

function formatAttemptLabel(extractionNumber: string, comparisonDigits: number) {
  const normalized = extractionNumber.padStart(6, '0')
  return normalized.slice(-comparisonDigits).padStart(comparisonDigits, '0')
}

function formatWinningPosition(position: number, participantCount: number) {
  const digits = Math.max(2, String(participantCount || 0).length)
  return String(position || 0).padStart(digits, '0')
}

function buildWinnerCalculationLabel(result: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>) {
  if (result.resolvedBy === 'federal_extraction') {
    const winnerAttempt = result.attempts.find((attempt) => attempt.matchedPosition === result.winningPosition)
    if (!winnerAttempt) {
      return `Match direto na posição ${result.winningPosition}.`
    }

    const rawCode = (winnerAttempt.rawCandidateCode || winnerAttempt.candidateCode).padStart(result.comparisonDigits, '0')
    const resolvedCode = winnerAttempt.candidateCode.padStart(result.comparisonDigits, '0')
    const hasPath = rawCode !== resolvedCode

    if (hasPath) {
      const directionLabel = winnerAttempt.nearestDirection === 'below' ? 'abaixo' : 'acima'
      return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> últimos ${result.comparisonDigits} dígitos = ${rawCode} -> aproximação aplicada (${directionLabel}, dist ${winnerAttempt.nearestDistance ?? '?'}) -> match na posição ${formatWinningPosition(result.winningPosition, result.participantCount)}.`
    }

    return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> últimos ${result.comparisonDigits} dígitos = ${resolvedCode} -> match na posição ${formatWinningPosition(result.winningPosition, result.participantCount)}.`
  }

  return 'Fallback de segurança: nenhuma extração encontrou código elegível e o sistema aplicou posição final de contingência.'
}

function formatNearestPath(attempt: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>['attempts'][number]) {
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

function formatWinnerUserCode(result: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>) {
  const digits = Math.max(2, String(result.participantCount || 0).length)
  return String(result.winningPosition || 0).padStart(digits, '0')
}

function pickComparableWinnerTicket(result: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>) {
  if (!result.winnerTicketNumbers.length) {
    return null
  }

  const matchByEnding = result.winnerTicketNumbers.find((ticket) => ticket.endsWith(result.winningCode))
  return matchByEnding || result.winnerTicketNumbers[0]
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

function buildMainWinnerCalculationLabel(result: NonNullable<ReturnType<typeof useMainRaffleDraw>['result']>) {
  const total = Math.max(1, Number(result.raffleTotalNumbers) || 1)
  const direction = formatMainFallbackDirectionLabel(result.fallbackDirection)
  return `Extração ${result.selectedExtractionIndex} (${result.selectedExtractionNumber}) MOD ${total} = ${result.moduloTargetOffset} -> alvo ${result.targetNumberFormatted} -> vencedor ${result.winningNumberFormatted} (${direction}).`
}

function buildMainFallbackPath(result: NonNullable<ReturnType<typeof useMainRaffleDraw>['result']>) {
  if (result.fallbackDirection === 'none') {
    return null
  }

  const distance = Math.abs((result.winningNumber || 0) - (result.targetNumber || 0))
  const direction = formatMainFallbackDirectionLabel(result.fallbackDirection)
  return `${result.targetNumberFormatted} -> ${result.winningNumberFormatted} (${direction}, dist ${distance})`
}

export default function PrizeWinnersShowcase({ mode = 'public' }: PrizeWinnersShowcaseProps) {
  const { campaign } = useCampaignSettings()
  const {
    result: topResult,
    isLoading: isTopLoading,
    errorMessage: topErrorMessage,
  } = useTopBuyersDraw()
  const {
    result: mainResult,
    isLoading: isMainLoading,
    errorMessage: mainErrorMessage,
  } = useMainRaffleDraw()
  const isPublicMode = mode === 'public'
  const topPublishedAt = topResult?.publishedAtMs || 0
  const mainPublishedAt = mainResult?.publishedAtMs || 0
  const latestResultType = mainResult && (!topResult || mainPublishedAt >= topPublishedAt) ? 'main' : 'top'
  const hasAnyResult = Boolean(topResult || mainResult)
  const isLoadingLatest = !hasAnyResult && (isTopLoading || isMainLoading)
  const mergedErrorMessage = [topErrorMessage, mainErrorMessage].filter(Boolean).join(' | ')

  return (
    <section className={isPublicMode ? 'pb-20 pt-14' : ''}>
      <div className={isPublicMode ? 'container mx-auto px-4 lg:px-8' : ''}>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.16)_0%,rgba(14,18,25,0.94)_52%,rgba(34,197,94,0.12)_100%)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] lg:p-8">
          <div className="pointer-events-none absolute -left-16 -top-16 h-52 w-52 rounded-full bg-amber-400/30 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 -bottom-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Premiacao oficial</p>
                <h1 className="mt-2 font-luxury text-3xl font-black text-white lg:text-4xl">Premiação e Ganhadores</h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-200">
                  Transparência auditável com apuração pela Loteria Federal, regra de redundância e registro público das tentativas.
                </p>
              </div>
              {isPublicMode ? (
                <Link
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/15 px-4 text-xs font-black uppercase tracking-[0.14em] text-amber-100 transition-colors hover:bg-amber-400/25"
                  to="/comprar-manualmente"
                >
                  Comprar números
                </Link>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <article className="rounded-2xl border border-white/10 bg-black/30 p-5 lg:col-span-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neon-pink">Quadro de premiação</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-neon-pink/25 bg-neon-pink/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-neon-pink">1º prêmio</p>
                    <p className="mt-1 text-sm font-semibold text-white">{campaign.mainPrize}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">2º prêmio</p>
                    <p className="mt-1 text-sm font-semibold text-white">{campaign.secondPrize}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200">Bônus</p>
                    <p className="mt-1 text-sm font-semibold text-white">{campaign.bonusPrize}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-black/30 p-5 lg:col-span-7">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">Último resultado publicado</p>

                {isLoadingLatest ? (
                  <div className="mt-4 h-48 animate-pulse rounded-xl bg-white/5" />
                ) : null}

                {!isLoadingLatest && !hasAnyResult ? (
                  <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-center">
                    <p className="text-sm text-gray-300">
                      Nenhuma apuração publicada ainda.
                    </p>
                    {mergedErrorMessage ? (
                      <p className="mt-2 text-xs text-red-300">{mergedErrorMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                {!isLoadingLatest && hasAnyResult && latestResultType === 'top' && topResult ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-amber-300/25 bg-gradient-to-r from-amber-400/15 via-white/5 to-emerald-400/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200">Ganhador</p>
                          <p className="mt-1 text-2xl font-black text-white">{topResult.winner.name}</p>
                          <p className="mt-1 text-xs text-gray-200">
                            Posição {topResult.winner.pos} com {topResult.winner.cotas} cotas.
                          </p>
                          <p className="mt-2 text-xs font-semibold text-amber-100">
                            Prêmio vigente: {topResult.drawPrize || campaign.mainPrize}
                          </p>
                          <p className="mt-1 text-xs text-gray-200">
                            Cálculo exato: <span className="font-semibold text-white">{buildWinnerCalculationLabel(topResult)}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-200">
                            Posição do jogador premiado: <span className="font-bold text-neon-pink">{formatWinnerUserCode(topResult)}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-200">
                            Número premiado:{' '}
                            <span className="font-bold text-neon-pink">{pickComparableWinnerTicket(topResult) || '-'}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Códigos da Loteria informados: <span className="font-mono text-white">{formatLoteriaInputs(topResult.extractionNumbers)}</span>
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-right">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Data</p>
                          <p className="mt-1 text-xs font-bold text-white">{formatDateLabel(topResult.drawDate)}</p>
                          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-gray-500">Posição premiada</p>
                          <p className="mt-1 text-sm font-black text-neon-pink">{formatWinningPosition(topResult.winningPosition, topResult.participantCount)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Rastro de apuração (regra de redundância)</p>
                      <div className="mt-3 space-y-2">
                        {topResult.attempts.map((attempt) => {
                          const isFallback = attempt.extractionIndex > 5 || attempt.extractionNumber.includes('-')

                          return (
                            <div
                              key={`${attempt.extractionIndex}-${attempt.candidateCode}`}
                              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                            >
                              <span className="text-gray-300">
                                {isFallback
                                  ? `Tentativa ${attempt.extractionIndex}: fallback de segurança ➜ código ${attempt.candidateCode}`
                                  : `Tentativa ${attempt.extractionIndex}: extração ${attempt.extractionNumber} ➜ código ${formatAttemptLabel(attempt.extractionNumber, attempt.comparisonDigits)}${formatNearestPath(attempt) ? ` | caminho ${formatNearestPath(attempt)}` : ''}`}
                              </span>
                              <span className="font-bold text-neon-pink">
                                {attempt.matchedPosition ? `Match na posição ${formatWinningPosition(attempt.matchedPosition, topResult.participantCount)}` : 'Sem match'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Participantes</p>
                        <p className="mt-1 text-sm font-bold text-white">{topResult.participantCount}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Dígitos usados</p>
                        <p className="mt-1 text-sm font-bold text-white">{topResult.comparisonDigits}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Resolução</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {topResult.resolvedBy === 'federal_extraction' ? 'Extração oficial' : 'Redundância'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {!isLoadingLatest && hasAnyResult && latestResultType === 'main' && mainResult ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-emerald-300/25 bg-gradient-to-r from-emerald-400/15 via-white/5 to-cyan-400/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200">Ganhador</p>
                          <p className="mt-1 text-2xl font-black text-white">{mainResult.winner.name}</p>
                          <p className="mt-1 text-xs text-gray-200">
                            Sorteio principal por número da rifa.
                          </p>
                          <p className="mt-2 text-xs font-semibold text-emerald-100">
                            Prêmio vigente: {mainResult.drawPrize || campaign.mainPrize}
                          </p>
                          <p className="mt-1 text-xs text-gray-200">
                            Cálculo exato: <span className="font-semibold text-white">{buildMainWinnerCalculationLabel(mainResult)}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-200">
                            Número premiado:{' '}
                            <span className="font-bold text-neon-pink">{mainResult.winningNumberFormatted}</span>
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            Códigos da Loteria informados: <span className="font-mono text-white">{formatLoteriaInputs(mainResult.extractionNumbers)}</span>
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-right">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Data</p>
                          <p className="mt-1 text-xs font-bold text-white">{formatDateLabel(mainResult.drawDate)}</p>
                          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-gray-500">Tipo</p>
                          <p className="mt-1 text-sm font-black text-emerald-200">Sorteio principal</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Rastro de apuração (número da rifa)</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                          <span className="text-gray-300">
                            Extração usada: {mainResult.selectedExtractionIndex} ({mainResult.selectedExtractionNumber}) ➜ alvo {mainResult.targetNumberFormatted}
                            {buildMainFallbackPath(mainResult) ? ` | caminho ${buildMainFallbackPath(mainResult)}` : ''}
                          </span>
                          <span className="font-bold text-neon-pink">
                            {mainResult.fallbackDirection === 'none' ? 'Match exato' : 'Fallback por aproximação'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Faixa da rifa</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {String(mainResult.raffleRangeStart).padStart(7, '0')} - {String(mainResult.raffleRangeEnd).padStart(7, '0')}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Total de números</p>
                        <p className="mt-1 text-sm font-bold text-white">{mainResult.raffleTotalNumbers}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Resolução</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {mainResult.fallbackDirection === 'none' ? 'Extração oficial' : 'Aproximação do mais próximo'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
