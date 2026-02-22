export type OrderStatus = 'pending' | 'paid' | 'failed'
export type OrderType = 'deposit' | 'withdraw'

export type TimestampLike =
  | Date
  | string
  | number
  | { seconds: number; nanoseconds?: number }
  | { toDate: () => Date }
  | null
  | undefined

export type OrderDocument = {
  externalId: string
  userId: string
  type: OrderType
  amount: number
  status: OrderStatus
  reservedNumbers?: number[]
  reservationExpiresAt?: TimestampLike
  pixCopyPaste?: string | null
  pixQrCode?: string | null
  payerName?: string | null
  clientReferenceId?: string
  attempt?: number
  failureReason?: string
  createdAt?: TimestampLike
  updatedAt?: TimestampLike
  webhookReceivedAt?: TimestampLike
}
