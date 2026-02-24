import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'react-toastify'
import { functions } from '../../../lib/firebase'

type CallableEnvelope<T> = T | { result?: T }

type SearchAdminUsersResponse = {
  term: string
  strategy: 'prefix-indexed-fields'
  results: AdminUserSearchItem[]
}

export type AdminUserRole = 'admin' | 'user'

export type AdminUserSearchItem = {
  uid: string
  name: string
  email: string | null
  cpf: string | null
  phone: string | null
  role: AdminUserRole
  photoURL: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
  lastLoginAtMs: number | null
  matchedFields: string[]
}

type AdminUserDetails = {
  user: {
    uid: string
    name: string
    email: string | null
    cpf: string | null
    phone: string | null
    role: AdminUserRole
    photoURL: string | null
    createdAtMs: number | null
    updatedAtMs: number | null
    lastLoginAtMs: number | null
  }
  availableRoles: AdminUserRole[]
  orders: Array<{
    id: string
    status: string
    amount: number | null
    numbers: number[]
    payerPhone: string | null
    payerCpf: string | null
    campaignId: string | null
    createdAtMs: number | null
  }>
  purchasedNumbers: number[]
  wins: Array<{
    drawType: 'top_buyers' | 'main_raffle'
    drawId: string
    drawDate: string
    drawPrize: string
    winningLabel: string
    publishedAtMs: number
  }>
  stats: {
    totalOrders: number
    paidOrders: number
    totalPurchasedNumbers: number
    totalWins: number
  }
}

type UpdateAdminUserRoleResponse = {
  uid: string
  role: AdminUserRole
}

type ClearOrderHistoryAdminResponse = {
  dryRun: boolean
  confirmPhraseRequired: string
  scannedOrders: number
  deletedOrders: number
  deletedOrderEvents: number
  deletedOrderNumbers: number
  deletedPayments: number
  deletedSalesLedger: number
  deletedNumberStates: number
  deletedNumberReservations: number
  deletedSalesMetricsDaily: number
  metricsSummaryReset: boolean
}

const CLEAR_ORDER_HISTORY_CONFIRM_PHRASE = 'LIMPAR_HISTORICO_PEDIDOS'

function unwrapCallableData<T>(value: CallableEnvelope<T>) {
  if (value && typeof value === 'object' && 'result' in value) {
    const wrapped = value as { result?: T }
    if (wrapped.result !== undefined) {
      return wrapped.result
    }
  }

  return value as T
}

function toSafeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toAdminUserRole(value: unknown): AdminUserRole {
  return toSafeString(value).trim().toLowerCase() === 'admin' ? 'admin' : 'user'
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function toNullableNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toSafeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[]
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function mapSearchResultItem(raw: unknown): AdminUserSearchItem | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const value = raw as Record<string, unknown>
  const uid = toSafeString(value.uid)
  if (!uid) {
    return null
  }

  return {
    uid,
    name: toSafeString(value.name, 'Usuario'),
    email: toNullableString(value.email),
    cpf: toNullableString(value.cpf),
    phone: toNullableString(value.phone),
    role: toAdminUserRole(value.role),
    photoURL: toNullableString(value.photoURL),
    createdAtMs: toNullableNumber(value.createdAtMs),
    updatedAtMs: toNullableNumber(value.updatedAtMs),
    lastLoginAtMs: toNullableNumber(value.lastLoginAtMs),
    matchedFields: Array.isArray(value.matchedFields)
      ? value.matchedFields.map((item) => toSafeString(item)).filter(Boolean)
      : [],
  }
}

function mapDetails(raw: unknown): AdminUserDetails | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const value = raw as Record<string, unknown>
  if (!value.user || typeof value.user !== 'object') {
    return null
  }

  const userRaw = value.user as Record<string, unknown>
  const uid = toSafeString(userRaw.uid)
  if (!uid) {
    return null
  }

  const ordersRaw = Array.isArray(value.orders) ? value.orders : []
  const winsRaw = Array.isArray(value.wins) ? value.wins : []
  const rolesRaw = Array.isArray(value.availableRoles) ? value.availableRoles : []
  const statsRaw = value.stats && typeof value.stats === 'object'
    ? value.stats as Record<string, unknown>
    : {}
  const userRole = toAdminUserRole(userRaw.role)
  const availableRoles = Array.from(
    new Set<AdminUserRole>([
      'user',
      'admin',
      userRole,
      ...rolesRaw.map((item) => toAdminUserRole(item)),
    ]),
  )

  return {
    user: {
      uid,
      name: toSafeString(userRaw.name, 'Usuario'),
      email: toNullableString(userRaw.email),
      cpf: toNullableString(userRaw.cpf),
      phone: toNullableString(userRaw.phone),
      role: userRole,
      photoURL: toNullableString(userRaw.photoURL),
      createdAtMs: toNullableNumber(userRaw.createdAtMs),
      updatedAtMs: toNullableNumber(userRaw.updatedAtMs),
      lastLoginAtMs: toNullableNumber(userRaw.lastLoginAtMs),
    },
    availableRoles,
    orders: ordersRaw
      .map((order) => {
        if (!order || typeof order !== 'object') {
          return null
        }

        const orderValue = order as Record<string, unknown>
        const id = toSafeString(orderValue.id)
        if (!id) {
          return null
        }

        return {
          id,
          status: toSafeString(orderValue.status, 'pending'),
          amount: toNullableNumber(orderValue.amount),
          numbers: toSafeNumberArray(orderValue.numbers),
          payerPhone: toNullableString(orderValue.payerPhone),
          payerCpf: toNullableString(orderValue.payerCpf),
          campaignId: toNullableString(orderValue.campaignId),
          createdAtMs: toNullableNumber(orderValue.createdAtMs),
        }
      })
      .filter((item): item is AdminUserDetails['orders'][number] => Boolean(item)),
    purchasedNumbers: toSafeNumberArray(value.purchasedNumbers),
    wins: winsRaw
      .map((win) => {
        if (!win || typeof win !== 'object') {
          return null
        }

        const winValue = win as Record<string, unknown>
        const drawId = toSafeString(winValue.drawId)
        if (!drawId) {
          return null
        }

        return {
          drawType: winValue.drawType === 'main_raffle' ? 'main_raffle' : 'top_buyers',
          drawId,
          drawDate: toSafeString(winValue.drawDate, '-'),
          drawPrize: toSafeString(winValue.drawPrize, 'Premio'),
          winningLabel: toSafeString(winValue.winningLabel, ''),
          publishedAtMs: Number(winValue.publishedAtMs) || 0,
        }
      })
      .filter((item): item is AdminUserDetails['wins'][number] => Boolean(item)),
    stats: {
      totalOrders: Number(statsRaw.totalOrders) || 0,
      paidOrders: Number(statsRaw.paidOrders) || 0,
      totalPurchasedNumbers: Number(statsRaw.totalPurchasedNumbers) || 0,
      totalWins: Number(statsRaw.totalWins) || 0,
    },
  }
}

export function useAdminUsers() {
  const searchUsersCallable = useMemo(
    () => httpsCallable<{ term: string; limit?: number }, unknown>(functions, 'searchAdminUsers'),
    [],
  )
  const getUserDetailsCallable = useMemo(
    () => httpsCallable<{ uid: string }, unknown>(functions, 'getAdminUserDetails'),
    [],
  )
  const updateRoleCallable = useMemo(
    () => httpsCallable<{ uid: string; role: AdminUserRole }, unknown>(functions, 'updateAdminUserRole'),
    [],
  )
  const clearOrderHistoryCallable = useMemo(
    () => httpsCallable<{ confirmPhrase: string; dryRun?: boolean }, unknown>(functions, 'clearOrderHistoryAdmin'),
    [],
  )

  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [results, setResults] = useState<AdminUserSearchItem[]>([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [details, setDetails] = useState<AdminUserDetails | null>(null)
  const [roleValue, setRoleValue] = useState<AdminUserRole>('user')
  const [isSavingRole, setIsSavingRole] = useState(false)
  const [isClearingOrderHistory, setIsClearingOrderHistory] = useState(false)

  useEffect(() => {
    const normalized = searchTerm.trim()
    if (normalized.length < 2) {
      setResults([])
      setSearchError(null)
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)
    setSearchError(null)

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await searchUsersCallable({ term: normalized, limit: 24 })
        if (cancelled) {
          return
        }

        const payload = unwrapCallableData(response.data as CallableEnvelope<SearchAdminUsersResponse>)
        const mapped = Array.isArray(payload.results)
          ? payload.results.map((item) => mapSearchResultItem(item)).filter((item): item is AdminUserSearchItem => Boolean(item))
          : []

        setResults(mapped)
      } catch (error) {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Nao foi possivel buscar usuarios.'
        setSearchError(message)
        setResults([])
      } finally {
        if (!cancelled) {
          setIsSearching(false)
        }
      }
    }, 360)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [searchTerm, searchUsersCallable])

  const openUserDetails = useCallback(async (uid: string) => {
    setIsModalOpen(true)
    setIsLoadingDetails(true)
    setDetailsError(null)
    setDetails(null)

    try {
      const response = await getUserDetailsCallable({ uid })
      const payload = unwrapCallableData(response.data as CallableEnvelope<AdminUserDetails>)
      const mapped = mapDetails(payload)
      if (!mapped) {
        throw new Error('Resposta invalida ao carregar detalhes do usuario.')
      }

      setDetails(mapped)
      setRoleValue(mapped.user.role)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel carregar os detalhes do usuario.'
      setDetailsError(message)
    } finally {
      setIsLoadingDetails(false)
    }
  }, [getUserDetailsCallable])

  const closeUserDetails = useCallback(() => {
    setIsModalOpen(false)
    setIsLoadingDetails(false)
    setDetailsError(null)
    setDetails(null)
    setRoleValue('user')
    setIsSavingRole(false)
  }, [])

  const saveRole = useCallback(async () => {
    if (!details || !details.user.uid) {
      return
    }

    const nextRole = roleValue
    if (nextRole === details.user.role) {
      return
    }

    setIsSavingRole(true)

    try {
      const response = await updateRoleCallable({ uid: details.user.uid, role: nextRole })
      const payload = unwrapCallableData(response.data as CallableEnvelope<UpdateAdminUserRoleResponse>)
      const normalizedRole = toAdminUserRole(payload.role)

      setDetails((current) => {
        if (!current || current.user.uid !== payload.uid) {
          return current
        }

        return {
          ...current,
          user: {
            ...current.user,
            role: normalizedRole,
          },
          availableRoles: Array.from(new Set<AdminUserRole>(['user', 'admin', ...current.availableRoles])),
        }
      })

      setResults((current) =>
        current.map((item) => (
          item.uid === payload.uid
            ? { ...item, role: normalizedRole }
            : item
        )),
      )

      toast.success('Papel do usuario atualizado com sucesso.', {
        position: 'bottom-right',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel atualizar o papel do usuario.'
      toast.error(message, {
        position: 'bottom-right',
      })
    } finally {
      setIsSavingRole(false)
    }
  }, [details, roleValue, updateRoleCallable])

  const clearOrderHistory = useCallback(async () => {
    const confirmation = window.prompt(
      `Esta acao apaga TODO o historico de pedidos do sistema.\nDigite "${CLEAR_ORDER_HISTORY_CONFIRM_PHRASE}" para confirmar.`,
    )

    if (confirmation !== CLEAR_ORDER_HISTORY_CONFIRM_PHRASE) {
      toast.info('Acao cancelada. O historico de pedidos nao foi alterado.', {
        position: 'bottom-right',
      })
      return
    }

    setIsClearingOrderHistory(true)

    try {
      const response = await clearOrderHistoryCallable({
        confirmPhrase: CLEAR_ORDER_HISTORY_CONFIRM_PHRASE,
        dryRun: false,
      })
      const payload = unwrapCallableData(response.data as CallableEnvelope<ClearOrderHistoryAdminResponse>)

      toast.success(
        `Historico removido. Pedidos: ${payload.deletedOrders}. Events: ${payload.deletedOrderEvents}. Numbers: ${payload.deletedOrderNumbers}.`,
        { position: 'bottom-right' },
      )
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Nao foi possivel limpar o historico de pedidos.'
      toast.error(message, { position: 'bottom-right' })
    } finally {
      setIsClearingOrderHistory(false)
    }
  }, [clearOrderHistoryCallable])

  return {
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
    isClearingOrderHistory,
    openUserDetails,
    closeUserDetails,
    saveRole,
    clearOrderHistory,
  }
}
