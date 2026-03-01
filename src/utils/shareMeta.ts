type ShareMetaInput = {
  campaignTitle?: string | null
  mainPrize?: string | null
  secondPrize?: string | null
  bonusPrize?: string | null
}

type ShareMetaPayload = {
  title: string
  description: string
}

const FALLBACK_CAMPAIGN_TITLE = 'Sorteio JhonyBarber'
const FALLBACK_MAIN_PRIZE = 'BMW R1200 GS 2015/2016'
const FALLBACK_SECOND_PRIZE = 'Honda CG Start 160 2026/2026'
const FALLBACK_BONUS_PRIZE = '20 PIX de R$ 1.000'

function sanitizeText(value: string | null | undefined, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

export function buildCampaignShareMeta(input: ShareMetaInput): ShareMetaPayload {
  const campaignTitle = sanitizeText(input.campaignTitle, FALLBACK_CAMPAIGN_TITLE)
  const mainPrize = sanitizeText(input.mainPrize, FALLBACK_MAIN_PRIZE)
  const secondPrize = sanitizeText(input.secondPrize, FALLBACK_SECOND_PRIZE)
  const bonusPrize = sanitizeText(input.bonusPrize, FALLBACK_BONUS_PRIZE)

  const title = `Concorra a ${mainPrize}, ${secondPrize} e ${bonusPrize} | JhonyBarber`
  const description = `Participe da ${campaignTitle} e concorra a ${mainPrize}, ${secondPrize} e ${bonusPrize}.`

  return { title, description }
}

function setMetaByName(name: string, content: string) {
  const element = document.querySelector(`meta[name="${name}"]`)
  if (!element) {
    return
  }

  element.setAttribute('content', content)
}

function setMetaByProperty(property: string, content: string) {
  const element = document.querySelector(`meta[property="${property}"]`)
  if (!element) {
    return
  }

  element.setAttribute('content', content)
}

export function applyCampaignShareMeta(payload: ShareMetaPayload) {
  document.title = payload.title
  setMetaByName('description', payload.description)
  setMetaByName('twitter:title', payload.title)
  setMetaByName('twitter:description', payload.description)
  setMetaByProperty('og:title', payload.title)
  setMetaByProperty('og:description', payload.description)
}
