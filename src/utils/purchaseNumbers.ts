import { MAX_QUANTITY, MIN_QUANTITY } from '../const/purchaseNumbers'

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

export function getSafeQuantity(value: number, maxAvailable: number, minQuantity = MIN_QUANTITY) {
  const nextValue = Number.isFinite(value) ? value : minQuantity
  return Math.max(minQuantity, Math.min(nextValue, MAX_QUANTITY, maxAvailable))
}
