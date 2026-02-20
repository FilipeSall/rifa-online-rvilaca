import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import PlaceholderPage from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/checkout"
        element={<PlaceholderPage title="Checkout" description="Tela reservada para fluxo de pagamento via PIX." />}
      />
      <Route
        path="/resultado"
        element={<PlaceholderPage title="Resultado" description="Tela reservada para histórico de sorteios e ganhadores." />}
      />
      <Route path="*" element={<PlaceholderPage title="Página não encontrada" />} />
    </Routes>
  )
}
