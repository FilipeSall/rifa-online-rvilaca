import { signOut } from 'firebase/auth'
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { auth, db } from '../lib/firebase'
import { loadUserCpf, loadUserPhone, loadUserProfile, uploadUserAvatar } from '../services/userDashboard/userDashboardService'
import { useAuthStore } from '../stores/authStore'
import { formatTicketNumber } from '../utils/ticketNumber'
import { useCampaignSettings } from './useCampaignSettings'
import type { ReceiptFilter, Section, TicketFilter, UserOrder, UserTicket } from '../types/userDashboard'
import {
  filterOrders,
  filterTickets,
  formatCurrencyBrl,
  formatDashboardDate,
  getAvatarUploadErrorMessage,
  getDisplayName,
  getUserInitials,
  isOrderReservationExpired,
  mapOrderStatusToTicketStatus,
} from '../utils/userDashboard'

function readTimestampMillis(value: unknown): number | null {
  if (!value) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (
    typeof value === 'object'
    && value !== null
    && 'toMillis' in value
    && typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return Number((value as { toMillis: () => number }).toMillis())
    } catch {
      return null
    }
  }

  return null
}

function readOrderNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((number) => Number.isInteger(number) && number > 0),
  )).sort((a, b) => a - b)
}

function parseSectionParam(value: string | null): Section | null {
  if (value === 'numeros' || value === 'comprovantes') {
    return value
  }

  return null
}

export function useUserDashboard() {
  const { user, isLoggedIn, isAuthReady, userRole, isRoleReady } = useAuthStore()
  const { campaign } = useCampaignSettings()
  const navigate = useNavigate()
  const location = useLocation()

  const [activeSection, setActiveSection] = useState<Section>('numeros')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [firestorePhone, setFirestorePhone] = useState<string | null>(null)
  const [firestoreCpf, setFirestoreCpf] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('Todos')
  const [ticketSearch, setTicketSearch] = useState('')

  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>('Todos')
  const [receiptSearch, setReceiptSearch] = useState('')

  const [orders, setOrders] = useState<UserOrder[]>([])
  const [tickets, setTickets] = useState<UserTicket[]>([])
  const appliedRouteSectionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (appliedRouteSectionKeyRef.current === location.key) {
      return
    }

    appliedRouteSectionKeyRef.current = location.key
    const querySection = parseSectionParam(new URLSearchParams(location.search).get('section'))
    const stateSection = parseSectionParam(
      typeof location.state === 'object' && location.state !== null && 'section' in location.state
        ? String((location.state as { section?: unknown }).section ?? '')
        : null,
    )
    const routeSection = querySection || stateSection

    if (routeSection) {
      setActiveSection(routeSection)
    }
  }, [location.key, location.search, location.state])

  useEffect(() => {
    if (!isAuthReady || !isRoleReady) {
      return
    }

    if (!isLoggedIn) {
      navigate('/')
      return
    }

    if (userRole === 'admin') {
      navigate('/dashboard')
    }
  }, [isAuthReady, isLoggedIn, isRoleReady, navigate, userRole])

  useEffect(() => {
    if (!isAuthReady || !user) {
      setFirestorePhone(null)
      setFirestoreCpf(null)
      return
    }

    const userDocRef = doc(db, 'users', user.uid)
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setFirestorePhone(null)
          setFirestoreCpf(null)
          return
        }

        const data = snapshot.data()
        setFirestorePhone(data.phone ?? null)
        setFirestoreCpf(data.cpf ?? null)
      },
      (error) => {
        console.warn('Failed to subscribe user profile:', error)
      },
    )

    return unsubscribe
  }, [isAuthReady, user])

  useEffect(() => {
    if (!isAuthReady || !user) {
      setOrders([])
      setTickets([])
      return
    }

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const nextOrders: UserOrder[] = snapshot.docs
          .filter((documentSnapshot) => {
            const rawType = String(documentSnapshot.data().type || 'deposit').toLowerCase()
            return rawType === 'deposit'
          })
          .map((documentSnapshot) => {
          const data = documentSnapshot.data()
          const createdAtMs =
            readTimestampMillis(data.paidBusinessAppliedAt)
            ?? readTimestampMillis(data.createdAt)
            ?? readTimestampMillis(data.updatedAt)
          const reservationExpiresAtMs = readTimestampMillis(data.reservationExpiresAt)
          const numbers = readOrderNumbers(data.reservedNumbers)
          const amount = typeof data.amount === 'number' && Number.isFinite(data.amount)
            ? Number(data.amount)
            : null
          const rawStatus = String(data.status || 'pending')
          const status = isOrderReservationExpired(rawStatus, reservationExpiresAtMs)
            ? 'expirado'
            : mapOrderStatusToTicketStatus(rawStatus)

          return {
            id: documentSnapshot.id,
            cotas: numbers.length,
            numbers,
            amount,
            totalBrl: formatCurrencyBrl(amount),
            date: formatDashboardDate(createdAtMs),
            status,
            copyPaste: typeof data.pixCopyPaste === 'string' ? data.pixCopyPaste : null,
            createdAtMs,
            campaignId: typeof data.campaignId === 'string' ? data.campaignId : null,
          }
        })

        const nextTickets: UserTicket[] = nextOrders
          .flatMap((order) => order.numbers.map((number) => ({
            number: formatTicketNumber(number),
            numericNumber: number,
            orderId: order.id,
            date: order.date,
            status: order.status,
            createdAtMs: order.createdAtMs,
          })))
          .sort((left, right) => {
            const leftTs = left.createdAtMs ?? 0
            const rightTs = right.createdAtMs ?? 0
            if (rightTs !== leftTs) {
              return rightTs - leftTs
            }

            return left.numericNumber - right.numericNumber
          })

        setOrders(nextOrders)
        setTickets(nextTickets)
      },
      (error) => {
        console.error('Failed to subscribe orders:', error)
        toast.error('Nao foi possivel carregar seus pedidos. Verifique os indices e as regras do Firestore.', {
          position: 'bottom-right',
          toastId: 'dashboard-orders-subscribe-error',
        })
      },
    )

    return unsubscribe
  }, [isAuthReady, user])

  const refreshProfile = useCallback(async () => {
    if (!user) {
      return
    }

    let lastError: unknown = null

    // Auth/Firestore can race right after route transition; retry briefly.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const profile = await loadUserProfile(user.uid)
        setFirestorePhone(profile.phone)
        setFirestoreCpf(profile.cpf)
        return
      } catch (error) {
        lastError = error
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)))
        }
      }
    }

    console.warn('Failed to load user profile from Firestore:', lastError)
  }, [user])

  useEffect(() => {
    if (!isAuthReady || !user) {
      return
    }

    void refreshProfile()
  }, [isAuthReady, refreshProfile, user])

  const handlePhotoChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file || !user) {
        return
      }

      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }

      setIsUploadingPhoto(true)

      try {
        await uploadUserAvatar(file, user.uid)

        if (auth.currentUser) {
          useAuthStore.getState().setAuthUser(auth.currentUser)
        }
      } catch (error) {
        console.error('Avatar upload failed:', error)
        toast.error(getAvatarUploadErrorMessage(error), {
          position: 'bottom-right',
        })
      } finally {
        setIsUploadingPhoto(false)
      }
    },
    [user],
  )

  const handleSignOut = useCallback(async () => {
    await signOut(auth)
    navigate('/')
  }, [navigate])

  const filteredTickets = useMemo(
    () => filterTickets(tickets, ticketFilter, ticketSearch),
    [ticketFilter, ticketSearch, tickets],
  )

  const filteredOrders = useMemo(
    () => filterOrders(orders, receiptFilter, receiptSearch),
    [orders, receiptFilter, receiptSearch],
  )

  const paidCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'pago').length,
    [tickets],
  )

  const displayName = user ? getDisplayName(user) : ''
  const initials = useMemo(() => getUserInitials(displayName), [displayName])
  const nextDrawDateLabel = useMemo(() => {
    if (!campaign.endsAt) {
      return 'Nao definido'
    }

    const date = new Date(`${campaign.endsAt}T12:00:00`)
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  }, [campaign.endsAt])

  const loadPhoneForUser = useCallback(async () => {
    if (!user) {
      return null
    }

    return loadUserPhone(user.uid)
  }, [user])

  const loadCpfForUser = useCallback(async () => {
    if (!user) {
      return null
    }

    return loadUserCpf(user.uid)
  }, [user])

  return {
    user,
    isAuthReady,
    activeSection,
    setActiveSection,
    isEditOpen,
    setIsEditOpen,
    firestorePhone,
    setFirestorePhone,
    firestoreCpf,
    setFirestoreCpf,
    isUploadingPhoto,
    photoInputRef,
    ticketFilter,
    setTicketFilter,
    ticketSearch,
    setTicketSearch,
    receiptFilter,
    setReceiptFilter,
    receiptSearch,
    setReceiptSearch,
    filteredTickets,
    filteredOrders,
    paidCount,
    totalOrders: orders.length,
    totalTickets: tickets.length,
    campaignTitle: campaign.title,
    mainPrize: campaign.mainPrize,
    secondPrize: campaign.secondPrize,
    bonusPrize: campaign.bonusPrize,
    nextDrawDateLabel,
    displayName,
    initials,
    handlePhotoChange,
    handleSignOut,
    loadPhoneForUser,
    loadCpfForUser,
    refreshProfile,
    isLoading: !isAuthReady || !isRoleReady || !user,
  }
}
