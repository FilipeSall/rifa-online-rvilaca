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

export type FooterLinkItem = {
  label: string
  href: string
}

export const CAMPAIGN_TOTAL_COTAS = 3_450_000
export const CAMPAIGN_SOLD_COTAS = 2_242_500

export const ANNOUNCEMENT_TEXT =
  '🔥 ÚLTIMAS COTAS DISPONÍVEIS — Concorra a BMW R 1200 GS + Honda CG Start 160 + R$ 20.000 em PIX! 🏆'

export const HEADER_NAV_ITEMS: NavItem[] = [
  { label: 'Início', href: '#', isActive: true },
  { label: 'Prêmios', href: '/premios', isActive: false },
  { label: 'Ganhadores', href: '#ganhadores', isActive: false },
  { label: 'FAQ', href: '#faq', isActive: false },
]

export const HERO_CONFIG = {
  countdownDurationMs: ((2 * 24 + 14) * 60 * 60 + 45 * 60 + 30) * 1000,
  targetSoldPercentage: 65,
  progressAnimationDelayMs: 40,
  progressAnimationDurationMs: 900,
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
    title: 'Honda CG Start 160',
    description: 'Ano 2026 / Modelo 2026. Economia e agilidade para o dia a dia.',
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

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Como funciona o ranking semanal do sorteio exclusivo?',
    a: 'A cada semana, o sistema fecha e congela às 23:59 da sexta-feira (America/Sao_Paulo) o Top 50 de participantes com maior quantidade de cotas pagas no período semanal. Esse ranking é a base oficial do sorteio exclusivo da semana.',
  },
  {
    q: 'Qual extração da Loteria Federal é usada?',
    a: 'O sorteio exclusivo semanal usa a extração oficial de sábado da Loteria Federal referente àquela semana. As 5 extrações do concurso são registradas para apuração auditável.',
  },
  {
    q: 'Como o número sorteado vira posição no ranking?',
    a: 'O número da Loteria Federal é convertido matematicamente para código/posição do ranking. A plataforma aplica os critérios previstos no regulamento e identifica automaticamente o ganhador válido.',
  },
  {
    q: 'Se não houver correspondência direta na primeira tentativa, o que acontece?',
    a: 'É aplicada a regra de redundância: a apuração avança pelas extrações seguintes e, se necessário, utiliza o critério de fallback previsto no regulamento para garantir ganhador na rodada.',
  },
  {
    q: 'Como recebo meu prêmio?',
    a: 'Após a publicação oficial do resultado, nossa equipe entra em contato via WhatsApp e telefone para conferência de identidade e alinhamento da entrega/pagamento do prêmio.',
  },
]

export const TRUST_BADGES: TrustBadge[] = [
  { icon: 'lock', label: 'Ambiente Seguro', iconClassName: 'text-green-500' },
  { icon: 'verified_user', label: 'Sorteio Verificado', iconClassName: 'text-blue-500' },
  { icon: 'workspace_premium', label: 'Garantia de Entrega', iconClassName: 'text-yellow-500' },
]

export const FOOTER_NAV_LINKS: FooterLinkItem[] = [
  { label: 'Sorteios Ativos', href: '/#comprar-numeros' },
  { label: 'Ganhadores', href: '/resultado' },
  { label: 'Termos de Uso', href: '/regulamento' },
  { label: 'Política de Privacidade', href: '/regulamento' },
]

export const FOOTER_SUPPORT_LINKS: FooterLinkItem[] = [
  { label: 'Fale Conosco', href: '/#faq' },
  { label: 'Dúvidas Frequentes', href: '/#faq' },
  { label: 'Regulamento', href: '/regulamento' },
]
