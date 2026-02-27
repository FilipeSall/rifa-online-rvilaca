import { useLocation, useNavigate } from 'react-router-dom'
import { OPEN_PURCHASE_CART_EVENT } from '../../const/purchaseNumbers'
import { usePurchaseSummaryStore } from '../../stores/purchaseSummaryStore'

export default function FloatingCartQuickPanel() {
  const location = useLocation()
  const navigate = useNavigate()
  const quantity = usePurchaseSummaryStore((state) => state.quantity)
  const selectedCount = usePurchaseSummaryStore((state) => state.selectedCount)

  const handleOpenOfficialCart = () => {
    if (location.pathname !== '/comprar') {
      navigate('/comprar?openCart=1')
      return
    }

    window.dispatchEvent(new Event(OPEN_PURCHASE_CART_EVENT))
  }

  return (
    <div className="fixed bottom-4 right-4 z-[72] sm:relative sm:bottom-auto sm:right-auto sm:z-auto">
      <button
        aria-label="Abrir carrinho"
        className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-500/90 text-black shadow-[0_15px_35px_rgba(0,0,0,0.45)] transition-all hover:scale-[1.03] hover:brightness-105"
        type="button"
        onClick={handleOpenOfficialCart}
      >
        <span className="material-symbols-outlined text-[30px]">shopping_cart</span>
        <span className="pointer-events-none absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-white/70 bg-red-500 px-1 text-[10px] font-black text-white">
          {selectedCount > 0 ? selectedCount : quantity}
        </span>
      </button>
    </div>
  )
}
