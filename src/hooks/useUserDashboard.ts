import { signOut } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { MOCK_ORDERS, MOCK_TICKETS } from '../const/userDashboard'
import { auth } from '../lib/firebase'
import { loadUserPhone, uploadUserAvatar } from '../services/userDashboard/userDashboardService'
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
  const { user, isLoggedIn, isAuthReady } = useAuthStore()
  const navigate = useNavigate()

  const [activeSection, setActiveSection] = useState<Section>('numeros')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [firestorePhone, setFirestorePhone] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('Todos')
  const [ticketSearch, setTicketSearch] = useState('')

  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>('Todos')
  const [receiptSearch, setReceiptSearch] = useState('')

  useEffect(() => {
    if (isAuthReady && !isLoggedIn) {
      navigate('/')
    }
  }, [isAuthReady, isLoggedIn, navigate])

  useEffect(() => {
    if (!user) {
      return
    }

    const load = async () => {
      try {
        const phone = await loadUserPhone(user.uid)
        setFirestorePhone(phone)
      } catch {
        // Ignore phone loading errors for the dashboard main view.
      }
    }

    load()
  }, [user])

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

  return {
    user,
    isAuthReady,
    activeSection,
    setActiveSection,
    isEditOpen,
    setIsEditOpen,
    firestorePhone,
    setFirestorePhone,
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
    isLoading: !isAuthReady || !user,
  }
}
