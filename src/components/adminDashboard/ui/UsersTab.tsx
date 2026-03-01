import { useEffect, useState } from 'react'
import { formatCurrency, formatInteger } from '../utils/formatters'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { formatCpf } from '../../../utils/cpf'
import avatarDefault from '../../../assets/avatar-default.svg'
import { CustomSelect } from '../../ui/CustomSelect'

function formatDateTime(value: number | null) {
  if (!value || !Number.isFinite(value)) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatPhone(value: string | null) {
  if (!value) {
    return '-'
  }

  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }

  return value
}

function formatRole(value: string) {
  if (value === 'admin') {
    return 'Admin'
  }

  if (value === 'user') {
    return 'Usuário'
  }

  return value
}

function normalizeOrderStatus(status: string) {
  if (status === 'paid') return 'Pago'
  if (status === 'pending') return 'Pendente'
  if (status === 'failed') return 'Falhou'
  return status || '-'
}

type AvatarImageProps = {
  photoURL: string | null
  alt: string
  className: string
}

function AvatarImage({ photoURL, alt, className }: AvatarImageProps) {
  const [src, setSrc] = useState(photoURL || avatarDefault)

  useEffect(() => {
    setSrc(photoURL || avatarDefault)
  }, [photoURL])

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (src !== avatarDefault) {
          setSrc(avatarDefault)
        }
      }}
    />
  )
}

export default function UsersTab() {
  const {
    searchTerm,
    setSearchTerm,
    isSearching,
    searchError,
    results,
    isModalOpen,
    isLoadingDetails,
    detailsError,
    details,
    roleValue,
    setRoleValue,
    isSavingRole,
    openUserDetails,
    closeUserDetails,
    saveRole,
  } = useAdminUsers()

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-luxury-card p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-pink">Gestão de usuários</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white">Usuários</h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Busca otimizada por prefixo em campos indexados (email, CPF, número e nome) com limite controlado para reduzir leituras.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-neon-pink/30 bg-black/25 p-4">
          <label htmlFor="admin-users-search" className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-pink/90">
            Buscar por email, cpf, número ou nome
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-luxury-bg px-3">
            <span className="material-symbols-outlined text-base text-neon-pink/90">search</span>
            <input
              id="admin-users-search"
              className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
              type="text"
              placeholder="Ex: joao, 12345678901, +55 62..., email@dominio.com"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {isSearching ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neon-pink border-t-transparent" />
            ) : null}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Digite pelo menos 2 caracteres para buscar.
          </p>
        </div>
      </section>

      {searchError ? (
        <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          Falha ao buscar usuários: {searchError}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-luxury-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-white">Resultados</h3>
          <span className="text-xs uppercase tracking-[0.16em] text-gray-500">
            {formatInteger(results.length)} encontrado(s)
          </span>
        </div>

        {results.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-sm text-gray-400">
            {searchTerm.trim().length < 2
              ? 'Digite um termo para iniciar a busca.'
              : 'Nenhum usuário encontrado para este termo.'}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {results.map((user) => (
              <button
                key={user.uid}
                className="group w-full rounded-xl border border-white/10 bg-black/20 p-4 text-left transition-all hover:border-neon-pink/30 hover:bg-black/35"
                type="button"
                onClick={() => void openUserDetails(user.uid)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10">
                      <AvatarImage photoURL={user.photoURL} alt={user.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-white">{user.name}</p>
                      <p className="truncate text-xs text-gray-400">{user.email || 'Sem email'}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-neon-pink/80">
                        Match: {user.matchedFields.join(', ') || '-'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:w-[280px]">
                    <div className="rounded-lg border border-white/10 bg-luxury-bg px-2 py-1.5 text-gray-300">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-gray-500">CPF</span>
                      <p className="mt-0.5 font-semibold text-white">{user.cpf ? formatCpf(user.cpf) : '-'}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-luxury-bg px-2 py-1.5 text-gray-300">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Papel</span>
                      <p className="mt-0.5 font-semibold text-white">{formatRole(user.role)}</p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes do usuário"
          onClick={closeUserDetails}
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-luxury-bg shadow-[0_26px_60px_rgba(0,0,0,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-neon-pink">Detalhes do usuário</p>
                <h3 className="mt-1 font-display text-2xl font-bold text-white">Painel de perfil</h3>
              </div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-gray-300 hover:text-white"
                type="button"
                onClick={closeUserDetails}
                aria-label="Fechar modal"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="max-h-[calc(92vh-78px)] overflow-y-auto px-5 py-5">
              {isLoadingDetails ? (
                <div className="flex min-h-[240px] items-center justify-center">
                  <div className="h-9 w-9 animate-spin rounded-full border-4 border-neon-pink border-t-transparent" />
                </div>
              ) : null}

              {!isLoadingDetails && detailsError ? (
                <div className="rounded-xl border border-rose-400/35 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {detailsError}
                </div>
              ) : null}

              {!isLoadingDetails && !detailsError && details ? (
                <div className="space-y-5">
                  <section className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                    <article className="rounded-xl border border-white/10 bg-luxury-card p-4 lg:col-span-4">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neon-pink/35 bg-black/35">
                          <AvatarImage
                            photoURL={details.user.photoURL}
                            alt={details.user.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-white">{details.user.name}</p>
                          <p className="text-sm text-gray-400">{details.user.email || 'Sem email'}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1.5 text-sm text-gray-300">
                        <p>CPF: <span className="font-semibold text-white">{details.user.cpf ? formatCpf(details.user.cpf) : '-'}</span></p>
                        <p>Número: <span className="font-semibold text-white">{formatPhone(details.user.phone)}</span></p>
                        <p>UID: <span className="font-mono text-xs text-gray-400">{details.user.uid}</span></p>
                        <p>Último login: <span className="font-semibold text-white">{formatDateTime(details.user.lastLoginAtMs)}</span></p>
                      </div>
                    </article>

                    <article className="rounded-xl border border-white/10 bg-luxury-card p-4 lg:col-span-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-neon-pink">Papel e permissões</p>
                      <div className="mt-3 flex flex-col gap-2">
                        <label className="text-xs text-gray-400" htmlFor="admin-user-role-select">
                          Role atual
                        </label>
                        <CustomSelect
                          id="admin-user-role-select"
                          value={roleValue}
                          onChange={(value) => setRoleValue(value === 'admin' ? 'admin' : 'user')}
                          options={details.availableRoles.map((role) => ({
                            value: role,
                            label: formatRole(role),
                          }))}
                          disabled={isSavingRole}
                          className="mt-0"
                        />
                        <button
                          className="mt-2 h-10 rounded-lg bg-neon-pink px-4 text-xs font-black uppercase tracking-[0.15em] text-black hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={() => void saveRole()}
                          disabled={isSavingRole || roleValue === details.user.role}
                        >
                          {isSavingRole ? 'Salvando...' : 'Atualizar papel'}
                        </button>
                      </div>
                    </article>

                    <article className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-luxury-card p-4 lg:col-span-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Pedidos</p>
                        <p className="mt-1 text-xl font-black text-white">{formatInteger(details.stats.totalOrders)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Pagos</p>
                        <p className="mt-1 text-xl font-black text-emerald-300">{formatInteger(details.stats.paidOrders)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Números comprados</p>
                        <p className="mt-1 text-xl font-black text-neon-pink">{formatInteger(details.stats.totalPurchasedNumbers)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Prêmios</p>
                        <p className="mt-1 text-xl font-black text-white">{formatInteger(details.stats.totalWins)}</p>
                      </div>
                    </article>
                  </section>

                  <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <article className="rounded-xl border border-white/10 bg-luxury-card p-4 xl:col-span-6">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-neon-pink">Pedidos realizados</p>
                      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                        {details.orders.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhum pedido encontrado.</p>
                        ) : details.orders.map((order) => (
                          <div key={order.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-xs text-gray-300">{order.id}</p>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-gray-300">
                                {normalizeOrderStatus(order.status)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-white">
                              {order.amount !== null ? formatCurrency(order.amount) : '-'}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {order.numbers.length} números | {formatDateTime(order.createdAtMs)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="rounded-xl border border-white/10 bg-luxury-card p-4 xl:col-span-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-neon-pink">Números comprados</p>
                      <div className="mt-3 max-h-72 overflow-y-auto pr-1">
                        {details.purchasedNumbers.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhum número pago.</p>
                        ) : (
                          <p className="break-all text-sm text-gray-200">
                            {details.purchasedNumbers.join(', ')}
                          </p>
                        )}
                      </div>
                    </article>

                    <article className="rounded-xl border border-white/10 bg-luxury-card p-4 xl:col-span-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-neon-pink">Prêmios ganhos</p>
                      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                        {details.wins.length === 0 ? (
                          <p className="text-sm text-gray-500">Nenhuma premiação encontrada.</p>
                        ) : details.wins.map((win) => (
                          <div key={`${win.drawType}-${win.drawId}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-neon-pink/85">
                              {win.drawType === 'main_raffle' ? 'Sorteio principal' : 'Top compradores'}
                            </p>
                            <p className="mt-1 text-sm font-bold text-white">{win.drawPrize}</p>
                            <p className="mt-1 text-xs text-gray-400">{win.winningLabel}</p>
                            <p className="mt-1 text-[11px] text-gray-500">{win.drawDate}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
