import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { useCampaignSettings } from '../../../hooks/useCampaignSettings'
import { useMainRaffleDraw } from '../../../hooks/useMainRaffleDraw'
import { CustomSelect } from '../../ui/CustomSelect'
import { buildMainRafflePrizeOptions } from '../../../utils/campaignPrizes'

function normalizeExtractionInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
}

function parseErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) {
      return message.replace(/^Firebase:\s*/i, '')
    }
  }
  return 'Falha ao publicar sorteio principal. Verifique os dados e tente novamente.'
}

function formatPublishedAt(timestampMs: number) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return 'Ainda nao publicado'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(timestampMs))
}

function formatAttemptPhaseLabel(phase: 'exact' | 'nearest' | 'contingency') {
  if (phase === 'nearest') {
    return 'Proximidade'
  }
  if (phase === 'contingency') {
    return 'Contingência'
  }
  return 'Prefixo exato'
}

function formatAttemptSource(attempt: {
  sourceExtractionIndex: number | null
  extractionNumber: string
  phase: 'exact' | 'nearest' | 'contingency'
}) {
  if (attempt.phase === 'contingency' || !attempt.sourceExtractionIndex) {
    return 'Fallback final'
  }
  return `${attempt.sourceExtractionIndex}ª extração (${attempt.extractionNumber})`
}

export default function MainRaffleDrawTab() {
  const { campaign } = useCampaignSettings()
  const {
    result,
    history,
    isLoading,
    isHistoryLoading,
    isPublishing,
    errorMessage,
    publishResult,
  } = useMainRaffleDraw(false)

  const [extractionInputs, setExtractionInputs] = useState<string[]>(['', '', '', '', ''])
  const [drawPrizeInput, setDrawPrizeInput] = useState('')
  const availablePrizeOptions = useMemo(
    () => buildMainRafflePrizeOptions(campaign),
    [campaign],
  )
  const usedDrawPrizes = useMemo(
    () => new Set(history.map((item) => item.drawPrize).filter(Boolean)),
    [history],
  )
  const prizeSelectOptions = useMemo(
    () =>
      availablePrizeOptions.map((item) => ({
        value: item.value,
        label: usedDrawPrizes.has(item.value) ? `${item.label} (ja sorteado)` : item.label,
        disabled: usedDrawPrizes.has(item.value),
      })),
    [availablePrizeOptions, usedDrawPrizes],
  )
  const selectablePrizes = prizeSelectOptions.filter((item) => !item.disabled)

  const selectedPrize = useMemo(() => {
    if (drawPrizeInput && selectablePrizes.some((item) => item.value === drawPrizeInput)) {
      return drawPrizeInput
    }
    return selectablePrizes[0]?.value || ''
  }, [drawPrizeInput, selectablePrizes])
  const calculationAttempts = result?.attempts || []

  const handleExtractionChange = (index: number, value: string) => {
    setExtractionInputs((current) => current.map((item, itemIndex) => (
      itemIndex === index ? normalizeExtractionInput(value) : item
    )))
  }

  const handlePublish = async () => {
    const selectedExtractions = extractionInputs
      .map((item) => normalizeExtractionInput(item))
      .filter((item) => item.length > 0)

    if (!selectedPrize || selectedExtractions.length === 0) {
      toast.warning('Selecione o premio e informe ao menos 1 extracao da Federal.', {
        toastId: 'main-raffle-draw-invalid-input',
      })
      return
    }

    try {
      const published = await publishResult({
        drawPrize: selectedPrize,
        extractionNumbers: selectedExtractions,
      })

      toast.success(
        `Sorteio geral publicado: bilhete ${published.winningNumberFormatted} - ${published.winner.name}.`,
        { toastId: 'main-raffle-draw-published' },
      )
      setDrawPrizeInput('')
      setExtractionInputs(['', '', '', '', ''])
    } catch (error) {
      toast.error(parseErrorMessage(error), {
        toastId: 'main-raffle-draw-publish-error',
      })
    }
  }

  return (
    <section className="space-y-6">
      <article className="rounded-3xl border border-white/10 bg-luxury-card p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Sorteio principal</p>
        <h3 className="mt-2 font-display text-3xl font-bold text-white">Sorteio geral por ranking + sufixo</h3>
        <p className="mt-2 max-w-2xl text-sm text-gray-300">
          Regra V2 ativa: compara sufixos por ciclo 6→5→4→3 (últimas casas) nas extrações informadas e nas posições do ranking geral.
          Sem match em 3 dígitos, aplica proximidade numérica (abaixo/acima). Números já premiados seguem inelegíveis.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Ultima publicacao</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatPublishedAt(result?.publishedAtMs || 0)}</p>
          </div>
          <div className="rounded-xl border border-neon-pink/25 bg-neon-pink/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-neon-pink">Codigo vencedor</p>
            <p className="mt-1 text-lg font-black text-neon-pink">{result?.winningCode || '-'}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200">Bilhete vencedor</p>
            <p className="mt-1 text-lg font-black text-emerald-100">{result?.winningNumberFormatted || '-'}</p>
          </div>
        </div>
      </article>

      {result ? (
        <article className="rounded-3xl border border-cyan-300/20 bg-[linear-gradient(170deg,rgba(18,31,45,0.85),rgba(8,14,22,0.88))] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Prova do cálculo</p>
              <h4 className="mt-1 font-display text-2xl font-bold text-white">Timeline oficial de tentativas</h4>
              <p className="mt-1 text-xs text-gray-300">
                Ordem fixa: extrações informadas + ranking geral. Ciclo por últimas casas 6→5→4→3 e fallback por proximidade.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-right text-xs">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Vencedor final</p>
              <p className="mt-1 font-semibold text-white">
                Posição {result.winningPosition} • bilhete {result.winningTicketNumber || result.winningNumberFormatted}
              </p>
            </div>
          </div>

          {calculationAttempts.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {calculationAttempts.map((attempt) => {
                const isWinnerAttempt = attempt.matchedPosition === result.winningPosition
                const hasResolvedPath = attempt.rawCandidateCode && attempt.rawCandidateCode !== attempt.candidateCode
                const phaseLabel = formatAttemptPhaseLabel(attempt.phase)

                return (
                  <div
                    key={`${result.drawId}-attempt-${attempt.attemptIndex}`}
                    className={`rounded-xl border px-3 py-3 text-xs ${
                      isWinnerAttempt
                        ? 'border-emerald-300/40 bg-emerald-500/10'
                        : 'border-white/10 bg-black/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">Tentativa {attempt.attemptIndex}</p>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-cyan-100">
                        {phaseLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-300">{formatAttemptSource(attempt)}</p>
                    <p className="mt-1 text-gray-300">
                      Código base:{' '}
                      <span className="font-mono font-semibold text-white">{attempt.rawCandidateCode || '-'}</span>
                    </p>
                    <p className="mt-1 text-gray-300">
                      Código resolvido:{' '}
                      <span className="font-mono font-semibold text-neon-pink">{attempt.candidateCode || '-'}</span>
                      {hasResolvedPath ? (
                        <span className="text-gray-400"> ({attempt.nearestDirection})</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-gray-300">
                      Posição do ranking:{' '}
                      <span className="font-semibold text-white">
                        {attempt.matchedPosition ? `${attempt.matchedPosition}º` : 'sem match'}
                      </span>
                    </p>
                    <p className="mt-1 text-gray-300">
                      Bilhete encontrado:{' '}
                      <span className="font-mono font-semibold text-white">{attempt.matchedTicketNumber || '-'}</span>
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-5 text-sm text-gray-300">
              Ainda não há trilha de tentativas para este resultado.
            </div>
          )}
        </article>
      ) : null}

      <article className="rounded-3xl border border-white/10 bg-luxury-card p-6">
        <h4 className="font-display text-2xl font-bold text-white">Publicar sorteio principal</h4>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="main-draw-prize">
              Premio vigente
            </label>
            <div className="mt-2">
              <CustomSelect
                value={selectedPrize}
                options={prizeSelectOptions}
                onChange={setDrawPrizeInput}
                placeholder="Nenhum premio disponivel"
                disabled={isPublishing || selectablePrizes.length === 0}
                id="main-draw-prize"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing || selectablePrizes.length === 0}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-neon-pink px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPublishing ? 'Publicando...' : 'Publicar sorteio geral'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {extractionInputs.map((value, index) => (
            <div key={`main-extraction-${index + 1}`}>
              <label className="text-[10px] uppercase tracking-[0.14em] text-gray-500" htmlFor={`main-extraction-${index + 1}`}>
                {index + 1}a extracao
              </label>
              <input
                id={`main-extraction-${index + 1}`}
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(event) => handleExtractionChange(index, event.target.value)}
                placeholder="000000"
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-sm text-white focus:border-neon-pink/40 focus:outline-none focus:ring-1 focus:ring-neon-pink/20"
              />
            </div>
          ))}
        </div>

        {errorMessage ? <p className="mt-4 text-xs text-red-300">{errorMessage}</p> : null}
      </article>

      <article className="rounded-3xl border border-white/10 bg-luxury-card p-6">
        <h4 className="font-display text-2xl font-bold text-white">Historico do sorteio principal</h4>

        {isLoading || isHistoryLoading ? (
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : null}

        {!isLoading && !isHistoryLoading && history.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-white/5 p-5 text-sm text-gray-300">
            Nenhum sorteio principal publicado ate o momento.
          </div>
        ) : null}

        {history.length > 0 ? (
          <div className="mt-4 space-y-2">
            {history.slice(0, 12).map((item) => (
              <div key={item.drawId} className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-gray-200">
                <p className="font-semibold text-white">
                  {item.drawPrize} - bilhete {item.winningNumberFormatted} ({item.winner.name})
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Regra: {item.ruleVersion === 'v2_prefix_cycle' ? 'V2 sufixo 6→5→4→3' : 'Legado'} | dígitos finais do match: {item.comparisonDigits || '-'} | data: {item.drawDate}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </article>
    </section>
  )
}
