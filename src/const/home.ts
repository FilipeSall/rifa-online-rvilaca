export type NavItem = {
  label: string
  href: string
  isActive: boolean
}

export type PackOption = {
  amount: string
  popular: boolean
}

export type TrustBadge = {
  icon: string
  label: string
  iconClassName: string
}

export type HowItWorksStep = {
  num: string
  title: string
  desc: string
}

export type PrizeCardData = {
  badge: string
  badgeClassName: string
  title: string
  description: string
  imageSrc?: string
  imageAlt?: string
  icon?: string
}

export type RankingItem = {
  pos: number
  name: string
  cotas: number
  isGold: boolean
}

export type FaqItem = {
  q: string
  a: string
}

export const ANNOUNCEMENT_TEXT =
  '🔥 ÚLTIMAS COTAS DISPONÍVEIS — Compre agora e concorra a uma BMW R 1200 GS + R$ 20.000 em prêmios! 🏆'

export const HEADER_NAV_ITEMS: NavItem[] = [
  { label: 'Início', href: '#', isActive: true },
  { label: 'Como Funciona', href: '#como-funciona', isActive: false },
  { label: 'Ganhadores', href: '#ganhadores', isActive: false },
  { label: 'FAQ', href: '#faq', isActive: false },
  { label: 'Regulamento', href: '#', isActive: false },
]

export const HERO_CONFIG = {
  countdownDurationMs: ((2 * 24 + 14) * 60 * 60 + 45 * 60 + 30) * 1000,
  targetSoldPercentage: 67,
  progressAnimationDelayMs: 120,
  progressAnimationDurationMs: 1600,
}

export const HERO_COUNTDOWN_LABELS = ['Dias', 'Horas', 'Min', 'Seg'] as const

export const PRIZES: PrizeCardData[] = [
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

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    num: '1',
    title: 'Escolha seus Números',
    desc: 'Selecione a quantidade de bilhetes que deseja comprar. Quanto mais números, maiores as chances.',
  },
  {
    num: '2',
    title: 'Faça o Pagamento',
    desc: 'Realize o pagamento via PIX de forma rápida e segura. A confirmação é automática.',
  },
  {
    num: '3',
    title: 'Aguarde o Sorteio',
    desc: 'Acompanhe o resultado pela Loteria Federal na data marcada. Boa sorte!',
  },
]

export const PACK_OPTIONS: PackOption[] = [
  { amount: '+10', popular: false },
  { amount: '+50', popular: true },
  { amount: '+100', popular: false },
  { amount: '+250', popular: false },
]

export const RANKING: RankingItem[] = [
  { pos: 1, name: 'Rafael M.', cotas: 520, isGold: true },
  { pos: 2, name: 'Ana Paula S.', cotas: 415, isGold: false },
  { pos: 3, name: 'Carlos E.', cotas: 380, isGold: false },
  { pos: 4, name: 'Julia R.', cotas: 250, isGold: false },
  { pos: 5, name: 'Marcos V.', cotas: 210, isGold: false },
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Como recebo meu prêmio?',
    a: 'Após a apuração do resultado, nossa equipe entrará em contato via WhatsApp e telefone para alinhar a entrega do prêmio. Para prêmios físicos como a moto, cobrimos todos os custos de envio.',
  },
  {
    q: 'O sorteio é confiável?',
    a: 'Sim! Utilizamos os números da Loteria Federal para definir os ganhadores, garantindo 100% de imparcialidade e transparência. Você pode conferir o resultado diretamente no site da Caixa.',
  },
  {
    q: 'Posso pagar com cartão de crédito?',
    a: 'Atualmente aceitamos exclusivamente PIX, pois permite a baixa automática e instantânea dos seus números, garantindo sua participação imediata no sorteio.',
  },
]

export const TRUST_BADGES: TrustBadge[] = [
  { icon: 'lock', label: 'Ambiente Seguro', iconClassName: 'text-green-500' },
  { icon: 'verified_user', label: 'Sorteio Verificado', iconClassName: 'text-blue-500' },
  { icon: 'workspace_premium', label: 'Garantia de Entrega', iconClassName: 'text-yellow-500' },
]

export const FOOTER_NAV_LINKS = ['Sorteios Ativos', 'Ganhadores', 'Termos de Uso', 'Política de Privacidade']
export const FOOTER_SUPPORT_LINKS = ['Fale Conosco', 'Dúvidas Frequentes', 'Regulamento']
