import { useCallback, useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useLocation, useNavigate } from 'react-router-dom'
import PixCheckout from '../components/PixCheckout'
import AnnouncementBar from '../components/home/AnnouncementBar'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/purchaseNumbers'
import { logPurchaseFlow } from '../utils/purchaseFlowLogger'

type CheckoutNavigationState = {
  orderId?: string
  amount?: number
  quantity?: number
  selectedNumbers?: number[]
  couponCode?: string
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

  const phone = value.trim()
  return phone || null
}

export default function CheckoutPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isLoggedIn, isAuthReady } = useAuthStore()
  const navigationState = (location.state || {}) as CheckoutNavigationState
  const [accountName, setAccountName] = useState('')
  const [accountPhone, setAccountPhone] = useState<string | null>(null)
  const [isReturningToSelection, setIsReturningToSelection] = useState(false)
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

  const [payerName, setPayerName] = useState(user?.displayName?.trim() || '')
  const [amountInput, setAmountInput] = useState(routeAmount > 0 ? routeAmount.toFixed(2) : '')

  useEffect(() => {
    if (!isAuthReady || !user?.uid) {
      setAccountName('')
      setAccountPhone(null)
      return
    }

    const userDocRef = doc(db, 'users', user.uid)
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setAccountName(parseOptionalText(user.displayName))
          setAccountPhone(parseOptionalPhone(user.phoneNumber))
          return
        }

        const data = snapshot.data()
        const firestoreName = parseOptionalText(data.name)
        const firestorePhone = parseOptionalPhone(data.phone)
        setAccountName(firestoreName || parseOptionalText(user.displayName))
        setAccountPhone(firestorePhone || parseOptionalPhone(user.phoneNumber))
      },
      () => {
        setAccountName(parseOptionalText(user.displayName))
        setAccountPhone(parseOptionalPhone(user.phoneNumber))
      },
    )

    return unsubscribe
  }, [isAuthReady, user?.displayName, user?.phoneNumber, user?.uid])

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
    if (routeAmount <= 0) {
      return
    }

    setAmountInput(routeAmount.toFixed(2))
  }, [routeAmount])

  const amount = useMemo(() => parsePositiveAmount(amountInput.replace(',', '.')), [amountInput])

  const selectedNumbers = navigationState.selectedNumbers || []
  const selectedCount = navigationState.quantity || selectedNumbers.length || 0
  const selectedCouponCode = parseOptionalText(navigationState.couponCode) || null

  useEffect(() => {
    logPurchaseFlow('CheckoutPage', 'page_loaded', 'info', {
      isLoggedIn,
      isAuthReady,
      routeOrderId,
      routeAmount,
      selectedCount,
      selectedNumbersPreview: selectedNumbers.slice(0, 10),
    })
  }, [isAuthReady, isLoggedIn, routeAmount, routeOrderId, selectedCount, selectedNumbers])

  const handleBackToSelection = useCallback(async () => {
    if (isReturningToSelection) {
      return
    }

    setIsReturningToSelection(true)
    logPurchaseFlow('CheckoutPage', 'back_to_selection_started', 'info', {
      isLoggedIn,
      selectedCount,
      routeOrderId,
    })

    logPurchaseFlow('CheckoutPage', 'navigate_back_to_selection', 'info', {
      routeOrderId,
      reservationStrategy: 'keep_until_expiration',
    })
    navigate('/#comprar-numeros')
  }, [isLoggedIn, isReturningToSelection, navigate, routeOrderId, selectedCount])

  const handlePaymentConfirmed = useCallback((paidOrderId: string) => {
    logPurchaseFlow('CheckoutPage', 'payment_confirmed_redirect', 'info', {
      paidOrderId,
    })

    navigate('/minha-conta?section=comprovantes', {
      replace: true,
      state: { highlightOrderId: paidOrderId },
    })
  }, [navigate])

  return (
    <div className="selection:bg-gold selection:text-black overflow-x-hidden bg-luxury-bg font-display text-text-main">
      <AnnouncementBar />

      <div className="relative flex min-h-screen flex-col">
        <Header />

        <main className="flex-grow">
          <section className="hero-bg border-b border-white/5">
            <div className="container mx-auto px-4 py-14 lg:px-8 lg:py-18">
              <div className="max-w-3xl">
                <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
                  Checkout PIX
                </span>
                <h1 className="mt-5 text-3xl font-luxury font-bold leading-tight lg:text-5xl">
                  Finalize agora e
                  <span className="text-gold"> confirme suas cotas</span> em tempo real.
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
                <div className="rounded-2xl border border-gold/25 bg-luxury-card p-6 shadow-2xl">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Resumo do pedido</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Quantidade selecionada</span>
                      <span className="font-black text-white">{selectedCount || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span>Total para pagar</span>
                      <span className="font-black text-gold">
                        {amount > 0 ? formatCurrency(amount) : 'Informar valor'}
                      </span>
                    </div>
                    {selectedCouponCode ? (
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Cupom aplicado</span>
                        <span className="font-black text-cyan-200">{selectedCouponCode}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-3">
                    <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="payer-name">
                      Nome do pagador
                    </label>
                    <input
                      id="payer-name"
                      className="h-11 w-full rounded-lg border border-white/15 bg-luxury-bg px-3 text-sm text-white outline-none focus:border-gold"
                      placeholder="Digite o nome completo"
                      type="text"
                      value={payerName}
                      onChange={(event) => setPayerName(event.target.value)}
                      readOnly={Boolean(accountName)}
                    />
                    {accountName ? (
                      <p className="text-[11px] text-gray-500">Preenchido automaticamente com os dados da conta.</p>
                    ) : null}

                    {accountPhone ? (
                      <p className="text-[11px] text-gray-500">
                        Telefone do pagador: {accountPhone}
                      </p>
                    ) : null}

                    <label className="block text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="order-amount">
                      Valor do pagamento
                    </label>
                    <input
                      id="order-amount"
                      className="h-11 w-full rounded-lg border border-white/15 bg-luxury-bg px-3 text-sm text-white outline-none focus:border-gold"
                      inputMode="decimal"
                      placeholder="0,00"
                      type="text"
                      value={amountInput}
                      onChange={(event) => setAmountInput(event.target.value)}
                    />
                  </div>

                  {selectedNumbers.length > 0 ? (
                    <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Numeros reservados</p>
                      <p className="mt-2 break-all text-xs text-gray-300">
                        {selectedNumbers.slice(0, 20).join(', ')}
                        {selectedNumbers.length > 20 ? ` ... +${selectedNumbers.length - 20}` : ''}
                      </p>
                    </div>
                  ) : null}

                  <button
                    className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-70"
                    type="button"
                    onClick={handleBackToSelection}
                    disabled={isReturningToSelection}
                  >
                    {isReturningToSelection ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    ) : (
                      <span className="material-symbols-outlined text-sm">arrow_back</span>
                    )}
                    Voltar para selecao
                  </button>
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

                {isAuthReady && isLoggedIn ? (
                  <PixCheckout
                    amount={amount}
                    payerName={payerName}
                    phone={accountPhone}
                    existingOrderId={routeOrderId || null}
                    couponCode={selectedCouponCode}
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
