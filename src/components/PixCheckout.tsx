import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useHorsePay, type CreateDepositResponse } from '../hooks/useHorsePay'

interface PixCheckoutProps {
  amount: number
  payerName: string
  phone?: string | null
}

type CheckoutStatus = 'idle' | 'generating' | 'pending' | 'paid' | 'failed'

function normalizeErrorMessage(error: unknown) {
  if (!error) {
    return 'Nao foi possivel processar o pagamento.'
  }

  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Nao foi possivel processar o pagamento.'
}

function normalizeListenerError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Falha ao acompanhar o status do pedido em tempo real.'
  }

  const candidate = error as { code?: string; message?: string }
  if (candidate.code === 'permission-denied') {
    return 'Sem permissao para ler pedidos. Publique as regras do Firestore e tente novamente.'
  }

  return candidate.message || 'Falha ao acompanhar o status do pedido em tempo real.'
}

function extractOrderStatus(payload: DocumentData): string {
  if (typeof payload?.status === 'string') {
    return payload.status
  }

  return ''
}

function readOrderPixField(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

export default function PixCheckout({ amount, payerName, phone }: PixCheckoutProps) {
  const { createDeposit, loading, error, clearError } = useHorsePay()
  const [status, setStatus] = useState<CheckoutStatus>('idle')
  const [order, setOrder] = useState<CreateDepositResponse | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const orderListenerRef = useRef<(() => void) | null>(null)
  const copyPasteCode = order?.copyPaste || ''

  const errorMessage = useMemo(
    () => localError || normalizeErrorMessage(error),
    [error, localError],
  )

  const stopOrderListener = useCallback(() => {
    if (!orderListenerRef.current) {
      return
    }

    orderListenerRef.current()
    orderListenerRef.current = null
  }, [])

  useEffect(() => () => stopOrderListener(), [stopOrderListener])

  useEffect(() => {
    if (!order?.externalId) {
      return
    }

    if (status === 'paid' || status === 'failed') {
      stopOrderListener()
      return
    }

    const orderRef = doc(db, 'orders', order.externalId)
    const unsubscribe = onSnapshot(
      orderRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return
        }

        const payload = snapshot.data()
        const orderStatus = extractOrderStatus(payload)
        const snapshotCopyPaste = readOrderPixField(payload.pixCopyPaste)
        const snapshotQrCode = readOrderPixField(payload.pixQrCode)

        setOrder((currentOrder) => {
          if (!currentOrder) {
            return currentOrder
          }

          const nextCopyPaste = snapshotCopyPaste || currentOrder.copyPaste
          const nextQrCode = snapshotQrCode || currentOrder.qrCode

          if (nextCopyPaste === currentOrder.copyPaste && nextQrCode === currentOrder.qrCode) {
            return currentOrder
          }

          return {
            ...currentOrder,
            copyPaste: nextCopyPaste,
            qrCode: nextQrCode,
          }
        })

        if (orderStatus === 'paid') {
          setStatus('paid')
          stopOrderListener()
          return
        }

        if (orderStatus === 'failed') {
          setStatus('failed')
          stopOrderListener()
        }
      },
      (snapshotError) => {
        setLocalError(normalizeListenerError(snapshotError))
        setStatus('failed')
        stopOrderListener()
      },
    )

    orderListenerRef.current = unsubscribe

    return () => unsubscribe()
  }, [order?.externalId, status, stopOrderListener])

  useEffect(() => {
    if (status !== 'pending') {
      return
    }

    if (order?.copyPaste || order?.qrCode) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setLocalError('O gateway nao retornou QR Code/Copia e Cola em tempo habil. Gere um novo PIX.')
      setStatus('failed')
      stopOrderListener()
    }, 30000)

    return () => window.clearTimeout(timeoutId)
  }, [order?.copyPaste, order?.qrCode, status, stopOrderListener])

  const handleCreatePix = useCallback(async () => {
    clearError()
    setLocalError(null)
    setCopyMessage('')
    stopOrderListener()
    setStatus('generating')

    if (!payerName.trim()) {
      setLocalError('Informe o nome do pagador para gerar o PIX.')
      setStatus('failed')
      return
    }

    if (amount <= 0) {
      setLocalError('Informe um valor valido para gerar o PIX.')
      setStatus('failed')
      return
    }

    try {
      const response = await createDeposit({
        amount,
        payerName: payerName.trim(),
        phone: typeof phone === 'string' && phone.trim() ? phone.trim() : undefined,
      })
      setOrder(response)

      if (response.status === 'failed') {
        setStatus('failed')
        return
      }

      setStatus('pending')
    } catch {
      setStatus('failed')
    }
  }, [amount, clearError, createDeposit, payerName, phone, stopOrderListener])

  const handleCopy = useCallback(async () => {
    if (!copyPasteCode) {
      return
    }

    try {
      await navigator.clipboard.writeText(copyPasteCode)
      setCopyMessage('Codigo PIX copiado com sucesso.')
    } catch {
      setCopyMessage('Nao foi possivel copiar automaticamente.')
    }
  }, [copyPasteCode])

  const isGenerating = loading || status === 'generating'

  return (
    <div className="rounded-2xl border border-white/15 bg-luxury-card/70 p-5 backdrop-blur-sm text-white">
      <h3 className="text-xl font-bold">Pagamento via PIX</h3>
      <p className="mt-2 text-sm text-gray-300">
        Valor: <strong className="text-gold">R$ {Number(amount || 0).toFixed(2)}</strong>
      </p>

      {status === 'idle' && (
        <button
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-green-500 px-4 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isGenerating}
          onClick={handleCreatePix}
          type="button"
        >
          Gerar QR Code PIX
        </button>
      )}

      {(status === 'generating' || status === 'pending') && (
        <div className="mt-4 space-y-4">
          <button
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-green-500 px-4 text-sm font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-70"
            disabled
            type="button"
          >
            {status === 'generating' ? 'Gerando PIX...' : 'Aguardando pagamento...'}
          </button>

          {order?.qrCode && (
            <img
              alt="QR Code PIX"
              className="mx-auto h-56 w-56 rounded-xl border border-white/15 bg-white p-2"
              src={
                order.qrCode.startsWith('data:image')
                  ? order.qrCode
                  : `data:image/png;base64,${order.qrCode}`
              }
            />
          )}

          {order?.copyPaste && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-gray-300">PIX Copia e Cola</p>
              <p className="break-all text-xs text-gray-100">{order.copyPaste}</p>
              <button
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-gold px-4 text-xs font-bold uppercase tracking-wider text-black transition hover:brightness-105"
                onClick={handleCopy}
                type="button"
              >
                Copiar codigo PIX
              </button>
            </div>
          )}

          {!order?.qrCode && !order?.copyPaste && (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-200">
                PIX/QR Code esta sendo gerado.
              </p>
            </div>
          )}

          {copyMessage && <p className="text-xs text-green-400">{copyMessage}</p>}
        </div>
      )}

      {status === 'paid' && (
        <div className="mt-4 rounded-xl border border-green-500/40 bg-green-500/15 p-4">
          <p className="text-sm font-semibold text-green-300">Pagamento confirmado com sucesso.</p>
          <p className="mt-1 text-xs text-green-200">Seu pedido foi marcado como pago.</p>
        </div>
      )}

      {status === 'failed' && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/15 p-4">
          <p className="text-sm font-semibold text-red-300">{errorMessage}</p>
          <button
            className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-red-500 px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-400"
            onClick={handleCreatePix}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
