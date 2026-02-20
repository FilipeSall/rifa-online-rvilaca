import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { PLACEHOLDER_ROUTES } from './const/app'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'
import PurchaseNumbersPage from './pages/PurchaseNumbersPage'
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
      <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/comprar-numeros" element={<PurchaseNumbersPage />} />
      <Route path="/comprar" element={<PurchaseNumbersPage />} />
      <Route path="/minha-conta" element={<UserDashboardPage />} />
      <Route
        path="/checkout"
        element={
          <PlaceholderPage
            title={PLACEHOLDER_ROUTES.checkout.title}
            description={PLACEHOLDER_ROUTES.checkout.description}
          />
        }
      />
      <Route
        path="/resultado"
        element={
          <PlaceholderPage
            title={PLACEHOLDER_ROUTES.resultado.title}
            description={PLACEHOLDER_ROUTES.resultado.description}
          />
        }
      />
      <Route path="*" element={<PlaceholderPage title={PLACEHOLDER_ROUTES.notFound.title} />} />
    </Routes>
    </>
  )
}
