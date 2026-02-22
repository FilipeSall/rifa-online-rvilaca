import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { MOCK_ORDERS, MOCK_TICKETS } from '../const/userDashboard'
import { auth, db } from '../lib/firebase'
import { loadUserCpf, loadUserPhone, loadUserProfile, uploadUserAvatar } from '../services/userDashboard/userDashboardService'
import { useAuthStore } from '../stores/authStore'
import type { ReceiptFilter, Section, TicketFilter } from '../types/userDashboard'
import {
  filterOrders,
  filterTickets,
  getAvatarUploadErrorMessage,
  getDisplayName,
  getUserInitials,
} from '../utils/userDashboard'

export function useUserDashboard() {
  const { user, isLoggedIn, isAuthReady, userRole, isRoleReady } = useAuthStore()
  const navigate = useNavigate()

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
    () => filterTickets(MOCK_TICKETS, ticketFilter, ticketSearch),
    [ticketFilter, ticketSearch],
  )

  const filteredOrders = useMemo(
    () => filterOrders(MOCK_ORDERS, receiptFilter, receiptSearch),
    [receiptFilter, receiptSearch],
  )

  const paidCount = useMemo(
    () => MOCK_TICKETS.filter((ticket) => ticket.status === 'pago').length,
    [],
  )

  const displayName = user ? getDisplayName(user) : ''
  const initials = useMemo(() => getUserInitials(displayName), [displayName])

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
