import { useScrollToHash } from '../hooks/useScrollToHash'
import AnnouncementBar from '../components/home/AnnouncementBar'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import HeroSection from '../components/home/HeroSection'
import TrustBadgesSection from '../components/home/TrustBadgesSection'
import WinnersFaqSection from '../components/home/WinnersFaqSection'
import { PurchaseHeroSection, PurchaseNumbersContent } from '../components/purchaseNumbers'
import { usePurchaseNumbers } from '../hooks/usePurchaseNumbers'

export default function HomePage() {
  useScrollToHash()
  const purchaseState = usePurchaseNumbers()

  return (
    <div className="bg-luxury-bg font-display text-text-main overflow-x-hidden selection:bg-gold selection:text-black">
      <AnnouncementBar />

      <div className="flex min-h-screen flex-col relative">
        <Header />

        <main className="flex-grow">
          <HeroSection />
          <div id="comprar-numeros">
            <PurchaseHeroSection
              unitPrice={purchaseState.unitPrice}
              minQuantity={purchaseState.minPurchaseQuantity}
            />
            <PurchaseNumbersContent purchaseState={purchaseState} />
          </div>
          <WinnersFaqSection />
          <TrustBadgesSection />
        </main>

        <Footer />
      </div>
    </div>
  )
}
