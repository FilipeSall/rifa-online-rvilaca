import AnnouncementBar from '../components/home/AnnouncementBar'
import BuySection from '../components/home/BuySection'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import HeroSection from '../components/home/HeroSection'
import HowItWorksSection from '../components/home/HowItWorksSection'
import PrizesSection from '../components/home/PrizesSection'
import TrustBadgesSection from '../components/home/TrustBadgesSection'
import WinnersFaqSection from '../components/home/WinnersFaqSection'

export default function HomePage() {
  return (
    <div className="bg-luxury-bg font-display text-text-main overflow-x-hidden selection:bg-gold selection:text-black">
      <AnnouncementBar />

      <div className="flex min-h-screen flex-col relative">
        <Header />

        <main className="flex-grow">
          <HeroSection />
          <PrizesSection />
          <HowItWorksSection />
          <BuySection />
          <WinnersFaqSection />
          <TrustBadgesSection />
        </main>

        <Footer />
      </div>
    </div>
  )
}
