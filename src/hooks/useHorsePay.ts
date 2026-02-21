import { useCallback, useMemo, useState } from 'react'
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions'
import { functions } from '../lib/firebase'

export type PixType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM'

export interface CreateDepositInput {
  amount: number
  payerName: string
  phone?: string | null
}

export interface CreateDepositResponse {
  externalId: string
  copyPaste: string | null
  qrCode: string | null
  status: 'pending' | 'failed'
}

export interface RequestWithdrawInput {
  amount: number
  pixKey: string
  pixType: PixType
}

export type RequestWithdrawResponse = Record<string, unknown>
export type BalanceResponse = Record<string, unknown>
type CallableEnvelope<T> = T | { result?: T }

function unwrapEnvelope<T>(data: CallableEnvelope<T>): T {
  if (data && typeof data === 'object' && 'result' in data) {
    const wrapped = data as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return data as T
}

async function unwrapCallable<T>(promise: Promise<HttpsCallableResult<unknown>>): Promise<T> {
  const result = await promise
  return unwrapEnvelope(result.data as CallableEnvelope<T>)
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error('Erro inesperado ao chamar Cloud Function')
}

export function useHorsePay() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const callables = useMemo(
    () => ({
      createPixDeposit: httpsCallable<CreateDepositInput, CreateDepositResponse>(
        functions,
        'createPixDeposit',
      ),
      requestWithdraw: httpsCallable<RequestWithdrawInput, RequestWithdrawResponse>(
        functions,
        'requestWithdraw',
      ),
      getBalance: httpsCallable<Record<string, never>, BalanceResponse>(functions, 'getBalance'),
    }),
    [],
  )

  const runCallable = useCallback(
    async <T>(operation: () => Promise<T>) => {
      setLoading(true)
      setError(null)

      try {
        return await operation()
      } catch (callableError) {
        const normalizedError = toError(callableError)
        setError(normalizedError)
        throw normalizedError
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const createDeposit = useCallback(
    async ({ amount, payerName, phone }: CreateDepositInput) =>
      runCallable(() => {
        const payload: CreateDepositInput = {
          amount,
          payerName,
        }

        if (typeof phone === 'string' && phone.trim()) {
          payload.phone = phone.trim()
        }

        return unwrapCallable<CreateDepositResponse>(callables.createPixDeposit(payload))
      }),
    [callables.createPixDeposit, runCallable],
  )

  const requestWithdraw = useCallback(
    async ({ amount, pixKey, pixType }: RequestWithdrawInput) =>
      runCallable(() =>
        unwrapCallable<RequestWithdrawResponse>(callables.requestWithdraw({ amount, pixKey, pixType })),
      ),
    [callables.requestWithdraw, runCallable],
  )

  const getBalance = useCallback(
    async () => runCallable(() => unwrapCallable<BalanceResponse>(callables.getBalance({}))),
    [callables.getBalance, runCallable],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    loading,
    error,
    createDeposit,
    requestWithdraw,
    getBalance,
    clearError,
  }
}
