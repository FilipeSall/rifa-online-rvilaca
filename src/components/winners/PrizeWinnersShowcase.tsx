import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { Link } from 'react-router-dom'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { useMainRaffleDraw } from '../../hooks/useMainRaffleDraw'
import { useTopBuyersDraw } from '../../hooks/useTopBuyersDraw'
import { functions } from '../../lib/firebase'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../../utils/fetchCache'
import { pickComparableWinnerTicketNumber } from '../../utils/topBuyersWinner'

type PrizeWinnersShowcaseProps = {
  mode?: 'public' | 'dashboard'
}

type ExactCalculationComparison = {
  pos: number
  userId: string
  name: string
  ticketNumber: string | null
  ticketFinal: string | null
  isWinner: boolean
}

type ExactCalculationAttempt = {
  extractionIndex: number
  extractionNumber: string
  comparisonDigits?: number
  rawCode: string
  resolvedCode: string
  nearestDirection: 'none' | 'below' | 'above'
  matchedPosition: number | null
  comparisons: ExactCalculationComparison[]
}

type ExactCalculationCache = {
  drawId: string
  attempts: ExactCalculationAttempt[]
}

type CallableEnvelope<T> = T | { result?: T }

type RawExactCalculationComparison = {
  pos?: unknown
  userId?: unknown
  name?: unknown
  ticketNumber?: unknown
  ticketFinal?: unknown
  isWinner?: unknown
}

type RawExactCalculationAttempt = {
  extractionIndex?: unknown
  extractionNumber?: unknown
  comparisonDigits?: unknown
  rawCode?: unknown
  resolvedCode?: unknown
  nearestDirection?: unknown
  matchedPosition?: unknown
  comparisons?: unknown
}

type RawExactCalculationResult = {
  drawId?: unknown
  attempts?: unknown
}

type RawGetLatestTopBuyersDrawExactCalculationOutput = {
  hasResult?: unknown
  drawId?: unknown
  result?: RawExactCalculationResult | null
}

type GetLatestTopBuyersDrawExactCalculationInput = {
  drawId?: string
}

const EXACT_CALCULATION_CACHE_KEY_PREFIX = 'rifa-online:cache:top-buyers:exact-calculation:v3'
const EXACT_CALCULATION_LAST_FETCH_KEY_PREFIX = 'rifa-online:last-fetch:top-buyers:exact-calculation:v3'
const EXACT_CALCULATION_FETCH_DAYS = 7
const EXACT_CALC_DEBUG_ENABLED = import.meta.env.DEV || `${import.meta.env.VITE_DEBUG_EXACT_CALC ?? ''}`.trim().toLowerCase() === 'true'

function buildExactCalculationCacheKey(drawId: string) {
  return `${EXACT_CALCULATION_CACHE_KEY_PREFIX}:${drawId}`
}

function buildExactCalculationLastFetchKey(drawId: string) {
  return `${EXACT_CALCULATION_LAST_FETCH_KEY_PREFIX}:${drawId}`
}

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function sanitizeString(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value)
    }
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

function sanitizeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function normalizeExactCalculationComparisons(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index) => (item && typeof item === 'object' ? (item as RawExactCalculationComparison) : null))
    .filter((item): item is RawExactCalculationComparison => Boolean(item))
    .map((item, index) => ({
      pos: sanitizeInteger(item.pos, index + 1),
      userId: sanitizeString(item.userId),
      name: sanitizeString(item.name, 'Participante'),
      ticketNumber: sanitizeString(item.ticketNumber) || null,
      ticketFinal: sanitizeString(item.ticketFinal) || null,
      isWinner: Boolean(item.isWinner),
    }))
    .map((item) => ({
      ...item,
      userId: item.userId || `pos-${item.pos}`,
    }))
    .filter((item) => item.pos > 0)
}

function normalizeExactCalculationAttempts(value: unknown): ExactCalculationAttempt[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index) => (item && typeof item === 'object' ? (item as RawExactCalculationAttempt) : null))
    .filter((item): item is RawExactCalculationAttempt => Boolean(item))
    .map((item, index) => ({
      extractionIndex: sanitizeInteger(item.extractionIndex, index + 1),
      extractionNumber: sanitizeString(item.extractionNumber),
      comparisonDigits: Number.isInteger(Number(item.comparisonDigits)) ? Number(item.comparisonDigits) : undefined,
      rawCode: sanitizeString(item.rawCode) || sanitizeString((item as { rawCandidateCode?: unknown }).rawCandidateCode),
      resolvedCode: sanitizeString(item.resolvedCode) || sanitizeString((item as { candidateCode?: unknown }).candidateCode),
      nearestDirection: (item.nearestDirection === 'below'
        ? 'below'
        : item.nearestDirection === 'above'
          ? 'above'
          : 'none') as ExactCalculationAttempt['nearestDirection'],
      matchedPosition: Number.isInteger(Number(item.matchedPosition))
        ? Number(item.matchedPosition)
        : null,
      comparisons: normalizeExactCalculationComparisons(item.comparisons),
    }))
    .map((item) => ({
      ...item,
      extractionNumber: item.extractionNumber || '-',
    }))
    .filter((item) => item.extractionIndex > 0)
}

function normalizeExactCalculationResponse(
  payload: unknown,
  expectedDrawId: string,
): ExactCalculationCache | null {
  const data = (payload && typeof payload === 'object' && 'hasResult' in payload)
    ? payload as RawGetLatestTopBuyersDrawExactCalculationOutput
    : unwrapCallableData(payload as CallableEnvelope<RawGetLatestTopBuyersDrawExactCalculationOutput>)
  if (!data || typeof data !== 'object' || data.hasResult !== true) {
    return null
  }

  const result = data.result && typeof data.result === 'object'
    ? data.result
    : null
  if (!result) {
    return null
  }

  const drawId = sanitizeString(result.drawId) || sanitizeString(data.drawId)
  if (!drawId || drawId !== expectedDrawId) {
    return null
  }

  const attempts = normalizeExactCalculationAttempts(result.attempts)
  if (attempts.length === 0) {
    return null
  }

  return {
    drawId,
    attempts,
  }
}

function pickWinnerTicketFinalForAttempt(attempt: ExactCalculationAttempt) {
  const winnerComparison = attempt.comparisons.find((item) => item.isWinner)
  if (!winnerComparison) {
    return '---'
  }

  return winnerComparison.ticketFinal || '---'
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

function formatAttemptLabel(
  extractionNumber: string,
  comparisonDigits: number,
  comparisonSide: 'left_prefix' | 'right_suffix' = 'right_suffix',
) {
  const normalized = extractionNumber.padStart(6, '0')
  if (comparisonSide === 'left_prefix') {
    return normalized.slice(0, comparisonDigits).padEnd(comparisonDigits, '0')
  }
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
    const resolvedPositionCode = winnerAttempt.candidateCode.padStart(result.comparisonDigits, '0')
    const winningTicket = pickComparableWinnerTicket(result)
    const winningTicketFinal = winningTicket
      ? (result.comparisonSide === 'left_prefix'
        ? winningTicket.slice(0, result.comparisonDigits).padEnd(result.comparisonDigits, '0')
        : winningTicket.slice(-result.comparisonDigits).padStart(result.comparisonDigits, '0'))
      : '---'
    const hasPath = rawCode !== resolvedPositionCode

    if (hasPath) {
      return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> base ${rawCode} -> aproximação de posição: ${rawCode} -> ${resolvedPositionCode} -> match na posição ${formatWinningPosition(result.winningPosition, result.participantCount)} -> final do bilhete vencedor ${winningTicketFinal}.`
    }

    return `Extração ${winnerAttempt.extractionIndex} (${winnerAttempt.extractionNumber}) -> posição ${resolvedPositionCode} -> match na posição ${formatWinningPosition(result.winningPosition, result.participantCount)} -> final do bilhete vencedor ${winningTicketFinal}.`
  }

  return 'Fallback de segurança: nenhuma extração encontrou código elegível e o sistema aplicou posição final de contingência.'
}

function formatNearestPath(attempt: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>['attempts'][number]) {
  const raw = (attempt.rawCandidateCode || '').trim()
  if (!raw || raw === attempt.candidateCode) {
    return null
  }

  return `${raw} -> ${attempt.candidateCode}`
}

function formatWinnerUserCode(result: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>) {
  const digits = Math.max(2, String(result.participantCount || 0).length)
  return String(result.winningPosition || 0).padStart(digits, '0')
}

function pickComparableWinnerTicket(result: NonNullable<ReturnType<typeof useTopBuyersDraw>['result']>) {
  return pickComparableWinnerTicketNumber({
    winningTicketNumber: result.winningTicketNumber,
    winningCode: result.winningCode,
    comparisonSide: result.comparisonSide,
    winningPosition: result.winningPosition,
    comparisonDigits: result.comparisonDigits,
    attempts: result.attempts,
    winnerTicketNumbers: result.winnerTicketNumbers,
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

function buildMainWinnerCalculationLabel(result: NonNullable<ReturnType<typeof useMainRaffleDraw>['result']>) {
  if (result.ruleVersion === 'v2_prefix_cycle') {
    const winnerAttempt = result.attempts.find((attempt) => attempt.matchedPosition === result.winningPosition)
    const extractionNumber = winnerAttempt?.extractionNumber || result.selectedExtractionNumber
    const extractionIndex = winnerAttempt?.sourceExtractionIndex || result.selectedExtractionIndex
    const direction = winnerAttempt?.nearestDirection === 'below'
      ? 'abaixo'
      : winnerAttempt?.nearestDirection === 'above'
        ? 'acima'
        : 'match direto'
    return `Ciclo V2 ${result.comparisonDigits} dígitos -> extração ${extractionIndex} (${extractionNumber}) -> código ${result.winningCode} -> bilhete ${result.winningNumberFormatted} (${direction}).`
  }

  const total = Math.max(1, Number(result.raffleTotalNumbers) || 1)
  const direction = formatMainFallbackDirectionLabel(result.fallbackDirection)
  return `Extração ${result.selectedExtractionIndex} (${result.selectedExtractionNumber}) MOD ${total} = ${result.moduloTargetOffset} -> alvo ${result.targetNumberFormatted} -> vencedor ${result.winningNumberFormatted} (${direction}).`
}

function buildMainFallbackPath(result: NonNullable<ReturnType<typeof useMainRaffleDraw>['result']>) {
  if (result.ruleVersion === 'v2_prefix_cycle') {
    const winnerAttempt = result.attempts.find((attempt) => attempt.matchedPosition === result.winningPosition)
    if (!winnerAttempt || winnerAttempt.nearestDirection === 'none') {
      return null
    }

    const direction = formatMainFallbackDirectionLabel(winnerAttempt.nearestDirection)
    return `${winnerAttempt.rawCandidateCode || '---'} -> ${winnerAttempt.candidateCode || '---'} (${direction})`
  }

  if (result.fallbackDirection === 'none') {
    return null
  }

  const direction = formatMainFallbackDirectionLabel(result.fallbackDirection)
  return `${result.targetNumberFormatted} -> ${result.winningNumberFormatted} (${direction})`
}

export default function PrizeWinnersShowcase({ mode = 'public' }: PrizeWinnersShowcaseProps) {
  const { campaign } = useCampaignSettings()
  const {
    result: topResult,
    history: topHistory,
    isLoading: isTopLoading,
    errorMessage: topErrorMessage,
  } = useTopBuyersDraw(false, 'public')
  const {
    result: mainResult,
    history: mainHistory,
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
  const allWinners = useMemo(() => {
    const topAll = new Map(
      [...(topResult ? [topResult] : []), ...topHistory].map((item) => [item.drawId, item]),
    )
    const mainAll = new Map(
      [...(mainResult ? [mainResult] : []), ...mainHistory].map((item) => [item.drawId, item]),
    )

    const topEntries = Array.from(topAll.values()).map((item) => {
      const winnerAttempt = item.attempts.find((a) => a.matchedPosition === item.winningPosition)
      return {
        drawId: item.drawId,
        drawDate: item.drawDate,
        publishedAtMs: item.publishedAtMs,
        name: item.winner.name,
        prize: item.drawPrize,
        extractionNumber: winnerAttempt?.extractionNumber || item.extractionNumbers[0] || '-',
        ticketNumber: pickComparableWinnerTicketNumber({
          winningTicketNumber: item.winningTicketNumber,
          winningCode: item.winningCode,
          comparisonSide: item.comparisonSide,
          winningPosition: item.winningPosition,
          comparisonDigits: item.comparisonDigits,
          attempts: item.attempts,
          winnerTicketNumbers: item.winnerTicketNumbers,
        }) || '-',
        type: 'top' as const,
      }
    })

    const mainEntries = Array.from(mainAll.values()).map((item) => ({
      drawId: item.drawId,
      drawDate: item.drawDate,
      publishedAtMs: item.publishedAtMs,
      name: item.winner.name,
      prize: item.drawPrize,
      extractionNumber: item.selectedExtractionNumber,
      ticketNumber: item.winningNumberFormatted,
      type: 'main' as const,
    }))

    return [...topEntries, ...mainEntries].sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
  }, [mainHistory, mainResult, topHistory, topResult])
  const getLatestTopBuyersDrawExactCalculation = useMemo(
    () => httpsCallable<GetLatestTopBuyersDrawExactCalculationInput, unknown>(functions, 'getLatestTopBuyersDrawExactCalculation'),
    [],
  )
  const [isExactCalculationOpen, setIsExactCalculationOpen] = useState(false)
  const [exactCalculationAttempts, setExactCalculationAttempts] = useState<ExactCalculationAttempt[]>([])
  const [exactCalculationError, setExactCalculationError] = useState('')

  useEffect(() => {
    if (!topResult || latestResultType !== 'top') {
      setExactCalculationAttempts([])
      setIsExactCalculationOpen(false)
      setExactCalculationError('')
      return
    }

    const exactCalcCacheKey = buildExactCalculationCacheKey(topResult.drawId)
    const exactCalcLastFetchKey = buildExactCalculationLastFetchKey(topResult.drawId)
    const isCacheExpired = shouldFetchAfterDays(exactCalcLastFetchKey, EXACT_CALCULATION_FETCH_DAYS)
    const cached = readCachedJson<ExactCalculationCache>(exactCalcCacheKey)
    if (!isCacheExpired && cached?.drawId === topResult.drawId && Array.isArray(cached.attempts)) {
      if (EXACT_CALC_DEBUG_ENABLED) {
        console.info('[exact-calc] cache-hit', {
          drawId: topResult.drawId,
          attemptsCount: cached.attempts.length,
        })
      }
      setExactCalculationAttempts(cached.attempts)
      setExactCalculationError('')
      return
    }

    let isCancelled = false

    ;(async () => {
      try {
        const response = await getLatestTopBuyersDrawExactCalculation({ drawId: topResult.drawId })
        if (isCancelled) {
          return
        }

        const normalized = normalizeExactCalculationResponse(response.data, topResult.drawId)
        if (!normalized) {
          if (EXACT_CALC_DEBUG_ENABLED) {
            console.warn('[exact-calc] normalize-failed', {
              expectedDrawId: topResult.drawId,
              rawResponse: response.data,
              topResultSummary: {
                drawId: topResult.drawId,
                attemptsCount: topResult.attempts.length,
                rankingSnapshotCount: topResult.rankingSnapshot.length,
                comparisonDigits: topResult.comparisonDigits,
              },
            })
          }
          setExactCalculationAttempts([])
          setExactCalculationError('Não foi possível montar o cálculo exato com os finais dos bilhetes.')
          return
        }
        setExactCalculationAttempts(normalized.attempts)
        setExactCalculationError('')
        writeCachedJson(exactCalcCacheKey, normalized)
        markFetchedNow(exactCalcLastFetchKey)
      } catch (error) {
        if (isCancelled) {
          return
        }
        if (EXACT_CALC_DEBUG_ENABLED) {
          console.error('[exact-calc] fetch-error', {
            drawId: topResult.drawId,
            error,
          })
        }
        setExactCalculationAttempts([])
        setExactCalculationError('Não foi possível carregar o cálculo exato agora.')
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [getLatestTopBuyersDrawExactCalculation, latestResultType, topResult])

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
                <h1 className="mt-2 font-display text-3xl font-black text-white lg:text-4xl">Premiação e Ganhadores</h1>
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Todos os ganhadores</p>
                  <span className="text-[10px] text-gray-500">{allWinners.length} resultado{allWinners.length !== 1 ? 's' : ''}</span>
                </div>

                {(isTopLoading || isMainLoading) && allWinners.length === 0 ? (
                  <div className="mt-4 space-y-2">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="h-14 animate-pulse rounded-lg bg-white/5" />
                    ))}
                  </div>
                ) : null}

                {!isTopLoading && !isMainLoading && allWinners.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-5 text-center text-sm text-gray-300">
                    Nenhum ganhador publicado ainda.
                  </div>
                ) : null}

                {allWinners.length > 0 ? (
                  <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {allWinners.map((winner) => (
                      <div key={winner.drawId} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-black text-white">{winner.name}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${
                                winner.type === 'top'
                                  ? 'border-amber-300/35 bg-amber-400/15 text-amber-100'
                                  : 'border-cyan-300/35 bg-cyan-400/15 text-cyan-100'
                              }`}
                            >
                              {winner.type === 'top' ? 'Top buyers' : 'Sorteio geral'}
                            </span>
                            <span className="text-[10px] text-gray-500">{formatDateLabel(winner.drawDate)}</span>
                          </div>
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-amber-100">{winner.prize}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span className="text-gray-400">
                            Extração: <span className="font-mono text-white">{winner.extractionNumber}</span>
                          </span>
                          <span className="text-gray-400">
                            Número: <span className="font-bold text-neon-pink">{winner.ticketNumber}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                          <p className="mt-1 text-xs text-gray-300">
                            Extração premiada:{' '}
                            <span className="font-semibold text-white">
                              {(() => {
                                const winnerAttempt = topResult.attempts.find((attempt) => attempt.matchedPosition === topResult.winningPosition)
                                const sourceIndex = winnerAttempt?.sourceExtractionIndex || 1
                                return `${sourceIndex}ª extração (${winnerAttempt?.extractionNumber || topResult.extractionNumbers[0] || '-'})`
                              })()}
                            </span>
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
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Rastro de apuração (ciclo 6→5→4→3)</p>
                      <div className="mt-3 space-y-2">
                        {topResult.attempts.map((attempt) => {
                          const isFinalFallback = attempt.extractionNumber.includes('-')
                          const isNearestAttempt = !isFinalFallback && attempt.nearestDirection !== 'none'

                          return (
                            <div
                              key={`${attempt.extractionIndex}-${attempt.candidateCode}`}
                              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                            >
                              <span className="text-gray-300">
                                {isFinalFallback
                                  ? `Tentativa ${attempt.extractionIndex}: fallback de segurança ➜ posição ${attempt.candidateCode}`
                                  : isNearestAttempt
                                    ? `Tentativa ${attempt.extractionIndex}: extração ${attempt.extractionNumber} (aprox.) ➜ base ${formatAttemptLabel(attempt.extractionNumber, attempt.comparisonDigits, topResult.comparisonSide)}${formatNearestPath(attempt) ? ` | posição ${formatNearestPath(attempt)}` : ''}`
                                    : `Tentativa ${attempt.extractionIndex}: extração ${attempt.extractionNumber} ➜ base ${formatAttemptLabel(attempt.extractionNumber, attempt.comparisonDigits, topResult.comparisonSide)}`}
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

                    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <button
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-500/20"
                        type="button"
                        onClick={() => setIsExactCalculationOpen((current) => !current)}
                      >
                        {isExactCalculationOpen ? 'Ocultar cálculo exato' : 'Ver cálculo exato'}
                      </button>

                      {isExactCalculationOpen ? (
                        <div className="mt-4 space-y-3">
                          {exactCalculationError ? (
                            <div className="rounded-md border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                              {exactCalculationError}
                            </div>
                          ) : null}

                          {exactCalculationAttempts.map((attempt) => {
                            return (
                              <div
                                key={`${attempt.extractionIndex}-${attempt.extractionNumber}-${attempt.resolvedCode}`}
                                className="rounded-lg border border-white/10 bg-white/5 p-3"
                              >
                                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
                                  Tentativa {attempt.extractionIndex} • extração {attempt.extractionNumber}
                                </p>
                                <p className="mt-1 text-xs text-gray-200">
                                  Final do bilhete premiado:{' '}
                                  <span className="font-semibold text-white">{pickWinnerTicketFinalForAttempt(attempt)}</span>
                                </p>
                                <div className="mt-3 space-y-1">
                                  {attempt.comparisons.map((item) => (
                                    <div
                                      key={`${attempt.extractionIndex}-${item.userId}-${item.pos}`}
                                      className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs ${
                                        item.isWinner
                                          ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100'
                                          : 'border-white/10 bg-black/25 text-gray-300'
                                      }`}
                                    >
                                      <span>
                                        Pos {String(item.pos).padStart(2, '0')} • {item.name}
                                      </span>
                                      <span className="font-mono">
                                        final {item.ticketFinal || '---'}
                                        {item.ticketNumber ? ` • bilhete ${item.ticketNumber}` : ''}
                                        {item.isWinner ? ' • GANHADOR' : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}

                          {!exactCalculationError && exactCalculationAttempts.length === 0 ? (
                            <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-gray-300">
                              Nenhum cálculo exato disponível para este sorteio.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
                            Sorteio geral com ranking acumulado e comparação por sufixo (últimas casas).
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
                          <p className="mt-1 text-sm font-black text-emerald-200">
                            {mainResult.ruleVersion === 'v2_prefix_cycle' ? 'Sorteio geral V2' : 'Sorteio principal'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Rastro de apuração (ordem extrações + ranking)</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                          <span className="text-gray-300">
                            Extração usada: {mainResult.selectedExtractionIndex} ({mainResult.selectedExtractionNumber}) ➜ código {mainResult.winningCode}
                            {buildMainFallbackPath(mainResult) ? ` | caminho ${buildMainFallbackPath(mainResult)}` : ''}
                          </span>
                          <span className="font-bold text-neon-pink">
                            {buildMainFallbackPath(mainResult) ? 'Fallback por aproximação' : 'Match exato'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Participantes elegíveis</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {mainResult.participantCount}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Dígitos do match</p>
                        <p className="mt-1 text-sm font-bold text-white">{mainResult.comparisonDigits || '-'}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Resolução</p>
                        <p className="mt-1 text-sm font-bold text-white">
                          {mainResult.resolvedBy === 'federal_extraction' ? 'Extração oficial' : 'Redundância'}
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
