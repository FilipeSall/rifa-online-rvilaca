import { PRIZES, type PrizeCardData } from '../../const/home'
import { DEFAULT_BONUS_PRIZE, DEFAULT_MAIN_PRIZE, DEFAULT_SECOND_PRIZE } from '../../const/campaign'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'

function PrizeCard({ badge, badgeClassName, title, description, imageSrc, imageAlt, icon }: PrizeCardData) {
  return (
    <div className="group bg-luxury-bg border border-white/5 rounded-xl overflow-hidden">
      <div className="aspect-[16/10] bg-gray-900 relative overflow-hidden flex items-center justify-center">
        <div
          className={`absolute top-3 left-3 text-[10px] font-black px-2 py-1 uppercase tracking-wider rounded-sm z-10 ${badgeClassName}`}
        >
          {badge}
        </div>
        {imageSrc ? (
          <img
            alt={imageAlt}
            className="w-full h-full object-cover transform-gpu opacity-80 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-hover:scale-105"
            src={imageSrc}
          />
        ) : (
          <>
            <span className="material-symbols-outlined text-6xl text-gold transform-gpu transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110">
              {icon}
            </span>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          </>
        )}
      </div>
      <div className="p-6">
        <h3 className="text-xl font-luxury font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
  )
}

export default function PrizesSection() {
  const { campaign } = useCampaignSettings()
  const dynamicPrizes: PrizeCardData[] = PRIZES.map((prize, index) => {
    if (index === 0) {
      return { ...prize, title: campaign.mainPrize || DEFAULT_MAIN_PRIZE }
    }

    if (index === 1) {
      return { ...prize, title: campaign.secondPrize || DEFAULT_SECOND_PRIZE }
    }

    if (index === 2) {
      return { ...prize, title: campaign.bonusPrize || DEFAULT_BONUS_PRIZE }
    }

    return prize
  })

  return (
    <section className="py-16 bg-luxury-card border-y border-white/5">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">
            O que você pode ganhar
          </span>
          <h2 className="text-3xl font-luxury font-bold text-white">Prêmios da Edição</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {dynamicPrizes.map((prize, index) => (
            <PrizeCard key={`${prize.title}-${index}`} {...prize} />
          ))}
        </div>
      </div>
    </section>
  )
}
