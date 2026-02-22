import AnnouncementBar from '../components/home/AnnouncementBar'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import { PurchaseHeroSection, PurchaseNumbersContent } from '../components/purchaseNumbers'
import { usePurchaseNumbers } from '../hooks/usePurchaseNumbers'

export default function PurchaseNumbersPage() {
  const purchaseState = usePurchaseNumbers()

  return (
    <div className="selection:bg-gold selection:text-black overflow-x-hidden bg-luxury-bg font-display text-text-main">
      <AnnouncementBar />

      <div className="relative flex min-h-screen flex-col">
        <Header />

        <main className="flex-grow pb-16">
          <PurchaseHeroSection unitPrice={purchaseState.unitPrice} />
          <PurchaseNumbersContent purchaseState={purchaseState} />
        </main>

        <Footer />
      </div>
    </div>
  )
}
