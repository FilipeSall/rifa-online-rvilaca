import { signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/home/Header'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'

type TicketStatus = 'pago' | 'aguardando' | 'cancelado'

type MockTicket = {
  number: string
  orderId: string
  date: string
  status: TicketStatus
}

// Um número participa de todos os prêmios simultaneamente:
// 1º BMW R 1200 GS · 2º Honda CG Start 160 · 20x PIX R$ 1.000 (números premiados ocultos)
const MOCK_TICKETS: MockTicket[] = [
  { number: '054231', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '089142', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '1345820', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '2891034', orderId: 'PED-0051', date: '18 Fev 2026, 09:15', status: 'aguardando' },
  { number: '0023445', orderId: 'PED-0029', date: '10 Jan 2026, 10:00', status: 'cancelado' },
]

const STATUS_FILTERS = ['Todos', 'Pagos', 'Aguardando', 'Cancelados']

const NAV_ITEMS = [
  { icon: 'confirmation_number', label: 'Meus Números', active: true },
  { icon: 'receipt_long', label: 'Comprovantes', active: false },
  { icon: 'emoji_events', label: 'Resultados', active: false },
  { icon: 'history', label: 'Histórico de Compras', active: false },
]

function StatusBadge({ status }: { status: TicketStatus }) {
  if (status === 'pago') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Pago
      </span>
    )
  }
  if (status === 'aguardando') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 border border-amber-500/20">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        Aguardando
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 border border-red-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Cancelado
    </span>
  )
}

export default function UserDashboardPage() {
  const { user, isLoggedIn, isAuthReady } = useAuthStore()
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isAuthReady && !isLoggedIn) {
      navigate('/')
    }
  }, [isAuthReady, isLoggedIn, navigate])

  const handleSignOut = async () => {
    await signOut(auth)
    navigate('/')
  }

  const filteredTickets = MOCK_TICKETS.filter((t) => {
    const matchesFilter =
      activeFilter === 'Todos' ||
      (activeFilter === 'Pagos' && t.status === 'pago') ||
      (activeFilter === 'Aguardando' && t.status === 'aguardando') ||
      (activeFilter === 'Cancelados' && t.status === 'cancelado')
    const matchesSearch =
      search === '' ||
      t.number.includes(search) ||
      t.orderId.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const paidCount = MOCK_TICKETS.filter((t) => t.status === 'pago').length

  if (!isAuthReady || !user) {
    return (
      <>
        <Header />
        <div className="flex min-h-[60vh] items-center justify-center bg-luxury-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold border-t-transparent" />
        </div>
      </>
    )
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Usuário'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen bg-luxury-bg font-display text-white">
      <Header />

      <div className="flex">
        {/* Sidebar — desktop only */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-luxury-border bg-luxury-card sticky top-20 min-h-[calc(100vh-80px)]">
          <div className="flex flex-col gap-1 p-5">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Menu Principal
            </p>
            {NAV_ITEMS.map(({ icon, label, active }) => (
              <button
                key={label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'bg-gold/10 border border-gold/20 text-gold'
                    : 'text-text-muted hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-luxury-border p-5">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-400 transition-colors hover:bg-red-500/10"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="text-sm font-medium">Sair da Conta</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-4xl space-y-6">

            {/* Profile card */}
            <div className="relative overflow-hidden rounded-2xl border border-luxury-border bg-luxury-card p-6 md:p-8">
              {/* Decorative glow */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/5 blur-3xl" />

              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col items-center gap-5 text-center md:flex-row md:items-start md:text-left">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="h-20 w-20 rounded-full border-2 border-gold/30 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold/30 bg-gold/10 text-2xl font-bold text-gold">
                        {initials}
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-luxury-card bg-gold text-black">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                    </div>
                  </div>

                  {/* User info */}
                  <div className="space-y-1.5">
                    <h1 className="text-xl font-bold text-white">{displayName}</h1>
                    <div className="flex flex-col gap-1 text-sm text-text-muted">
                      {user.email && (
                        <div className="flex items-center justify-center gap-2 md:justify-start">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>mail</span>
                          <span>{user.email}</span>
                        </div>
                      )}
                      {user.phoneNumber && (
                        <div className="flex items-center justify-center gap-2 md:justify-start">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>call</span>
                          <span>{user.phoneNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/comprar"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-hover"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                    Comprar Números
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-luxury-border px-5 py-2.5 text-sm font-medium text-text-muted transition-colors hover:border-red-500/50 hover:text-red-400 lg:hidden"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
                    Sair
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
                <div className="rounded-lg bg-gold/10 p-2.5 text-gold">
                  <span className="material-symbols-outlined">confirmation_number</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Números Ativos</p>
                  <p className="text-2xl font-bold text-white">{paidCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400">
                  <span className="material-symbols-outlined">emoji_events</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Sorteios Ganhos</p>
                  <p className="text-2xl font-bold text-white">0</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
                <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
                  <span className="material-symbols-outlined">calendar_month</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Próximo Sorteio</p>
                  <p className="text-lg font-bold text-white">A definir</p>
                </div>
              </div>
            </div>

            {/* Tickets section */}
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Meus Números</h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  Gerencie seus números da sorte e confira o status dos seus bilhetes.
                </p>
              </div>

              {/* Filters + Search */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                  {STATUS_FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                        activeFilter === filter
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
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
                  </div>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="block w-full rounded-lg border border-luxury-border bg-luxury-card py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                    placeholder="Buscar por número ou pedido..."
                    type="text"
                  />
                </div>
              </div>

              {/* Prize reminder banner */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-xs text-text-muted">
                <span className="material-symbols-outlined text-gold" style={{ fontSize: 16 }}>info</span>
                <span>Cada número concorre a <span className="font-semibold text-white">todos os prêmios</span> simultaneamente:</span>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 font-medium text-gold">🏆 BMW R 1200 GS</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-medium text-white">🏍 Honda CG Start 160</span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-400">💸 20× PIX R$ 1.000</span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-hidden rounded-xl border border-luxury-border bg-luxury-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-luxury-border bg-white/5 text-[10px] uppercase tracking-widest text-text-muted">
                      <tr>
                        <th className="px-5 py-3.5" scope="col">Número</th>
                        <th className="hidden px-5 py-3.5 sm:table-cell" scope="col">Pedido</th>
                        <th className="hidden px-5 py-3.5 sm:table-cell" scope="col">Data</th>
                        <th className="px-5 py-3.5" scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-luxury-border">
                      {filteredTickets.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-10 text-center text-text-muted">
                            Nenhum número encontrado.
                          </td>
                        </tr>
                      ) : (
                        filteredTickets.map((ticket) => (
                          <tr
                            key={ticket.number}
                            className={`transition-colors hover:bg-white/5 ${
                              ticket.status === 'cancelado' ? 'opacity-50' : ''
                            }`}
                          >
                            <td className="px-5 py-4">
                              <div
                                className={`inline-flex h-10 w-24 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                                  ticket.status === 'pago'
                                    ? 'bg-gold/10 text-gold'
                                    : 'bg-white/5 text-text-muted'
                                }`}
                              >
                                {ticket.number}
                              </div>
                            </td>
                            <td className="hidden px-5 py-4 text-xs text-text-muted sm:table-cell">
                              {ticket.orderId}
                            </td>
                            <td className="hidden px-5 py-4 text-xs text-text-muted sm:table-cell">
                              {ticket.date}
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={ticket.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between border-t border-luxury-border bg-white/5 px-5 py-3">
                  <p className="text-xs text-text-muted">
                    Mostrando{' '}
                    <span className="font-medium text-white">{filteredTickets.length}</span> de{' '}
                    <span className="font-medium text-white">{MOCK_TICKETS.length}</span> resultados
                  </p>
                  <p className="text-[10px] italic text-text-muted">Dados demonstrativos</p>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
