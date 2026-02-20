import { MOCK_TICKETS, TICKET_FILTERS } from '../../const/userDashboard'
import type { MockTicket, TicketFilter } from '../../types/userDashboard'
import { TicketStatusBadge } from './StatusBadges'

type MyNumbersSectionProps = {
  ticketFilter: TicketFilter
  ticketSearch: string
  filteredTickets: MockTicket[]
  onTicketFilterChange: (filter: TicketFilter) => void
  onTicketSearchChange: (value: string) => void
}

export default function MyNumbersSection({
  ticketFilter,
  ticketSearch,
  filteredTickets,
  onTicketFilterChange,
  onTicketSearchChange,
}: MyNumbersSectionProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Meus Numeros</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Gerencie seus numeros da sorte e confira o status dos seus bilhetes.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          {TICKET_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => onTicketFilterChange(filter)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                ticketFilter === filter
                  ? 'bg-gold text-black'
                  : 'border border-luxury-border bg-luxury-card text-text-muted hover:border-gold/40 hover:text-gold'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              search
            </span>
          </div>
          <input
            value={ticketSearch}
            onChange={(event) => onTicketSearchChange(event.target.value)}
            className="block w-full rounded-lg border border-luxury-border bg-luxury-card py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
            placeholder="Buscar por numero ou pedido..."
            type="text"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-xs text-text-muted">
        <span className="material-symbols-outlined text-gold" style={{ fontSize: 16 }}>
          info
        </span>
        <span>
          Cada numero concorre a <span className="font-semibold text-white">todos os premios</span> simultaneamente:
        </span>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 font-medium text-gold">
            🏆 BMW R 1200 GS
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-medium text-white">
            🏍 Honda CG Start 160
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-400">
            💸 20x PIX R$ 1.000
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-luxury-border bg-luxury-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-luxury-border bg-white/5 text-[10px] uppercase tracking-widest text-text-muted">
              <tr>
                <th className="px-5 py-3.5" scope="col">
                  Numero
                </th>
                <th className="hidden px-5 py-3.5 sm:table-cell" scope="col">
                  Pedido
                </th>
                <th className="hidden px-5 py-3.5 sm:table-cell" scope="col">
                  Data
                </th>
                <th className="px-5 py-3.5" scope="col">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-luxury-border">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-text-muted">
                    Nenhum numero encontrado.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.number}
                    className={`transition-colors hover:bg-white/5 ${ticket.status === 'cancelado' ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <div
                        className={`inline-flex h-10 w-24 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                          ticket.status === 'pago' ? 'bg-gold/10 text-gold' : 'bg-white/5 text-text-muted'
                        }`}
                      >
                        {ticket.number}
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 text-xs text-text-muted sm:table-cell">{ticket.orderId}</td>
                    <td className="hidden px-5 py-4 text-xs text-text-muted sm:table-cell">{ticket.date}</td>
                    <td className="px-5 py-4">
                      <TicketStatusBadge status={ticket.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-luxury-border bg-white/5 px-5 py-3">
          <p className="text-xs text-text-muted">
            Mostrando <span className="font-medium text-white">{filteredTickets.length}</span> de{' '}
            <span className="font-medium text-white">{MOCK_TICKETS.length}</span> resultados
          </p>
          <p className="text-[10px] italic text-text-muted">Dados demonstrativos</p>
        </div>
      </div>
    </div>
  )
}
