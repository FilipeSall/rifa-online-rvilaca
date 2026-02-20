import type { TicketStatus } from '../../types/userDashboard'

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  if (status === 'pago') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Pago
      </span>
    )
  }

  if (status === 'aguardando') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Aguardando
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Cancelado
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: TicketStatus }) {
  if (status === 'pago') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aprovado
      </span>
    )
  }

  if (status === 'aguardando') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Pendente
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Expirado
    </span>
  )
}
