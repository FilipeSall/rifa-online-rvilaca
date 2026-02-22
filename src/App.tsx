import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { PLACEHOLDER_ROUTES } from './const/app'
import AdminDashboardPage from './pages/AdminDashboardPage'
import CheckoutPage from './pages/CheckoutPage'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'
import PrizesPage from './pages/PrizesPage'
import RegulationPage from './pages/RegulationPage'
import ResultsPage from './pages/ResultsPage'
import UserDashboardPage from './pages/UserDashboardPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <ToastContainer
        position="bottom-right"
        theme="dark"
        autoClose={5000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/minha-conta" element={<UserDashboardPage />} />
        <Route path="/dashboard" element={<AdminDashboardPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/premios" element={<PrizesPage />} />
        <Route path="/resultado" element={<ResultsPage />} />
        <Route path="/regulamento" element={<RegulationPage />} />
        <Route path="*" element={<PlaceholderPage title={PLACEHOLDER_ROUTES.notFound.title} />} />
      </Routes>
    </>
  )
}
