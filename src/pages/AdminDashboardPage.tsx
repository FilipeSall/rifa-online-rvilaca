import { signOut } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminDashboardContent from '../components/adminDashboard/AdminDashboardContent'
import Header from '../components/home/Header'
import { type AdminTabId } from '../const/adminDashboard'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'

const ADMIN_DEBUG = import.meta.env.DEV

function adminDebug(message: string, payload?: unknown) {
  if (!ADMIN_DEBUG) {
    return
  }

  const timestamp = new Date().toISOString()
  if (payload === undefined) {
    console.log(`[admin-debug][AdminDashboardPage][${timestamp}] ${message}`)
    return
  }

  console.log(`[admin-debug][AdminDashboardPage][${timestamp}] ${message}`, payload)
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const isAuthReady = useAuthStore((state) => state.isAuthReady)
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const isRoleReady = useAuthStore((state) => state.isRoleReady)
  const userRole = useAuthStore((state) => state.userRole)
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard')
  const renderCountRef = useRef(0)

  renderCountRef.current += 1
  adminDebug('render', {
    renderCount: renderCountRef.current,
    isAuthReady,
    isLoggedIn,
    isRoleReady,
    userRole,
    activeTab,
  })

  useEffect(() => {
    if (!isAuthReady || !isRoleReady) {
      adminDebug('guard waiting auth/role readiness', {
        isAuthReady,
        isRoleReady,
      })
      return
    }

    if (!isLoggedIn) {
      adminDebug('redirect to / (not logged)')
      navigate('/')
      return
    }

    if (userRole !== 'admin') {
      adminDebug('redirect to /minha-conta (role is not admin)', { userRole })
      navigate('/minha-conta')
      return
    }

    adminDebug('access granted for admin dashboard')
  }, [isAuthReady, isLoggedIn, isRoleReady, navigate, userRole])

  const handleSignOut = async () => {
    adminDebug('sign out requested')
    await signOut(auth)
    navigate('/')
  }

  if (!isAuthReady || !isRoleReady || !isLoggedIn || userRole !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-luxury-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-luxury-bg font-display text-white">
      <Header />
      <AdminDashboardContent activeTab={activeTab} onTabChange={setActiveTab} onSignOut={handleSignOut} />
    </div>
  )
}
