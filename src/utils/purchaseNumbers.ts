import { MIN_QUANTITY } from '../const/purchaseNumbers'

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
  const safeMax = Number.isFinite(maxAvailable) && maxAvailable > 0
    ? Math.floor(maxAvailable)
    : Number.MAX_SAFE_INTEGER
  const safeMin = Math.max(1, Math.min(minQuantity, safeMax))
  const nextValue = Number.isFinite(value) ? Math.floor(value) : safeMin
  return Math.max(safeMin, Math.min(nextValue, safeMax))
}
