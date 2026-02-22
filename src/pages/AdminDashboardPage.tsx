import { signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminDashboardContent from '../components/adminDashboard/AdminDashboardContent'
import Header from '../components/home/Header'
import { type AdminTabId } from '../const/adminDashboard'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const isAuthReady = useAuthStore((state) => state.isAuthReady)
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const isRoleReady = useAuthStore((state) => state.isRoleReady)
  const userRole = useAuthStore((state) => state.userRole)
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard')

  useEffect(() => {
    if (!isAuthReady || !isRoleReady) {
      return
    }

    if (!isLoggedIn) {
      navigate('/')
      return
    }

    if (userRole !== 'admin') {
      navigate('/minha-conta')
      return
    }
  }, [isAuthReady, isLoggedIn, isRoleReady, navigate, userRole])

  const handleSignOut = async () => {
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
