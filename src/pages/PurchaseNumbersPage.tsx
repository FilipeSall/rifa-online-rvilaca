import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AnnouncementBar from '../components/home/AnnouncementBar'
import Header from '../components/home/Header'
import Footer from '../components/home/Footer'

type SelectionMode = 'automatico' | 'manual'
type NumberStatus = 'disponivel' | 'reservado' | 'pago'

type NumberSlot = {
  number: number
  status: NumberStatus
}

const UNIT_PRICE = 0.99
const MIN_QUANTITY = 10
const MAX_QUANTITY = 300
const RESERVATION_SECONDS = 10 * 60

const PACKS = [10, 50, 100, 250]

const COUPONS: Record<string, number> = {
  PIX10: 0.1,
  COMBO20: 0.2,
}

const NUMBER_POOL: NumberSlot[] = Array.from({ length: 120 }, (_, index) => {
  const number = 540001 + index

  if ((index + 3) % 11 === 0) {
    return { number, status: 'reservado' }
  }

  if ((index + 5) % 17 === 0) {
    return { number, status: 'pago' }
  }

  return { number, status: 'disponivel' }
})

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function pickRandomNumbers(pool: number[], quantity: number) {
  const numbers = [...pool]

  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[numbers[index], numbers[randomIndex]] = [numbers[randomIndex], numbers[index]]
  }

  return numbers.slice(0, quantity).sort((a, b) => a - b)
}

export default function PurchaseNumbersPage() {
  const navigate = useNavigate()
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('automatico')
  const [quantity, setQuantity] = useState(MIN_QUANTITY)
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null)
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null)
  const [reservationSeconds, setReservationSeconds] = useState<number | null>(null)
  const [hasExpiredReservation, setHasExpiredReservation] = useState(false)

  const availableNumbers = useMemo(
    () => NUMBER_POOL.filter((item) => item.status === 'disponivel').map((item) => item.number),
    [],
  )

  const selectedCount = selectedNumbers.length
  const subtotal = selectedCount * UNIT_PRICE
  const discountRate = appliedCoupon ? COUPONS[appliedCoupon] ?? 0 : 0
  const discountAmount = subtotal * discountRate
  const totalAmount = Math.max(subtotal - discountAmount, 0)
  const canProceed = selectedCount >= MIN_QUANTITY

  useEffect(() => {
    if (selectionMode !== 'automatico') {
      return
    }

    const nextQuantity = Math.min(quantity, availableNumbers.length)
    setSelectedNumbers(pickRandomNumbers(availableNumbers, nextQuantity))
  }, [selectionMode, quantity, availableNumbers])

  useEffect(() => {
    if (selectionMode !== 'manual') {
      return
    }

    setSelectedNumbers((currentSelection) => {
      if (currentSelection.length <= quantity) {
        return currentSelection
      }

      return currentSelection.slice(0, quantity)
    })
  }, [quantity, selectionMode])

  useEffect(() => {
    if (reservationSeconds === null) {
      return
    }

    if (reservationSeconds <= 0) {
      setReservationSeconds(null)
      setHasExpiredReservation(true)
      return
    }

    const timer = window.setInterval(() => {
      setReservationSeconds((currentTime) => {
        if (currentTime === null) {
          return null
        }

        return currentTime - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [reservationSeconds])

  const handleSetQuantity = (value: number) => {
    const nextValue = Number.isFinite(value) ? value : MIN_QUANTITY
    const safeValue = Math.max(MIN_QUANTITY, Math.min(nextValue, MAX_QUANTITY, availableNumbers.length))
    setQuantity(safeValue)
    setReservationSeconds(null)
    setHasExpiredReservation(false)
  }

  const handleToggleNumber = (slot: NumberSlot) => {
    if (selectionMode !== 'manual' || slot.status !== 'disponivel') {
      return
    }

    setSelectedNumbers((currentSelection) => {
      const alreadySelected = currentSelection.includes(slot.number)

      if (alreadySelected) {
        return currentSelection.filter((selectedNumber) => selectedNumber !== slot.number)
      }

      if (currentSelection.length >= quantity) {
        return currentSelection
      }

      return [...currentSelection, slot.number].sort((a, b) => a - b)
    })
    setReservationSeconds(null)
    setHasExpiredReservation(false)
  }

  const handleApplyCoupon = () => {
    const normalizedCode = couponCode.trim().toUpperCase()

    if (!normalizedCode) {
      setAppliedCoupon(null)
      setCouponFeedback('Digite um cupom válido.')
      return
    }

    if (!COUPONS[normalizedCode]) {
      setAppliedCoupon(null)
      setCouponFeedback('Cupom não encontrado.')
      return
    }

    setAppliedCoupon(normalizedCode)
    setCouponFeedback(`Cupom ${normalizedCode} aplicado com sucesso.`)
  }

  const handleProceed = () => {
    if (!canProceed) {
      return
    }

    if (reservationSeconds === null) {
      setReservationSeconds(RESERVATION_SECONDS)
      setHasExpiredReservation(false)
      return
    }

    navigate('/checkout')
  }

  return (
    <div className="bg-luxury-bg font-display text-text-main overflow-x-hidden selection:bg-gold selection:text-black">
      <AnnouncementBar />

      <div className="flex min-h-screen flex-col relative">
        <Header />

        <main className="flex-grow pb-16">
          <section className="hero-bg border-b border-white/5">
            <div className="container mx-auto px-4 lg:px-8 py-14 lg:py-20">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
                    Página de compra de números
                  </span>
                  <h1 className="mt-5 text-3xl lg:text-5xl font-luxury font-bold leading-tight">
                    Escolha suas cotas e
                    <span className="text-gold"> garanta sua chance</span> no sorteio.
                  </h1>
                  <p className="mt-4 text-sm lg:text-base text-gray-300 leading-relaxed">
                    Fluxo otimizado para finalizar em menos de 60 segundos: selecione a quantidade, reserve por 10
                    minutos e pague com PIX automático.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:gap-4 w-full max-w-sm">
                  <div className="rounded-xl border border-white/10 bg-luxury-card p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Valor da cota</p>
                    <p className="mt-2 text-2xl font-black text-gold">{formatCurrency(UNIT_PRICE)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-luxury-card p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Compra mínima</p>
                    <p className="mt-2 text-2xl font-black text-white">{MIN_QUANTITY}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">Status do pagamento</p>
                    <p className="mt-2 text-sm font-semibold text-emerald-100">
                      Números só pertencem ao comprador após confirmação PIX.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="container mx-auto px-4 lg:px-8 py-10 lg:py-14">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              <div className="xl:col-span-8 space-y-6">
                <article className="rounded-2xl border border-white/10 bg-luxury-card/70 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">1. Quantidade de cotas</p>
                      <h2 className="mt-2 text-xl font-bold text-white">Defina quantos números deseja comprar</h2>
                    </div>
                    <p className="text-xs text-gray-400">Total disponível no lote exibido: {availableNumbers.length}</p>
                  </div>

                  <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {PACKS.map((pack) => (
                      <button
                        key={pack}
                        className={`rounded-lg border px-4 py-4 text-left transition-all ${
                          quantity === pack
                            ? 'border-gold bg-gold/10 text-gold shadow-glow-gold'
                            : 'border-white/10 bg-luxury-bg text-white hover:border-gold/50'
                        }`}
                        type="button"
                        onClick={() => handleSetQuantity(pack)}
                      >
                        <p className="text-lg font-black">+{pack}</p>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Números</p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-luxury-bg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <label className="text-xs uppercase tracking-[0.18em] text-gray-400" htmlFor="quantity-input">
                      Ajuste personalizado
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        className="h-10 w-10 rounded bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                        type="button"
                        onClick={() => handleSetQuantity(quantity - 1)}
                        disabled={quantity <= MIN_QUANTITY}
                      >
                        -
                      </button>
                      <input
                        id="quantity-input"
                        className="h-10 w-24 rounded border border-white/15 bg-luxury-card text-center text-white font-bold outline-none focus:border-gold"
                        min={MIN_QUANTITY}
                        max={Math.min(MAX_QUANTITY, availableNumbers.length)}
                        type="number"
                        value={quantity}
                        onChange={(event) => handleSetQuantity(Number(event.target.value || MIN_QUANTITY))}
                      />
                      <button
                        className="h-10 w-10 rounded bg-white/5 text-white hover:bg-white/10 disabled:opacity-40"
                        type="button"
                        onClick={() => handleSetQuantity(quantity + 1)}
                        disabled={quantity >= Math.min(MAX_QUANTITY, availableNumbers.length)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-white/10 bg-luxury-card/70 p-6">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">2. Seleção de números</p>
                  <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <h2 className="text-xl font-bold text-white">Escolha modo manual ou automático</h2>
                    <div className="inline-flex rounded-lg border border-white/10 bg-luxury-bg p-1">
                      <button
                        className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors ${
                          selectionMode === 'automatico'
                            ? 'bg-gold text-black'
                            : 'text-gray-400 hover:text-white'
                        }`}
                        type="button"
                        onClick={() => setSelectionMode('automatico')}
                      >
                        Automático
                      </button>
                      <button
                        className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-colors ${
                          selectionMode === 'manual' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
                        }`}
                        type="button"
                        onClick={() => setSelectionMode('manual')}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3 text-[11px] uppercase tracking-widest">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-400/30 px-3 py-1 text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" /> Disponível
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-400/30 px-3 py-1 text-amber-200">
                      <span className="h-2 w-2 rounded-full bg-amber-300" /> Reservado
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 border border-rose-400/30 px-3 py-1 text-rose-200">
                      <span className="h-2 w-2 rounded-full bg-rose-300" /> Pago
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-gold/10 border border-gold/30 px-3 py-1 text-gold">
                      <span className="h-2 w-2 rounded-full bg-gold" /> Selecionado
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {NUMBER_POOL.map((slot) => {
                      const isSelected = selectedNumbers.includes(slot.number)
                      const isBlocked = slot.status !== 'disponivel' || (selectionMode === 'manual' && !isSelected && selectedCount >= quantity)

                      const slotStyle =
                        slot.status === 'pago'
                          ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                          : slot.status === 'reservado'
                            ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                            : 'border-white/10 bg-luxury-bg text-white hover:border-gold/40'

                      return (
                        <button
                          key={slot.number}
                          className={`h-11 rounded border text-xs font-bold tracking-wide transition-all ${
                            isSelected ? 'border-gold bg-gold/20 text-gold shadow-glow-gold' : slotStyle
                          } ${isBlocked ? 'cursor-not-allowed opacity-65' : ''}`}
                          type="button"
                          onClick={() => handleToggleNumber(slot)}
                          disabled={selectionMode !== 'manual' || isBlocked}
                        >
                          {slot.number}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-luxury-bg p-4 text-sm text-gray-300">
                    {selectionMode === 'automatico' ? (
                      <p>
                        Seleção automática ativa: o sistema escolheu <span className="font-bold text-gold">{selectedCount}</span>{' '}
                        números disponíveis para você.
                      </p>
                    ) : (
                      <p>
                        Modo manual ativo: escolha até <span className="font-bold text-gold">{quantity}</span> números
                        disponíveis.
                      </p>
                    )}
                  </div>
                </article>
              </div>

              <aside className="xl:col-span-4">
                <div className="sticky top-24 rounded-2xl border border-gold/25 bg-luxury-card p-6 shadow-2xl">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-gold">3. Carrinho</p>
                  <h2 className="mt-3 text-xl font-bold text-white">Resumo da compra</h2>

                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between text-gray-300">
                      <span>Quantidade selecionada</span>
                      <span className="font-bold text-white">{selectedCount}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Preço por cota</span>
                      <span className="font-bold text-white">{formatCurrency(UNIT_PRICE)}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Subtotal</span>
                      <span className="font-bold text-white">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Desconto ({appliedCoupon ?? 'sem cupom'})</span>
                      <span className="font-bold text-emerald-300">- {formatCurrency(discountAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border border-white/10 bg-luxury-bg p-4">
                    <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor="coupon-code">
                      Cupom de desconto
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        id="coupon-code"
                        className="h-10 flex-1 rounded border border-white/15 bg-luxury-card px-3 text-sm text-white outline-none focus:border-gold"
                        type="text"
                        placeholder="Ex: PIX10"
                        value={couponCode}
                        onChange={(event) => setCouponCode(event.target.value)}
                      />
                      <button
                        className="h-10 rounded bg-gold px-4 text-xs font-black uppercase tracking-widest text-black hover:bg-gold-hover"
                        type="button"
                        onClick={handleApplyCoupon}
                      >
                        Aplicar
                      </button>
                    </div>
                    <p className={`mt-2 text-xs ${couponFeedback?.includes('sucesso') ? 'text-emerald-300' : 'text-gray-400'}`}>
                      {couponFeedback ?? 'Cupons de teste: PIX10 e COMBO20'}
                    </p>
                  </div>

                  <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.18em] text-gray-500">Valor total</span>
                      <span className="text-2xl font-black text-gold">{formatCurrency(totalAmount)}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      Compra mínima de {MIN_QUANTITY} cotas. Números confirmados após pagamento aprovado.
                    </p>
                  </div>

                  {reservationSeconds !== null ? (
                    <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-500/10 p-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200">Reserva ativa</p>
                      <p className="mt-2 text-xl font-black text-white">{formatTimer(reservationSeconds)}</p>
                      <p className="mt-1 text-xs text-amber-100/80">
                        Seus números ficam bloqueados por tempo limitado até finalizar o PIX.
                      </p>
                    </div>
                  ) : null}

                  {hasExpiredReservation ? (
                    <div className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 p-3 text-xs text-red-100">
                      Sua reserva expirou. Reserve novamente para garantir os números.
                    </div>
                  ) : null}

                  <button
                    className="mt-5 w-full h-12 rounded-xl bg-green-500 px-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
                    type="button"
                    disabled={!canProceed}
                    onClick={handleProceed}
                  >
                    {reservationSeconds === null ? 'Reservar por 10 min' : 'Ir para pagamento PIX'}
                  </button>

                  <p className="mt-3 text-[11px] text-gray-500">
                    Ao continuar, você concorda com o regulamento e com as regras de sorteio auditável.
                  </p>

                  <div className="mt-6 border-t border-white/10 pt-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Números selecionados</p>
                    <p className="mt-2 text-sm text-gray-300 break-all">
                      {selectedNumbers.slice(0, 20).join(', ') || 'Nenhum número selecionado.'}
                      {selectedNumbers.length > 20 ? ` ... +${selectedNumbers.length - 20}` : ''}
                    </p>
                  </div>

                  <Link
                    className="mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold hover:text-gold-light"
                    to="/"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    Voltar para home
                  </Link>
                </div>
              </aside>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
