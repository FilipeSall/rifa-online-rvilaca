import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { useTopBuyersDraw } from '../../../hooks/useTopBuyersDraw'

function normalizeDrawDateInput(value: string) {
  return value.replace(/[^\d-]/g, '').slice(0, 10)
}

function normalizeExtractionInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
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

function getTodayDateInput() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) {
      return message.replace(/^Firebase:\s*/i, '')
    }
  }

  return 'Falha ao publicar resultado. Verifique os dados e tente novamente.'
}

export default function TopBuyersDrawTab() {
  const { result, isLoading, isPublishing, errorMessage, publishResult, refreshResult } = useTopBuyersDraw(false)
  const [drawDateInput, setDrawDateInput] = useState(getTodayDateInput())
  const [rankingLimitInput, setRankingLimitInput] = useState('50')
  const [extractionInputs, setExtractionInputs] = useState<string[]>(['', '', '', '', ''])

  const rankingLimit = useMemo(() => {
    const parsed = Number(rankingLimitInput)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 50
    }
    return Math.max(1, Math.min(parsed, 50))
  }, [rankingLimitInput])

  const canPublish = useMemo(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(drawDateInput)
      && extractionInputs.every((item) => item.length > 0),
    [drawDateInput, extractionInputs],
  )

  const previewCodes = useMemo(() => {
    const comparisonDigits = result?.comparisonDigits || 2
    return extractionInputs.map((item) => item.padStart(6, '0').slice(-comparisonDigits))
  }, [extractionInputs, result?.comparisonDigits])

  const handleExtractionChange = (index: number, value: string) => {
    setExtractionInputs((current) => current.map((item, itemIndex) => (
      itemIndex === index ? normalizeExtractionInput(value) : item
    )))
  }

  const handlePublish = async () => {
    if (!canPublish) {
      toast.warning('Preencha data e as 5 extracoes da Loteria Federal.', {
        toastId: 'top-buyers-draw-invalid-input',
      })
      return
    }

    try {
      const published = await publishResult({
        drawDate: drawDateInput,
        extractionNumbers: extractionInputs.map((item) => item.padStart(6, '0')),
        rankingLimit,
      })

      toast.success(
        `Resultado publicado: posicao ${published.winningPosition} - ${published.winner.name}.`,
        {
          toastId: 'top-buyers-draw-published',
        },
      )
    } catch (error) {
      toast.error(parseErrorMessage(error), {
        toastId: 'top-buyers-draw-publish-error',
      })
    }
  }

  const topThree = result?.rankingSnapshot.slice(0, 3) || []

  return (
    <section className="space-y-6">
      <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-6">
        <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Operacao de sorteio</p>
            <h3 className="mt-2 font-luxury text-3xl font-bold text-white">Sorteio Federal com redundancia</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Regras ativas: 5 extracoes oficiais, comparacao por digitos dinamicos e fallback de redundancia para garantir ganhador.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500">Ultima publicacao</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatPublishedAt(result?.publishedAtMs || 0)}</p>
              </div>
              <div className="rounded-xl border border-gold/25 bg-black/35 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-gold">Posicao vencedora</p>
                <p className="mt-1 text-2xl font-black text-gold">{result?.winningPosition || '-'}</p>
              </div>
              <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-200">Resolucao</p>
                <p className="mt-1 text-sm font-black text-emerald-100">
                  {result?.resolvedBy === 'federal_extraction' ? 'Extracao oficial' : result ? 'Redundancia' : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Regras aplicadas</p>
            <div className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-4 text-xs text-cyan-100">
              <p>1) Sorteio apenas quarta/sabado</p>
              <p>2) 5 extracoes da Federal</p>
              <p>3) Digitos por quantidade de participantes</p>
              <p>4) Sem match: regra de redundancia</p>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Previa de codigos</p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {previewCodes.map((code, index) => (
                  <div key={`preview-code-${index + 1}`} className="rounded bg-white/5 px-2 py-1 text-center text-xs font-mono text-gray-200">
                    {code || '--'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Entrada administrativa</p>
          <h4 className="mt-2 font-luxury text-2xl font-bold text-white">Publicacao oficial do sorteio</h4>

          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="draw-date">
                Data do sorteio (quarta ou sabado)
              </label>
              <input
                id="draw-date"
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                placeholder="YYYY-MM-DD"
                type="text"
                value={drawDateInput}
                onChange={(event) => setDrawDateInput(normalizeDrawDateInput(event.target.value))}
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="draw-ranking-limit">
                Participantes do ranking (max 50)
              </label>
              <input
                id="draw-ranking-limit"
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                inputMode="numeric"
                placeholder="50"
                type="text"
                value={rankingLimitInput}
                onChange={(event) => setRankingLimitInput(event.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div className="rounded-xl border border-amber-300/20 bg-amber-500/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-amber-200">5 extracoes da Loteria Federal</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-5">
                {extractionInputs.map((value, index) => (
                  <input
                    key={`extraction-input-${index + 1}`}
                    className="h-10 rounded-lg border border-amber-300/25 bg-black/40 px-2 text-center text-sm font-mono font-bold text-amber-100 outline-none transition-colors focus:border-amber-300/60"
                    inputMode="numeric"
                    placeholder={`${index + 1}ª`}
                    type="text"
                    value={value}
                    onChange={(event) => handleExtractionChange(index, event.target.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-400 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPublishing}
              type="button"
              onClick={handlePublish}
            >
              {isPublishing ? 'Publicando...' : 'Publicar Resultado'}
            </button>
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 bg-black/30 px-5 text-xs font-bold uppercase tracking-[0.14em] text-gray-200 transition-colors hover:border-white/30 hover:text-white"
              disabled={isLoading}
              type="button"
              onClick={() => void refreshResult()}
            >
              Atualizar
            </button>
          </div>

          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {errorMessage}
            </p>
          ) : null}
        </article>

        <article className="rounded-3xl border border-white/10 bg-luxury-card p-5 xl:col-span-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Resultado publicado</p>
          {!result ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/20 bg-black/20 p-8 text-center">
              <p className="text-sm text-gray-300">Nenhum ganhador publicado ainda.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-r from-amber-500/20 via-luxury-card to-luxury-card p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Ganhador atual</p>
                <p className="mt-2 text-3xl font-black text-white">{result.winner.name}</p>
                <p className="mt-2 text-sm text-gray-200">
                  Posicao {result.winner.pos} no ranking com <span className="font-bold text-gold">{result.winner.cotas}</span> cotas.
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-100">
                  Premio do sorteio vigente: {result.drawPrize || '-'}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Data</p>
                    <p className="mt-1 font-black text-white">{result.drawDate}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Posicao</p>
                    <p className="mt-1 font-black text-white">{result.winningPosition}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Codigo</p>
                    <p className="mt-1 font-black text-white">{result.winningCode}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Tentativas de apuracao</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
                    Draw #{result.drawId.slice(0, 8)}
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  {result.attempts.map((attempt) => (
                    <div key={`${attempt.extractionIndex}-${attempt.candidateCode}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs">
                      <span className="text-gray-300">
                        Tentativa {attempt.extractionIndex}: {attempt.extractionNumber} ➜ codigo {attempt.candidateCode}
                      </span>
                      <span className="font-bold text-gold">
                        {attempt.matchedPosition ? `Pos ${attempt.matchedPosition}` : 'Sem match'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Top 3 do snapshot publicado</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {topThree.map((item) => (
                    <div
                      key={item.userId}
                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-3"
                    >
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">{item.pos}º lugar</p>
                      <p className="mt-1 text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-gray-300">{item.cotas} cotas</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
