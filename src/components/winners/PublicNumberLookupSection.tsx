import { useMemo, useState, type FormEvent } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

type PublicLookupOutput = {
  campaignId: string
  number: number
  formattedNumber: string
  status: 'disponivel' | 'reservado' | 'vendido'
  awardedPrize: string | null
  owner: {
    name: string
    city: string | null
    display: string
  } | null
}

type CallableEnvelope<T> = T | { result?: T }

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function normalizeLookupInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 7)
}

function normalizeErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '')
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[a-z-]+\)\.?$/i, '')
      .trim()
    if (message) {
      return message
    }
  }

  return 'Nao foi possivel consultar o numero agora.'
}

export default function PublicNumberLookupSection() {
  const [numberInput, setNumberInput] = useState('')
  const [result, setResult] = useState<PublicLookupOutput | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const getPublicNumberLookup = useMemo(
    () => httpsCallable<{ number: string }, unknown>(functions, 'getPublicNumberLookup'),
    [],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeLookupInput(numberInput)

    if (!normalized) {
      setErrorMessage('Informe um numero para consultar.')
      setResult(null)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const callableResult = await getPublicNumberLookup({ number: normalized })
      const payload = unwrapCallableData(callableResult.data as CallableEnvelope<PublicLookupOutput>)
      setResult(payload)
    } catch (error) {
      setResult(null)
      setErrorMessage(normalizeErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="pt-10 pb-6">
      <div className="container mx-auto px-4 lg:px-8">
        <article className="rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(245,158,11,0.13),rgba(7,10,15,0.95)_55%,rgba(34,197,94,0.1))] p-5 pt-7 lg:p-6 lg:pt-8">
          <h2 className="font-luxury text-2xl font-black text-white lg:text-3xl">Busca publica de numero</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Consulte qualquer numero da rifa para verificar se esta disponivel, reservado ou vendido.
          </p>

          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <input
              value={numberInput}
              onChange={(event) => setNumberInput(normalizeLookupInput(event.target.value))}
              placeholder="Ex: 0183420"
              className="h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 font-mono text-sm text-white placeholder:text-gray-500 focus:border-neon-pink/40 focus:outline-none focus:ring-1 focus:ring-neon-pink/25 sm:max-w-xs"
              inputMode="numeric"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-neon-pink px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Consultando...' : 'Consultar numero'}
            </button>
          </form>

          {errorMessage ? (
            <p className="mt-3 text-xs text-red-300">{errorMessage}</p>
          ) : null}

          {result ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Resultado</p>
              <p className="mt-1 text-sm text-gray-200">
                Numero <span className="font-mono font-bold text-white">{result.formattedNumber}</span>
              </p>
              <p className="mt-1 text-sm">
                Status:{' '}
                <span
                  className={`font-black uppercase ${
                    result.status === 'disponivel'
                      ? 'text-emerald-300'
                      : result.status === 'reservado'
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }`}
                >
                  {result.status}
                </span>
              </p>
              {result.status === 'vendido' ? (
                <>
                  <p className="mt-1 text-sm text-gray-200">
                    Dono parcial: <span className="font-semibold text-white">{result.owner?.display || 'Participante'}</span>
                  </p>
                  {result.awardedPrize ? (
                    <p className="mt-1 text-sm text-amber-200">
                      Ganhou o premio <span className="font-semibold text-amber-100">{result.awardedPrize}</span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  )
}
