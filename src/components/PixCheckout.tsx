import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore'
import { toast } from 'react-toastify'
import { db } from '../lib/firebase'
import { useHorsePay, type CreateDepositResponse } from '../hooks/useHorsePay'

interface PixCheckoutProps {
  amount: number
  payerName: string
  phone?: string | null
  cpf?: string | null
  existingOrderId?: string | null
  couponCode?: string | null
  canRecoverReservation?: boolean
  isRecoveringReservation?: boolean
  onRecoverReservation?: () => Promise<void> | void
  onPaymentConfirmed?: (orderId: string) => void
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

export default function PixCheckout({
  amount,
  payerName,
  phone,
  cpf,
  existingOrderId = null,
  couponCode = null,
  canRecoverReservation = false,
  isRecoveringReservation = false,
  onRecoverReservation,
  onPaymentConfirmed,
}: PixCheckoutProps) {
  const { createDeposit, loading, error, clearError } = useHorsePay()
  const [status, setStatus] = useState<CheckoutStatus>('idle')
  const [order, setOrder] = useState<CreateDepositResponse | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const orderListenerRef = useRef<(() => void) | null>(null)
  const paidToastOrderRef = useRef<string | null>(null)
  const paidCallbackOrderRef = useRef<string | null>(null)
  const copyPasteCode = order?.copyPaste || ''

  const errorMessage = useMemo(
    () => localError || normalizeErrorMessage(error),
    [error, localError],
  )
  const shouldShowRecoveryButton = useMemo(() => {
    if (!canRecoverReservation || !onRecoverReservation || status !== 'failed') {
      return false
    }

    const normalized = errorMessage.toLowerCase()
    return normalized.includes('sua reserva expirou') && normalized.includes('reserve novamente')
  }, [canRecoverReservation, errorMessage, onRecoverReservation, status])

  const stopOrderListener = useCallback(() => {
    if (!orderListenerRef.current) {
      return
    }

    orderListenerRef.current()
    orderListenerRef.current = null
  }, [])

  useEffect(() => () => stopOrderListener(), [stopOrderListener])

  useEffect(() => {
    if (!existingOrderId) {
      return
    }

    stopOrderListener()
    clearError()
    setLocalError(null)
    setCopyMessage('')
    paidToastOrderRef.current = null
    paidCallbackOrderRef.current = null
    setOrder({
      externalId: existingOrderId,
      copyPaste: null,
      qrCode: null,
      status: 'pending',
    })
    setStatus('pending')
  }, [clearError, existingOrderId, stopOrderListener])

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
          if (paidToastOrderRef.current !== snapshot.id) {
            paidToastOrderRef.current = snapshot.id
            toast.success('Pagamento identificado com sucesso.', {
              position: 'top-right',
              toastId: `pix-paid-${snapshot.id}`,
            })
          }

          if (onPaymentConfirmed && paidCallbackOrderRef.current !== snapshot.id) {
            paidCallbackOrderRef.current = snapshot.id
            onPaymentConfirmed(snapshot.id)
          }

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
  }, [onPaymentConfirmed, order?.externalId, status, stopOrderListener])

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
    paidToastOrderRef.current = null
    setStatus('generating')

    if (!payerName.trim()) {
      setLocalError('Informe o nome do pagador para gerar o PIX.')
      setStatus('failed')
      return
    }

    const sanitizedCpf = typeof cpf === 'string' ? cpf.replace(/\D/g, '') : ''
    if (sanitizedCpf.length !== 11) {
      setLocalError('Informe um CPF valido com 11 digitos para gerar o PIX.')
      setStatus('failed')
      return
    }

    try {
      const response = await createDeposit({
        payerName: payerName.trim(),
        phone: typeof phone === 'string' && phone.trim() ? phone.trim() : undefined,
        cpf: sanitizedCpf,
        couponCode,
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
  }, [clearError, couponCode, cpf, createDeposit, payerName, phone, stopOrderListener])

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

  const handleRecoverReservationAndRetry = useCallback(async () => {
    if (!onRecoverReservation || !canRecoverReservation) {
      return
    }

    clearError()
    setLocalError(null)
    setCopyMessage('')

    try {
      await onRecoverReservation()
    } catch (reservationError) {
      setLocalError(normalizeErrorMessage(reservationError))
      setStatus('failed')
      return
    }

    await handleCreatePix()
  }, [canRecoverReservation, clearError, handleCreatePix, onRecoverReservation])

  const isGenerating = loading || status === 'generating'
  const isCpfMissing = !cpf || cpf.replace(/\D/g, '').length < 11

  return (
    <div className="rounded-2xl border border-white/15 bg-luxury-card/70 p-5 backdrop-blur-sm text-white">
      <h3 className="text-xl font-bold">Pagamento via PIX</h3>
      <p className="mt-2 text-sm text-gray-300">
        Valor: <strong className="text-neon-pink">R$ {Number(amount || 0).toFixed(2)}</strong>
      </p>

      {status === 'idle' && (
        <div className={isCpfMissing ? 'group relative mt-4' : 'mt-4'}>
          <button
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-4 text-sm font-bold uppercase tracking-wider text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isGenerating || isCpfMissing}
            onClick={handleCreatePix}
            type="button"
          >
            Gerar QR Code PIX
          </button>
          {isCpfMissing && (
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Preencha o CPF para continuar
            </span>
          )}
        </div>
      )}

      {(status === 'generating' || status === 'pending') && (
        <div className="mt-4 space-y-4">
          <button
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-4 text-sm font-bold uppercase tracking-wider text-black disabled:cursor-not-allowed disabled:opacity-70"
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
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-neon-pink px-4 text-xs font-bold uppercase tracking-wider text-black transition hover:brightness-105"
                onClick={handleCopy}
                type="button"
              >
                Copiar codigo PIX
              </button>
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-red-500 px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-400"
              onClick={handleCreatePix}
              type="button"
            >
              Tentar novamente
            </button>

            {shouldShowRecoveryButton ? (
              <button
                className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-400 px-4 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={handleRecoverReservationAndRetry}
                disabled={isRecoveringReservation || isGenerating}
                type="button"
              >
                {isRecoveringReservation ? 'Reservando...' : 'Reservar novamente numeros'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
