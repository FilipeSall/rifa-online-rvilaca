import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import FeaturedVideoFloatingButton from './components/home/FeaturedVideoFloatingButton'
import FloatingCartQuickPanel from './components/purchaseNumbers/FloatingCartQuickPanel'
import WinnersFloatingButton from './components/winnersNotification/WinnersFloatingButton'
import WinnersModal from './components/winnersNotification/WinnersModal'
import { PLACEHOLDER_ROUTES } from './const/app'
import { useWinnersNotification } from './hooks/useWinnersNotification'
import AdminDashboardPage from './pages/AdminDashboardPage'
import CheckoutPage from './pages/CheckoutPage'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'
import PrizesPage from './pages/PrizesPage'
import PurchaseNumbersPage from './pages/PurchaseNumbersPage'
import RegulationPage from './pages/RegulationPage'
import ResultsPage from './pages/ResultsPage'
import UserDashboardPage from './pages/UserDashboardPage'
import { useAuthStore } from './stores/authStore'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AdminRedirect() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const userRole = useAuthStore((state) => state.userRole)
  const isRoleReady = useAuthStore((state) => state.isRoleReady)
  const wasLoggedOut = useRef(true)

  useEffect(() => {
    if (isLoggedIn) {
      if (wasLoggedOut.current && isRoleReady && userRole === 'admin') {
        wasLoggedOut.current = false
        navigate('/dashboard', { replace: true })
      }
    } else {
      wasLoggedOut.current = true
    }
  }, [isLoggedIn, isRoleReady, userRole, navigate])

  return null
}

export default function App() {
  const { pathname } = useLocation()
  const isDashboardOrAccountRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/minha-conta')
  const shouldRenderFeaturedVideoFloatingButton = !isDashboardOrAccountRoute
  const shouldRenderFloatingCartQuickPanel = pathname === '/' || pathname === '/comprar-manualmente'
  const shouldRenderWinnersNotifications = pathname === '/'
  const winnersNotification = useWinnersNotification(shouldRenderWinnersNotifications)

  return (
    <>
      <ScrollToTop />
      <AdminRedirect />
      <ToastContainer
        position="bottom-right"
        theme="dark"
        autoClose={5500}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        style={{ fontSize: '1.2rem' }}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/comprar-manualmente" element={<PurchaseNumbersPage />} />
        <Route path="/comprar" element={<Navigate to="/comprar-manualmente" replace />} />
        <Route path="/minha-conta" element={<UserDashboardPage />} />
        <Route path="/dashboard" element={<AdminDashboardPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/premios" element={<PrizesPage />} />
        <Route path="/resultado" element={<ResultsPage />} />
        <Route path="/regulamento" element={<RegulationPage />} />
        <Route path="*" element={<PlaceholderPage title={PLACEHOLDER_ROUTES.notFound.title} />} />
      </Routes>
      <WinnersModal
        isOpen={winnersNotification.isModalOpen}
        winners={winnersNotification.winners}
        isLoading={winnersNotification.isLoading}
        errorMessage={winnersNotification.errorMessage}
        onClose={winnersNotification.closeModal}
        onRetry={winnersNotification.refreshWinners}
      />
      {shouldRenderFeaturedVideoFloatingButton ? (
        <FeaturedVideoFloatingButton
          middleSlot={shouldRenderFloatingCartQuickPanel ? <FloatingCartQuickPanel /> : null}
          topSlot={winnersNotification.isFabVisible
            ? <WinnersFloatingButton onClick={winnersNotification.openModal} />
            : null}
        />
      ) : null}
    </>
  )
}
