import { useEffect, useMemo, useState } from 'react'
import { TICKET_FILTERS } from '../../const/userDashboard'
import type { TicketFilter, UserTicket } from '../../types/userDashboard'
import { TicketStatusBadge } from './StatusBadges'
import { formatPrizeLabelWithQuantity } from '../../utils/campaignPrizes'

const TICKETS_PER_PAGE = 12

type MyNumbersSectionProps = {
  ticketFilter: TicketFilter
  ticketSearch: string
  filteredTickets: UserTicket[]
  totalTickets: number
  isLoadingTickets: boolean
  isLoadingMoreTickets: boolean
  hasMoreTickets: boolean
  mainPrize: string
  secondPrize: string
  bonusPrize: string
  bonusPrizeQuantity: number
  hasWins: boolean
  latestWinDate: string | null
  latestWinPrize: string | null
  onTicketFilterChange: (filter: TicketFilter) => void
  onTicketSearchChange: (value: string) => void
  onLoadMoreTickets: () => void
  onCheckIfWon: () => void
}

export default function MyNumbersSection({
  ticketFilter,
  ticketSearch,
  filteredTickets,
  totalTickets,
  isLoadingTickets,
  isLoadingMoreTickets,
  hasMoreTickets,
  mainPrize,
  secondPrize,
  bonusPrize,
  bonusPrizeQuantity,
  hasWins,
  latestWinDate,
  latestWinPrize,
  onTicketFilterChange,
  onTicketSearchChange,
  onLoadMoreTickets,
  onCheckIfWon,
}: MyNumbersSectionProps) {
  const [activePage, setActivePage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / TICKETS_PER_PAGE))
  const pagedTickets = useMemo(() => {
    const start = (activePage - 1) * TICKETS_PER_PAGE
    return filteredTickets.slice(start, start + TICKETS_PER_PAGE)
  }, [activePage, filteredTickets])
  const isLastPage = activePage >= totalPages
  const canLoadMoreRemote = hasMoreTickets && isLastPage

  useEffect(() => {
    setActivePage(1)
  }, [ticketFilter, ticketSearch])

  useEffect(() => {
    if (activePage > totalPages) {
      setActivePage(totalPages)
    }
  }, [activePage, totalPages])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Meus Numeros</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Gerencie seus numeros da sorte e confira o status dos seus bilhetes.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckIfWon}
          className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-xs font-black uppercase tracking-[0.12em] transition-colors ${
            hasWins
              ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
              : 'border-neon-pink/35 bg-neon-pink/10 text-neon-pink hover:bg-neon-pink/20'
          }`}
        >
          Ver se fui sorteado
        </button>
      </div>

      {hasWins ? (
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          Voce possui premiacao registrada{latestWinPrize ? `: ${latestWinPrize}` : ''}{latestWinDate ? ` (${latestWinDate})` : ''}.
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-text-muted">
          Nenhuma premiacao registrada ate o momento. Use o botao acima para abrir a aba de conferencia.
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          {TICKET_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => onTicketFilterChange(filter)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                ticketFilter === filter
                  ? 'bg-neon-pink text-black'
                  : 'border border-luxury-border bg-luxury-card text-text-muted hover:border-neon-pink/40 hover:text-neon-pink'
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
            className="block w-full rounded-lg border border-luxury-border bg-luxury-card py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-neon-pink/50 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
            placeholder="Buscar por numero ou pedido..."
            type="text"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neon-pink/20 bg-neon-pink/5 px-4 py-3 text-xs text-text-muted">
        <span className="material-symbols-outlined text-neon-pink" style={{ fontSize: 16 }}>
          info
        </span>
        <span>
          Cada numero concorre a <span className="font-semibold text-white">todos os premios</span>:
        </span>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-neon-pink/30 bg-neon-pink/10 px-2.5 py-0.5 font-medium text-neon-pink">
            🏆 {mainPrize}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-medium text-white">
            🏍 {secondPrize}
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-400">
            💸 {formatPrizeLabelWithQuantity(bonusPrize, bonusPrizeQuantity)}
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
              {isLoadingTickets ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`ticket-loading-${index}`} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-10 w-24 rounded-lg bg-white/10" />
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <div className="h-4 w-56 rounded bg-white/10" />
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <div className="h-4 w-28 rounded bg-white/10" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-7 w-16 rounded-full bg-white/10" />
                    </td>
                  </tr>
                ))
              ) : pagedTickets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-text-muted">
                    Nenhum numero encontrado.
                  </td>
                </tr>
              ) : (
                pagedTickets.map((ticket) => (
                  <tr
                    key={`${ticket.orderId}-${ticket.number}`}
                    className={`transition-colors hover:bg-white/5 ${ticket.status === 'cancelado' ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <div
                        className={`inline-flex h-10 w-24 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                          ticket.status === 'pago' ? 'bg-neon-pink/10 text-neon-pink' : 'bg-white/5 text-text-muted'
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-luxury-border bg-white/5 px-5 py-3">
          <p className="text-xs text-text-muted">
            Mostrando <span className="font-medium text-white">{pagedTickets.length}</span> de{' '}
            <span className="font-medium text-white">{filteredTickets.length}</span> resultados filtrados
            {' · '}carregados no total: <span className="font-medium text-white">{totalTickets}</span>
            {hasMoreTickets ? (
              <span className="text-text-muted"> (há mais para carregar)</span>
            ) : null}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePage((current) => Math.max(1, current - 1))}
              disabled={activePage <= 1}
              className="inline-flex h-8 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-[11px] font-semibold text-text-muted">
              Página {activePage} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setActivePage((current) => Math.min(totalPages, current + 1))}
              disabled={activePage >= totalPages}
              className="inline-flex h-8 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
            </button>
          </div>

          {canLoadMoreRemote ? (
            <button
              type="button"
              onClick={onLoadMoreTickets}
              disabled={isLoadingMoreTickets}
              className="inline-flex h-8 items-center justify-center rounded-md border border-neon-pink/40 bg-neon-pink/10 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-neon-pink transition-colors hover:bg-neon-pink/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingMoreTickets ? 'Carregando...' : 'Carregar mais'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
