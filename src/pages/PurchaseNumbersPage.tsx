import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import AnnouncementBar from '../components/home/AnnouncementBar'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import { PurchaseHeroSection, PurchaseNumbersContent } from '../components/purchaseNumbers'
import { usePurchaseNumbers } from '../hooks/usePurchaseNumbers'
import type { SelectionMode } from '../types/purchaseNumbers'

export default function PurchaseNumbersPage() {
  const location = useLocation()
  const initialSelectionMode = useMemo<SelectionMode>(() => {
    const searchParams = new URLSearchParams(location.search)
    return searchParams.get('mode') === 'manual' ? 'manual' : 'automatico'
  }, [location.search])
  const purchaseState = usePurchaseNumbers({ initialSelectionMode })

  return (
    <div className="selection:bg-neon-pink selection:text-black overflow-x-hidden bg-luxury-bg font-display text-text-main">
      <AnnouncementBar />

      <div className="relative flex min-h-screen flex-col">
        <Header />

        <main className="flex-grow pb-16">
          <PurchaseHeroSection
            unitPrice={purchaseState.unitPrice}
            minQuantity={purchaseState.minSelectableQuantity}
          />
          <PurchaseNumbersContent purchaseState={purchaseState} />
        </main>

        <Footer />
      </div>
    </div>
  )
}
