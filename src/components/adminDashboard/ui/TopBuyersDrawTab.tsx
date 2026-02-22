import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { useTopBuyersDraw } from '../../../hooks/useTopBuyersDraw'

function normalizeIntegerInput(value: string) {
  const digitsOnly = value.replace(/\D/g, '')
  return digitsOnly.slice(0, 12)
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
  const [lotteryNumberInput, setLotteryNumberInput] = useState('')
  const [rankingLimitInput, setRankingLimitInput] = useState('50')

  const rankingLimit = useMemo(() => {
    const parsed = Number(rankingLimitInput)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 50
    }
    return Math.max(1, Math.min(parsed, 50))
  }, [rankingLimitInput])

  const lotteryNumber = useMemo(() => {
    const parsed = Number(lotteryNumberInput)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  }, [lotteryNumberInput])

  const previewPosition = useMemo(() => {
    if (!lotteryNumber || rankingLimit <= 0) {
      return null
    }

    const modulo = lotteryNumber % rankingLimit
    return modulo === 0 ? rankingLimit : modulo
  }, [lotteryNumber, rankingLimit])

  const handlePublish = async () => {
    if (!lotteryNumber) {
      toast.warning('Informe um numero inteiro da Loteria Federal.', {
        toastId: 'top-buyers-draw-invalid-lottery',
      })
      return
    }

    try {
      const published = await publishResult({
        lotteryNumber,
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
            <h3 className="mt-2 font-luxury text-3xl font-bold text-white">Publicar ganhador TOP compradores</h3>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Informe o numero oficial da Loteria Federal e publique o ganhador calculado por algoritmo auditavel.
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
                <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-200">Participantes usados</p>
                <p className="mt-1 text-2xl font-black text-emerald-100">{result?.participantCount || '-'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Regra matematica</p>
            <div className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-4 font-mono text-sm text-cyan-100">
              <p>posicao = loteria % participantes</p>
              <p>se posicao == 0, posicao = participantes</p>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Previa da entrada atual</p>
              <p className="mt-2 text-xs text-gray-300">Numero loteria: {lotteryNumber || '-'}</p>
              <p className="mt-1 text-xs text-gray-300">Limite ranking: {rankingLimit}</p>
              <p className="mt-2 text-lg font-black text-amber-300">
                Posicao estimada: {previewPosition || '-'}
              </p>
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
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="draw-lottery-number">
                Numero da Loteria Federal
              </label>
              <input
                id="draw-lottery-number"
                className="mt-2 h-12 w-full rounded-lg border border-amber-300/25 bg-black/40 px-3 text-lg font-black tracking-[0.08em] text-amber-100 outline-none transition-colors focus:border-amber-300/60"
                inputMode="numeric"
                placeholder="Ex: 73492"
                type="text"
                value={lotteryNumberInput}
                onChange={(event) => setLotteryNumberInput(normalizeIntegerInput(event.target.value))}
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="draw-ranking-limit">
                Quantidade de participantes do ranking
              </label>
              <input
                id="draw-ranking-limit"
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-gold/60"
                inputMode="numeric"
                placeholder="50"
                type="text"
                value={rankingLimitInput}
                onChange={(event) => setRankingLimitInput(normalizeIntegerInput(event.target.value))}
              />
              <p className="mt-2 text-xs text-gray-400">Use 50 para o modelo oficial de Top Compradores semanal.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-400 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPublishing}
              type="button"
              onClick={handlePublish}
            >
              {isPublishing ? 'Publicando...' : 'Publicar Ganhador'}
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
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-300/20 blur-2xl" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Ganhador atual</p>
                <p className="mt-2 text-3xl font-black text-white">{result.winner.name}</p>
                <p className="mt-2 text-sm text-gray-200">
                  Posicao {result.winner.pos} no ranking com <span className="font-bold text-gold">{result.winner.cotas}</span> cotas.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Loteria</p>
                    <p className="mt-1 font-black text-white">{result.lotteryNumber}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Posicao</p>
                    <p className="mt-1 font-black text-white">{result.winningPosition}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Participantes</p>
                    <p className="mt-1 font-black text-white">{result.participantCount}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Top 3 do snapshot publicado</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
                    Draw #{result.drawId.slice(0, 8)}
                  </p>
                </div>
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
