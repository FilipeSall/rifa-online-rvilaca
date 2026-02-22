import { type DocumentData, type Firestore } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID } from './constants.js'
import { asRecord, readString, sanitizeString } from './shared.js'

interface GetChampionsRankingInput {
  limit?: number
}

interface ChampionRankingItem {
  pos: number
  name: string
  cotas: number
  isGold: boolean
}

interface GetChampionsRankingOutput {
  campaignId: string
  updatedAtMs: number
  items: ChampionRankingItem[]
}

function sanitizeLimit(value: unknown) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 5
  }

  return Math.max(1, Math.min(parsed, 10))
}

function readOrderQuantity(data: DocumentData): number {
  const reservedNumbers = data.reservedNumbers

  if (Array.isArray(reservedNumbers)) {
    return reservedNumbers.filter((item) => Number.isInteger(item) && Number(item) > 0).length
  }

  const quantity = Number(data.quantity)
  if (Number.isInteger(quantity) && quantity > 0) {
    return quantity
  }

  return 0
}

function formatPublicName(name: string, uid: string): string {
  const normalized = sanitizeString(name)

  if (!normalized) {
    return `Participante ${uid.slice(-4).toUpperCase()}`
  }

  const tokens = normalized.split(/\s+/).filter(Boolean)
  const firstName = tokens[0] || normalized
  const secondInitial = tokens[1]?.[0]

  if (secondInitial) {
    return `${firstName} ${secondInitial.toUpperCase()}.`
  }

  if (firstName.length <= 2) {
    return `${firstName[0] || 'P'}*`
  }

  return `${firstName.slice(0, 1).toUpperCase()}${firstName.slice(1).toLowerCase()}`
}

export function createGetChampionsRankingHandler(db: Firestore) {
  return async (request: { data: unknown }): Promise<GetChampionsRankingOutput> => {
    const payload = asRecord(request.data) as GetChampionsRankingInput
    const limit = sanitizeLimit(payload.limit)

    try {
      const ordersSnapshot = await db.collection('orders')
        .where('status', '==', 'paid')
        .where('type', '==', 'deposit')
        .where('campaignId', '==', CAMPAIGN_DOC_ID)
        .select('userId', 'reservedNumbers', 'quantity')
        .get()

      const totalsByUser = new Map<string, number>()

      for (const document of ordersSnapshot.docs) {
        const data = document.data()
        const userId = readString(data.userId)
        const quantity = readOrderQuantity(data)

        if (!userId || quantity <= 0) {
          continue
        }

        totalsByUser.set(userId, (totalsByUser.get(userId) || 0) + quantity)
      }

      const sorted = Array.from(totalsByUser.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1]
          }

          return left[0].localeCompare(right[0])
        })
        .slice(0, limit)

      const usersSnapshot = await Promise.all(
        sorted.map(([uid]) => db.collection('users').doc(uid).get()),
      )

      const items: ChampionRankingItem[] = sorted.map(([uid, cotas], index) => {
        const userData = usersSnapshot[index]?.data() || {}
        const name = sanitizeString(userData.name) || sanitizeString(userData.displayName)

        return {
          pos: index + 1,
          name: formatPublicName(name, uid),
          cotas,
          isGold: index === 0,
        }
      })

      return {
        campaignId: CAMPAIGN_DOC_ID,
        updatedAtMs: Date.now(),
        items,
      }
    } catch (error) {
      logger.error('getChampionsRanking failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o ranking agora.')
    }
  }
}
