export type SelectionMode = 'automatico' | 'manual'
export type NumberStatus = 'disponivel' | 'reservado' | 'pago'

export type NumberSlot = {
  number: number
  status: NumberStatus
}

export const UNIT_PRICE = 0.99
export const MIN_QUANTITY = 10
export const MAX_QUANTITY = 300
export const RESERVATION_SECONDS = 10 * 60
export const PURCHASE_PACKS = [10, 50, 100, 250]

export function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function pickRandomNumbers(pool: number[], quantity: number) {
  const numbers = [...pool]

  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[numbers[index], numbers[randomIndex]] = [numbers[randomIndex], numbers[index]]
  }

  return numbers.slice(0, quantity).sort((a, b) => a - b)
}

export function getSafeQuantity(value: number, maxAvailable: number) {
  const nextValue = Number.isFinite(value) ? value : MIN_QUANTITY
  return Math.max(MIN_QUANTITY, Math.min(nextValue, MAX_QUANTITY, maxAvailable))
}

