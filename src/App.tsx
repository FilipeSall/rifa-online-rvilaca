import { Route, Routes } from 'react-router-dom'
import { PLACEHOLDER_ROUTES } from './const/app'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
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
  )
}
