import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { useCampaignSettings } from '../../../hooks/useCampaignSettings'
import { useMainRaffleDraw } from '../../../hooks/useMainRaffleDraw'
import { CustomSelect } from '../../ui/CustomSelect'

function normalizeExtractionInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 7)
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

function buildPrizeOptions(mainPrize: string, secondPrize: string, bonusPrize: string) {
  const directPrizes = [mainPrize.trim(), secondPrize.trim()].filter(Boolean)
  const normalizedBonus = bonusPrize.trim()
  const pixOptions: string[] = []
  const pixMatch = normalizedBonus.match(/^\s*(\d+)\s*pix\b/i)

  if (normalizedBonus && pixMatch) {
    const totalPix = Number(pixMatch[1])
    if (Number.isInteger(totalPix) && totalPix > 1 && totalPix <= 100) {
      for (let index = 1; index <= totalPix; index += 1) {
        pixOptions.push(`${normalizedBonus} (Cota PIX ${index})`)
      }
    } else {
      pixOptions.push(normalizedBonus)
    }
  } else if (normalizedBonus) {
    pixOptions.push(normalizedBonus)
  }

  return Array.from(new Set([...directPrizes, ...pixOptions]))
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
  const [extractionIndexInput, setExtractionIndexInput] = useState('1')
  const [drawPrizeInput, setDrawPrizeInput] = useState('')
  const availablePrizeOptions = useMemo(
    () => buildPrizeOptions(campaign.mainPrize, campaign.secondPrize, campaign.bonusPrize),
    [campaign.bonusPrize, campaign.mainPrize, campaign.secondPrize],
  )
  const usedDrawPrizes = useMemo(
    () => new Set(history.map((item) => item.drawPrize).filter(Boolean)),
    [history],
  )
  const prizeSelectOptions = useMemo(
    () =>
      availablePrizeOptions.map((item) => ({
        value: item,
        label: usedDrawPrizes.has(item) ? `${item} (ja sorteado)` : item,
        disabled: usedDrawPrizes.has(item),
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

  const extractionIndex = useMemo(() => {
    const parsed = Number(extractionIndexInput)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      return 1
    }
    return parsed
  }, [extractionIndexInput])

  const handleExtractionChange = (index: number, value: string) => {
    setExtractionInputs((current) => current.map((item, itemIndex) => (
      itemIndex === index ? normalizeExtractionInput(value) : item
    )))
  }

  const handlePublish = async () => {
    const selectedExtractionValue = extractionInputs[extractionIndex - 1] || ''

    if (!selectedPrize || !selectedExtractionValue) {
      toast.warning('Selecione o premio e preencha a extracao usada.', {
        toastId: 'main-raffle-draw-invalid-input',
      })
      return
    }

    try {
      const published = await publishResult({
        drawPrize: selectedPrize,
        extractionIndex,
        extractionNumbers: extractionInputs,
      })

      toast.success(
        `Sorteio principal publicado: numero ${published.winningNumberFormatted} - ${published.winner.name}.`,
        { toastId: 'main-raffle-draw-published' },
      )
      setDrawPrizeInput('')
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
        <h3 className="mt-2 font-luxury text-3xl font-bold text-white">BMW / CG / PIX por numero da rifa</h3>
        <p className="mt-2 max-w-2xl text-sm text-gray-300">
          Apuracao com 5 extracoes da Loteria Federal, modulo da faixa da rifa e fallback para numero pago mais proximo
          (abaixo/acima).
          Numero ja premiado nao participa novamente.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Ultima publicacao</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatPublishedAt(result?.publishedAtMs || 0)}</p>
          </div>
          <div className="rounded-xl border border-gold/25 bg-gold/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gold">Numero alvo</p>
            <p className="mt-1 text-lg font-black text-gold">{result?.targetNumberFormatted || '-'}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200">Numero vencedor</p>
            <p className="mt-1 text-lg font-black text-emerald-100">{result?.winningNumberFormatted || '-'}</p>
          </div>
        </div>
      </article>

      <article className="rounded-3xl border border-white/10 bg-luxury-card p-6">
        <h4 className="font-luxury text-2xl font-bold text-white">Publicar sorteio principal</h4>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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

          <div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="main-draw-extraction-index">
                Extracao usada (1-5)
              </label>
              <span className="group relative inline-flex">
                <span
                  className="material-symbols-outlined cursor-help text-sm text-gray-400 transition-colors group-hover:text-gold"
                  aria-hidden="true"
                >
                  info
                </span>
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-white/15 bg-black/95 px-3 py-2 text-[11px] leading-relaxed text-gray-200 shadow-xl group-hover:block">
                  Escolha qual das 5 extracoes da Loteria Federal sera usada no calculo base. Apenas a extracao escolhida e obrigatoria; as demais podem ficar em branco.
                </span>
              </span>
            </div>
            <input
              id="main-draw-extraction-index"
              type="number"
              min={1}
              max={5}
              value={extractionIndexInput}
              onChange={(event) => setExtractionIndexInput(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white focus:border-gold/40 focus:outline-none focus:ring-1 focus:ring-gold/20"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing || selectablePrizes.length === 0}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPublishing ? 'Publicando...' : 'Publicar sorteio principal'}
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
                placeholder="0000000"
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-sm text-white focus:border-gold/40 focus:outline-none focus:ring-1 focus:ring-gold/20"
              />
            </div>
          ))}
        </div>

        {errorMessage ? <p className="mt-4 text-xs text-red-300">{errorMessage}</p> : null}
      </article>

      <article className="rounded-3xl border border-white/10 bg-luxury-card p-6">
        <h4 className="font-luxury text-2xl font-bold text-white">Historico do sorteio principal</h4>

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
                  {item.drawPrize} - numero vencedor {item.winningNumberFormatted} ({item.winner.name})
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Alvo {item.targetNumberFormatted} | fallback: {item.fallbackDirection} | data: {item.drawDate}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </article>
    </section>
  )
}
