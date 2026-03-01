import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useLocation, useNavigate } from 'react-router-dom'
import PixCheckout from '../components/PixCheckout'
import AnnouncementBar from '../components/home/AnnouncementBar'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import { useCampaignSettings } from '../hooks/useCampaignSettings'
import { db, functions } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import type { CouponFeedback } from '../types/purchaseNumbers'
import { validateCouponCode } from '../services/purchaseNumbers/purchaseNumbersService'
import { calculateCampaignPricing, resolveCouponByCode } from '../utils/campaignPricing'
import { formatCpfInput } from '../utils/cpf'
import { formatCurrency } from '../utils/purchaseNumbers'
import { formatTicketNumbers } from '../utils/ticketNumber'

type CheckoutNavigationState = {
  orderId?: string
  amount?: number
  quantity?: number
  selectedNumbers?: number[]
  couponCode?: string
  isAutomaticSelection?: boolean
}

type ReserveNumbersInput = {
  numbers: number[]
}

type ReserveNumbersResponse = {
  numbers?: number[]
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

function parsePositiveAmount(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return Number(parsed.toFixed(2))
}

function parseOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function parseOptionalPhone(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const rawDigits = value.replace(/\D/g, '')
  if (!rawDigits) {
    return null
  }

  const phone = rawDigits.slice(-11)
  return phone || null
}

function parseOptionalCpf(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const cpf = value.replace(/\D/g, '').slice(0, 11)
  return cpf || null
}

function parseOptionalNumberList(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0),
  )).sort((left, right) => left - right)
}

function getReserveErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Nao foi possivel reservar os numeros agora. Tente novamente.'
  }

  const candidate = error as { message?: string; code?: string }

  if (candidate.message) {
    const cleanMessage = candidate.message
      .replace(/^Firebase:\s*/i, '')
      .replace(/\s*\(functions\/[a-z-]+\)\.?$/i, '')
      .trim()

    if (cleanMessage) {
      return cleanMessage
    }
  }

  if (candidate.code === 'functions/unauthenticated') {
    return 'Voce precisa entrar na conta para reservar numeros.'
  }

  return 'Nao foi possivel reservar os numeros agora. Tente novamente.'
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    const parts = []
    parts.push(digits.slice(0, 2))
    if (digits.length > 2) parts.push(digits.slice(2, 6))
    if (digits.length > 6) parts.push(digits.slice(6, 10))
    const [ddd, first, second] = parts
    let formatted = ddd ? `(${ddd})` : ''
    if (first) formatted += ` ${first}`
    if (second) formatted += `-${second}`
    return formatted.trim()
  }

  const ddd = digits.slice(0, 2)
  const first = digits.slice(2, 7)
  const second = digits.slice(7, 11)
  return `(${ddd}) ${first}-${second}`
}

export default function CheckoutPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isLoggedIn, isAuthReady } = useAuthStore()
  const { campaign } = useCampaignSettings()
  const navigationState = (location.state || {}) as CheckoutNavigationState
  const [accountName, setAccountName] = useState('')
  const [accountPhone, setAccountPhone] = useState<string | null>(null)
  const [accountCpf, setAccountCpf] = useState<string | null>(null)
  const [payerPhone, setPayerPhone] = useState('')
  const [payerCpf, setPayerCpf] = useState('')
  const [isReturningToSelection, setIsReturningToSelection] = useState(false)
  const [isGoingToManualSelection, setIsGoingToManualSelection] = useState(false)
  const [isRecoveringReservation, setIsRecoveringReservation] = useState(false)
  const [reservedNumbers, setReservedNumbers] = useState<number[]>([])
  const [couponInput, setCouponInput] = useState('')
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null)
  const [couponFeedback, setCouponFeedback] = useState<CouponFeedback | null>(null)
  const reserveNumbersCallable = useMemo(
    () => httpsCallable<ReserveNumbersInput, unknown>(functions, 'reserveNumbers'),
    [],
  )
  const routeOrderId = useMemo(() => {
    const queryOrderId = new URLSearchParams(location.search).get('orderId')
    const fromQuery = parseOptionalText(queryOrderId)
    if (fromQuery) {
      return fromQuery
    }

    return parseOptionalText(navigationState.orderId)
  }, [location.search, navigationState.orderId])

  const routeAmount = useMemo(() => {
    const queryValue = new URLSearchParams(location.search).get('amount')
    const queryAmount = parsePositiveAmount(queryValue)

    if (queryAmount > 0) {
      return queryAmount
    }

    return parsePositiveAmount(navigationState.amount)
  }, [location.search, navigationState.amount])
  const cameFromAutomaticSelection = navigationState.isAutomaticSelection === true

  const [payerName, setPayerName] = useState(user?.displayName?.trim() || '')

  useEffect(() => {
    if (!isAuthReady || !user?.uid) {
      setAccountName('')
      setAccountPhone(null)
      setAccountCpf(null)
      return
    }

    const userDocRef = doc(db, 'users', user.uid)
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setAccountName(parseOptionalText(user.displayName))
          setAccountPhone(parseOptionalPhone(user.phoneNumber))
          setAccountCpf(null)
          return
        }

        const data = snapshot.data()
        const firestoreName = parseOptionalText(data.name)
        const firestorePhone = parseOptionalPhone(data.phone)
        const firestoreCpf = parseOptionalCpf(data.cpf)
        setAccountName(firestoreName || parseOptionalText(user.displayName))
        setAccountPhone(firestorePhone || parseOptionalPhone(user.phoneNumber))
        setAccountCpf(firestoreCpf)
      },
      () => {
        setAccountName(parseOptionalText(user.displayName))
        setAccountPhone(parseOptionalPhone(user.phoneNumber))
        setAccountCpf(null)
      },
    )

    return unsubscribe
  }, [isAuthReady, user?.displayName, user?.phoneNumber, user?.uid])

  useEffect(() => {
    if (!isAuthReady || !user?.uid) {
      setReservedNumbers([])
      return
    }

    const reservationRef = doc(db, 'numberReservations', user.uid)
    const unsubscribe = onSnapshot(
      reservationRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setReservedNumbers([])
          return
        }

        setReservedNumbers(parseOptionalNumberList(snapshot.get('numbers')))
      },
      () => {
        setReservedNumbers([])
      },
    )

    return unsubscribe
  }, [isAuthReady, user?.uid])

  useEffect(() => {
    if (accountName) {
      setPayerName(accountName)
      return
    }

    if (!user?.displayName || payerName) {
      return
    }

    setPayerName(user.displayName)
  }, [accountName, payerName, user?.displayName])

  useEffect(() => {
    if (!payerPhone && accountPhone) {
      setPayerPhone(accountPhone)
    }
  }, [accountPhone, payerPhone])

  useEffect(() => {
    if (!payerCpf && accountCpf) {
      setPayerCpf(accountCpf)
    }
  }, [accountCpf, payerCpf])

  const routeSelectedNumbers = useMemo(
    () => parseOptionalNumberList(navigationState.selectedNumbers),
    [navigationState.selectedNumbers],
  )
  const selectedNumbers = routeSelectedNumbers.length > 0 ? routeSelectedNumbers : reservedNumbers
  const formattedSelectedNumbers = useMemo(() => formatTicketNumbers(selectedNumbers), [selectedNumbers])
  const selectedCount = selectedNumbers.length > 0
    ? selectedNumbers.length
    : Number(navigationState.quantity || 0)
  const hasSelection = selectedNumbers.length > 0
  const selectedCouponCode = parseOptionalText(navigationState.couponCode) || null
  const appliedCoupon = resolveCouponByCode(campaign.coupons, appliedCouponCode)
  const pricing = calculateCampaignPricing(selectedCount, campaign, appliedCoupon)
  const amount = pricing.total > 0 ? pricing.total : routeAmount

  useEffect(() => {
    if (!selectedCouponCode) {
      setCouponInput('')
      setAppliedCouponCode(null)
      setCouponFeedback(null)
      return
    }

    setCouponInput(selectedCouponCode)
    const resolved = resolveCouponByCode(campaign.coupons, selectedCouponCode)
    if (!resolved) {
      setAppliedCouponCode(null)
      setCouponFeedback({
        tone: 'neutral',
        message: 'Cupom recebido no checkout nao esta ativo no momento.',
      })
      return
    }

    setAppliedCouponCode(resolved.code)
    setCouponFeedback({
      tone: 'success',
      message: `Cupom ${resolved.code} aplicado no checkout.`,
    })
  }, [campaign.coupons, selectedCouponCode])

  const handleApplyCheckoutCoupon = useCallback(() => {
    const validation = validateCouponCode(couponInput, campaign.coupons, pricing.subtotalAfterPromotion)
    setCouponFeedback({
      tone: validation.status === 'valid' ? 'success' : 'neutral',
      message: validation.message,
    })

    if (validation.status !== 'valid') {
      setAppliedCouponCode(null)
      return
    }

    setAppliedCouponCode(validation.code)
  }, [campaign.coupons, couponInput, pricing.subtotalAfterPromotion])

  const handleRemoveCheckoutCoupon = useCallback(() => {
    setCouponInput('')
    setAppliedCouponCode(null)
    setCouponFeedback(null)
  }, [])

  const handleBackToSelection = useCallback(async () => {
    if (isReturningToSelection) {
      return
    }

    setIsReturningToSelection(true)
    navigate('/comprar-manualmente')
  }, [isReturningToSelection, navigate])

  const handleGoToManualSelection = useCallback(() => {
    if (isGoingToManualSelection) {
      return
    }

    setIsGoingToManualSelection(true)
    navigate('/comprar-manualmente?mode=manual')
  }, [isGoingToManualSelection, navigate])

  const handlePaymentConfirmed = useCallback((paidOrderId: string) => {
    navigate('/minha-conta?section=comprovantes', {
      replace: true,
      state: { highlightOrderId: paidOrderId },
    })
  }, [navigate])

  const handleRecoverReservation = useCallback(async () => {
    if (isRecoveringReservation) {
      return
    }

    if (!isAuthReady || !isLoggedIn || !user?.uid) {
      throw new Error('Voce precisa entrar na conta para reservar novamente.')
    }

    if (selectedNumbers.length === 0) {
      throw new Error('Nao ha numeros para reservar novamente.')
    }

    setIsRecoveringReservation(true)

    try {
      const callableResult = await reserveNumbersCallable({ numbers: selectedNumbers })
      const payload = unwrapCallableData(callableResult.data as CallableEnvelope<ReserveNumbersResponse>)
      const refreshedNumbers = parseOptionalNumberList(payload.numbers)

      if (refreshedNumbers.length === 0) {
        throw new Error('Nao foi possivel reservar novamente os numeros selecionados.')
      }

      setReservedNumbers(refreshedNumbers)
    } catch (error) {
      throw new Error(getReserveErrorMessage(error))
    } finally {
      setIsRecoveringReservation(false)
    }
  }, [isAuthReady, isLoggedIn, isRecoveringReservation, reserveNumbersCallable, selectedNumbers, user?.uid])

  return (
    <div className="selection:bg-neon-pink selection:text-black overflow-x-hidden bg-luxury-bg font-display text-text-main">
      <AnnouncementBar />

      <div className="relative flex min-h-screen flex-col">
        <Header />

        <main className="flex-grow">
          <section className="hero-bg border-b border-white/5">
            <div className="container mx-auto px-4 py-14 lg:px-8 lg:py-18">
              <div className="max-w-3xl">
                <span className="inline-flex items-center rounded-full border border-neon-pink/40 bg-neon-pink/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-neon-pink">
                  Checkout PIX
                </span>
                <h1 className="mt-5 text-3xl font-luxury font-bold leading-tight lg:text-5xl">
                  Finalize agora e
                  <span className="text-neon-pink"> confirme suas cotas</span> em tempo real.
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-gray-300 lg:text-base">
                  Assim que o pagamento for identificado, seu pedido muda para pago automaticamente.
                </p>
              </div>
            </div>
          </section>

          <section className="container mx-auto px-4 py-10 lg:px-8 lg:py-14">
            <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
              <aside className="lg:col-span-2 space-y-4">
                <div className="rounded-2xl border border-neon-pink/25 bg-luxury-card p-6 shadow-2xl">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-neon-pink">Resumo do pedido</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Quantidade selecionada</span>
                      <span className="font-black text-white">{selectedCount || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Subtotal base</span>
                      <span className="font-black text-white">{formatCurrency(pricing.subtotalBase)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>
                        {pricing.appliedPromotion?.discountType === 'percent'
                          ? `Desconto por quantidade (${pricing.appliedPromotion.discountValue.toFixed(2).replace(/\.00$/, '')}%)`
                          : 'Desconto por quantidade'}
                      </span>
                      <span className="font-black text-emerald-300">- {formatCurrency(pricing.promotionDiscount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Subtotal apos desconto por quantidade</span>
                      <span className="font-black text-white">{formatCurrency(pricing.subtotalAfterPromotion)}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Desconto cupom</span>
                      <span className="font-black text-cyan-200">- {formatCurrency(pricing.couponDiscount)}</span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-neon-pink/35 bg-neon-pink/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-neon-pink">Total para pagar</p>
                    <p className="mt-1 text-4xl font-black text-white">
                      {amount > 0 ? formatCurrency(amount) : 'Informar valor'}
                    </p>
                    {pricing.appliedPromotion?.targetQuantity ? (
                      <p className="mt-1 text-xs text-amber-100">
                        Desconto progressivo ativo para {pricing.appliedPromotion.targetQuantity}+ numeros.
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-luxury-bg p-4">
                    <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="checkout-coupon">
                      Cupom de desconto
                    </label>
                    <div className="mt-2 flex gap-2 max-[419px]:flex-col">
                      <input
                        id="checkout-coupon"
                        className="h-10 flex-1 rounded border border-white/15 bg-luxury-card px-3 text-sm text-white outline-none focus:border-neon-pink max-[639px]:h-14 max-[639px]:px-4 max-[639px]:text-lg"
                        type="text"
                        placeholder="Ex: PIX10"
                        value={couponInput}
                        onChange={(event) => setCouponInput(event.target.value)}
                      />
                      <button
                        className="h-10 rounded bg-neon-pink px-4 text-xs font-black uppercase tracking-widest text-black hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        type="button"
                        onClick={handleApplyCheckoutCoupon}
                        disabled={!couponInput.trim() || !hasSelection}
                      >
                        Aplicar
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-cyan-100">
                        {appliedCouponCode ? `Cupom ativo: ${appliedCouponCode}` : 'Nenhum cupom ativo'}
                      </p>
                      {appliedCouponCode ? (
                        <button
                          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-200 transition hover:text-red-100"
                          type="button"
                          onClick={handleRemoveCheckoutCoupon}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                    {couponFeedback ? (
                      <p className={`mt-2 text-xs ${couponFeedback.tone === 'success' ? 'text-emerald-300' : 'text-gray-400'}`}>
                        {couponFeedback.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-3">
                    <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="payer-name">
                      Nome do pagador
                    </label>
                    <input
                      id="payer-name"
                      className="h-11 w-full rounded-lg border border-white/15 bg-luxury-bg px-3 text-sm text-white outline-none focus:border-neon-pink"
                      placeholder="Digite o nome completo"
                      type="text"
                      value={payerName}
                      onChange={(event) => setPayerName(event.target.value)}
                      readOnly={Boolean(accountName)}
                    />
                    {accountName ? (
                      <p className="text-[11px] text-gray-500">Preenchido automaticamente com os dados da conta.</p>
                    ) : null}

                    <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="payer-phone">
                      Numero do pagador
                    </label>
                    <input
                      id="payer-phone"
                      className="h-11 w-full rounded-lg border border-white/15 bg-luxury-bg px-3 text-sm text-white outline-none focus:border-neon-pink"
                      inputMode="tel"
                      placeholder="(00) 00000-0000"
                      type="tel"
                      value={formatPhoneInput(payerPhone)}
                      onChange={(event) => setPayerPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
                    />
                    {accountPhone ? (
                      <p className="text-[11px] text-gray-500">
                        Numero sugerido a partir dos dados da conta.
                      </p>
                    ) : null}

                    <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="payer-cpf">
                      CPF do pagador
                    </label>
                    <input
                      id="payer-cpf"
                      className="h-11 w-full rounded-lg border border-white/15 bg-luxury-bg px-3 text-sm text-white outline-none focus:border-neon-pink"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      type="text"
                      value={formatCpfInput(payerCpf)}
                      onChange={(event) => setPayerCpf(event.target.value.replace(/\D/g, '').slice(0, 11))}
                    />
                    {accountCpf ? <p className="text-[11px] text-gray-500">CPF sugerido a partir da sua conta.</p> : null}
                  </div>

                  {selectedNumbers.length > 0 ? (
                    <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Numeros reservados</p>
                      <p className="mt-2 break-all text-xs text-gray-300">
                        {formattedSelectedNumbers.slice(0, 20).join(', ')}
                        {selectedNumbers.length > 20 ? ` ... +${selectedNumbers.length - 20}` : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-lg border border-amber-300/30 bg-amber-500/10 p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200">Sem reserva ativa</p>
                      <p className="mt-2 text-xs text-amber-100/90">
                        Nao encontramos numeros reservados para gerar o PIX. Volte e selecione seus numeros.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <button
                      className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neon-pink hover:text-neon-pink-light disabled:cursor-not-allowed disabled:opacity-70"
                      type="button"
                      onClick={handleBackToSelection}
                      disabled={isReturningToSelection}
                    >
                      {isReturningToSelection ? (
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neon-pink border-t-transparent" />
                      ) : (
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                      )}
                      Voltar para selecao
                    </button>

                    {cameFromAutomaticSelection ? (
                      <button
                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                        type="button"
                        onClick={handleGoToManualSelection}
                        disabled={isGoingToManualSelection}
                      >
                        {isGoingToManualSelection ? (
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-100 border-t-transparent" />
                        ) : (
                          <span className="material-symbols-outlined text-sm">touch_app</span>
                        )}
                        Escolher numeros manualmente
                      </button>
                    ) : null}
                  </div>
                </div>
              </aside>

              <div className="lg:col-span-3">
                {!isAuthReady ? (
                  <div className="rounded-2xl border border-white/10 bg-luxury-card p-6 text-sm text-gray-300">
                    Carregando autenticacao...
                  </div>
                ) : null}

                {isAuthReady && !isLoggedIn ? (
                  <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
                    <p className="text-sm font-semibold text-red-200">
                      Voce precisa entrar na conta antes de gerar o PIX.
                    </p>
                    <p className="mt-2 text-xs text-red-100/80">
                      Clique em "Entrar" no topo da pagina e volte para continuar.
                    </p>
                  </div>
                ) : null}

                {isAuthReady && isLoggedIn && !hasSelection ? (
                  <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-6">
                    <p className="text-sm font-semibold text-amber-100">
                      Sua reserva nao foi encontrada.
                    </p>
                    <p className="mt-2 text-xs text-amber-50/80">
                      Volte para selecionar numeros e tente novamente.
                    </p>
                    <button
                      className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-amber-300/35 bg-amber-500/20 px-4 text-xs font-bold uppercase tracking-[0.12em] text-amber-100 transition hover:bg-amber-500/30"
                      type="button"
                      onClick={handleBackToSelection}
                    >
                      Voltar para seleção
                    </button>
                  </div>
                ) : null}

                {isAuthReady && isLoggedIn && hasSelection ? (
                  <PixCheckout
                    amount={amount}
                    payerName={payerName}
                    phone={payerPhone}
                    cpf={payerCpf}
                    existingOrderId={routeOrderId || null}
                    couponCode={appliedCouponCode}
                    canRecoverReservation={selectedNumbers.length > 0}
                    isRecoveringReservation={isRecoveringReservation}
                    onRecoverReservation={handleRecoverReservation}
                    onPaymentConfirmed={handlePaymentConfirmed}
                  />
                ) : null}
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
