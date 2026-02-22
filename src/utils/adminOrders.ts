import type { OrderDocument, OrderStatus, TimestampLike } from '../types/order'

export type AdminOrderStatus = 'pago' | 'pendente' | 'cancelado'

export type AdminOrderRow = {
  id: string
  buyer: string
  quantity: number
  amount: number
  status: AdminOrderStatus
  createdAt: string
}

function normalizeOrderDate(value: TimestampLike): Date | null {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      const date = value.toDate()
      return Number.isNaN(date.getTime()) ? null : date
    }

    if ('seconds' in value && typeof value.seconds === 'number') {
      const nanoseconds = 'nanoseconds' in value && typeof value.nanoseconds === 'number' ? value.nanoseconds : 0
      const milliseconds = value.seconds * 1000 + nanoseconds / 1_000_000
      const date = new Date(milliseconds)
      return Number.isNaN(date.getTime()) ? null : date
    }
  }

  return null
}

function formatDateForAdmin(value: TimestampLike): string {
  const date = normalizeOrderDate(value)
  if (!date) {
    return '--'
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function getBuyerLabel(order: OrderDocument): string {
  if (order.payerName && order.payerName.trim()) {
    return order.payerName.trim()
  }

  const uidPreview = order.userId.slice(0, 8)
  return `Usuario ${uidPreview}`
}

function getOrderQuantity(order: OrderDocument): number {
  if (Array.isArray(order.reservedNumbers)) {
    return order.reservedNumbers.length
  }

  return 0
}

export function mapOrderStatusToAdmin(status: OrderStatus): AdminOrderStatus {
  if (status === 'paid') {
    return 'pago'
  }

  if (status === 'pending') {
    return 'pendente'
  }

  return 'cancelado'
}

export function mapOrderDocToAdminRow(order: OrderDocument): AdminOrderRow {
  return {
    id: order.externalId,
    buyer: getBuyerLabel(order),
    quantity: getOrderQuantity(order),
    amount: order.amount,
    status: mapOrderStatusToAdmin(order.status),
    createdAt: formatDateForAdmin(order.createdAt),
  }
}
