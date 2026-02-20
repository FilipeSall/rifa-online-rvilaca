type PrizeCardProps = {
  badge: string
  badgeClassName: string
  title: string
  description: string
  imageSrc?: string
  imageAlt?: string
  icon?: string
}

const PRIZES: PrizeCardProps[] = [
  {
    badge: '1º Prêmio',
    badgeClassName: 'bg-gold text-black',
    title: 'BMW R 1200 GS',
    description:
      'A máquina definitiva para suas aventuras. Completa, com acessórios e documentação grátis.',
    imageAlt: 'BMW Motorcycle',
    imageSrc:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDaQF11hNB5K8OrSxcTvxNOx5hgNg1ADcoHxYzDLBIsbbeH_5iAWjd-AboztLottNaaNPlPIG8UHvAY3crWR6zGTWK4JgzYQlU1JEadKFDe4wimQeFcTl4nboPuYNSoQTsiCiz7CpWKyN_0iqn0DGk3AZdWYkzXlhPtcL7sV1mbKzzCTpG52RRuJq1dIaFlCWEsVWKWA2g1tkKXaBW_yIdfhx3OzWszMoNNcpteERd6bjDmzkNMWQKl5nsaiOmrgyfxwyWII69GMJ6g',
  },
  {
    badge: '2º Prêmio',
    badgeClassName: 'bg-white text-black',
    title: 'Honda CG 160 Titan',
    description: 'Economia e agilidade para o dia a dia. Tanque cheio e emplacada.',
    imageAlt: 'Honda Motorcycle',
    imageSrc:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC9vPUnNi9GeVGuP8cEk_bTws-UD92OhX5CitQJ9GO5u3efdLU1VLwR1o2Qa8Kl4BxvKw6RcuQI3Mj2YmsnNd_soxwmzryanwI14UB0BMaFaDaYh0kZriOw8gfFK-ORFT4P2qCKIWDJxxo34SUo8cohk2QGBT3ewqAl98N7WgZYuKWhykkiyvKwPwMrM5piDUBiwiYvDssRbWKK8x24li1gZ2tbopzr0txQJYHFAqktbdEut_4XEtZuTFJgMHGUmeb-QfE4npTZUpjj',
  },
  {
    badge: 'Bilhetes Premiados',
    badgeClassName: 'bg-white text-black',
    title: '20x Pix de R$ 1.000',
    description: 'Prêmios instantâneos escondidos nos números. Achou, ganhou na hora!',
    icon: 'payments',
  },
]

function PrizeCard({ badge, badgeClassName, title, description, imageSrc, imageAlt, icon }: PrizeCardProps) {
  return (
    <div className="group bg-luxury-bg border border-white/5 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300 hover:shadow-card-hover">
      <div className="aspect-[16/10] bg-gray-900 relative overflow-hidden flex items-center justify-center">
        <div
          className={`absolute top-3 left-3 text-[10px] font-black px-2 py-1 uppercase tracking-wider rounded-sm z-10 ${badgeClassName}`}
        >
          {badge}
        </div>
        {imageSrc ? (
          <img
            alt={imageAlt}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105"
            src={imageSrc}
          />
        ) : (
          <>
            <span className="material-symbols-outlined text-6xl text-gold group-hover:scale-110 transition-transform duration-500">
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
          {PRIZES.map((prize) => (
            <PrizeCard key={prize.title} {...prize} />
          ))}
        </div>
      </div>
    </section>
  )
}
