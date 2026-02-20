import { FirebaseError } from 'firebase/app'
import type { User } from 'firebase/auth'
import type { MockOrder, MockTicket, ReceiptFilter, TicketFilter } from '../types/userDashboard'

export function getAvatarUploadErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'avatar-upload-timeout') {
    return 'Upload indisponivel no momento. O servico demorou para responder.'
  }

  if (!(error instanceof FirebaseError)) {
    return 'Nao foi possivel alterar a foto agora. Tente novamente mais tarde.'
  }

  if (error.code === 'storage/unauthorized') {
    return 'Sem permissao para enviar foto. Verifique as regras do Firebase Storage.'
  }

  if (error.code === 'storage/quota-exceeded') {
    return 'Upload indisponivel: cota/plano do Firebase Storage excedido. Ative o Blaze para continuar.'
  }

  if (error.code === 'storage/bucket-not-found' || error.code === 'storage/project-not-found') {
    return 'Upload indisponivel: bucket do Firebase Storage nao esta provisionado neste projeto.'
  }

  const serverResponse =
    typeof (error as FirebaseError & { serverResponse?: unknown }).serverResponse === 'string'
      ? (error as FirebaseError & { serverResponse?: string }).serverResponse?.toLowerCase() || ''
      : ''
  const combined = `${error.code} ${error.message}`.toLowerCase()
  const looksLikeStorageProvisioningIssue =
    serverResponse.includes('cors') ||
    serverResponse.includes('preflight') ||
    serverResponse.includes('billing') ||
    serverResponse.includes('blaze') ||
    combined.includes('cors') ||
    combined.includes('preflight')

  if (looksLikeStorageProvisioningIssue) {
    return 'Upload indisponivel neste projeto. Ative o plano Blaze e provisione/configure o Firebase Storage.'
  }

  return 'Nao foi possivel alterar a foto agora. Tente novamente mais tarde.'
}

export function getDisplayName(user: User) {
  return user.displayName || user.email?.split('@')[0] || 'Usuario'
}

export function getUserInitials(displayName: string) {
  return displayName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function filterTickets(tickets: MockTicket[], ticketFilter: TicketFilter, ticketSearch: string) {
  return tickets.filter((ticket) => {
    const matchesFilter =
      ticketFilter === 'Todos' ||
      (ticketFilter === 'Pagos' && ticket.status === 'pago') ||
      (ticketFilter === 'Aguardando' && ticket.status === 'aguardando') ||
      (ticketFilter === 'Cancelados' && ticket.status === 'cancelado')

    const matchesSearch =
      ticketSearch === '' ||
      ticket.number.includes(ticketSearch) ||
      ticket.orderId.toLowerCase().includes(ticketSearch.toLowerCase())

    return matchesFilter && matchesSearch
  })
}

export function filterOrders(orders: MockOrder[], receiptFilter: ReceiptFilter, receiptSearch: string) {
  return orders.filter((order) => {
    const matchesFilter =
      receiptFilter === 'Todos' ||
      (receiptFilter === 'Aprovados' && order.status === 'pago') ||
      (receiptFilter === 'Pendentes' && order.status === 'aguardando') ||
      (receiptFilter === 'Cancelados' && order.status === 'cancelado')

    const matchesSearch = receiptSearch === '' || order.id.toLowerCase().includes(receiptSearch.toLowerCase())

    return matchesFilter && matchesSearch
  })
}

export function getReceiptFilterDot(filter: ReceiptFilter) {
  if (filter === 'Aprovados') {
    return 'bg-emerald-500'
  }

  if (filter === 'Pendentes') {
    return 'bg-amber-500'
  }

  if (filter === 'Cancelados') {
    return 'bg-red-500'
  }

  return null
}
