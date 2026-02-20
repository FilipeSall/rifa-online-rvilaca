export type SelectionMode = 'automatico' | 'manual'
export type NumberStatus = 'disponivel' | 'reservado' | 'pago'

export type NumberSlot = {
  number: number
  status: NumberStatus
}

export type CouponFeedback = {
  message: string
  tone: 'success' | 'neutral'
}
