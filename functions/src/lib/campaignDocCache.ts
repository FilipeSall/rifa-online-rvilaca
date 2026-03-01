import type { DocumentData, Firestore } from 'firebase-admin/firestore'

const DEFAULT_CAMPAIGN_CACHE_TTL_MS = 5_000

type CampaignCacheEntry = {
  data: DocumentData | undefined
  expiresAtMs: number
}

const campaignDataCache = new Map<string, CampaignCacheEntry>()
const inflightCampaignReads = new Map<string, Promise<DocumentData | undefined>>()

function readCacheTtlMs() {
  const raw = Number(process.env.CAMPAIGN_DOC_CACHE_TTL_MS)
  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_CAMPAIGN_CACHE_TTL_MS
  }

  return Math.floor(raw)
}

export function invalidateCampaignDocCache(campaignId?: string) {
  if (campaignId) {
    campaignDataCache.delete(campaignId)
    inflightCampaignReads.delete(campaignId)
    return
  }

  campaignDataCache.clear()
  inflightCampaignReads.clear()
}

export async function getCampaignDocCached(
  db: Firestore,
  campaignId: string,
  options?: { forceRefresh?: boolean; ttlMs?: number },
): Promise<DocumentData | undefined> {
  const ttlMs = Number.isFinite(options?.ttlMs) ? Math.max(0, Math.floor(Number(options?.ttlMs))) : readCacheTtlMs()
  const nowMs = Date.now()

  if (!options?.forceRefresh) {
    const cached = campaignDataCache.get(campaignId)
    if (cached && cached.expiresAtMs > nowMs) {
      return cached.data
    }
  }

  const currentInflight = inflightCampaignReads.get(campaignId)
  if (currentInflight) {
    return currentInflight
  }

  const nextRead = db.collection('campaigns').doc(campaignId).get()
    .then((snapshot) => {
      const data = snapshot.exists ? snapshot.data() : undefined
      campaignDataCache.set(campaignId, {
        data,
        expiresAtMs: Date.now() + ttlMs,
      })
      return data
    })
    .finally(() => {
      inflightCampaignReads.delete(campaignId)
    })

  inflightCampaignReads.set(campaignId, nextRead)
  return nextRead
}
