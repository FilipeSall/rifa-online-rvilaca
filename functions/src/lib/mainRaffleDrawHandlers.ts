import { FieldValue, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore'
import * as logger from 'firebase-functions/logger'
import { HttpsError } from 'firebase-functions/v2/https'
import { CAMPAIGN_DOC_ID, DEFAULT_MAIN_PRIZE } from './constants.js'
import { readCampaignNumberRange } from './numberStateStore.js'
import { asRecord, readTimestampMillis, requireActiveUid, sanitizeString } from './shared.js'

const MAIN_RAFFLE_DRAW_HISTORY_COLLECTION = 'mainRaffleDrawResults'
const EXTRACTION_COUNT = 5
const MAX_EXTRACTION_VALUE = 9_999_999
const DEFAULT_PUBLIC_MAIN_HISTORY_LIMIT = 20
const MAX_PUBLIC_MAIN_HISTORY_LIMIT = 40

interface PublishMainRaffleDrawInput {
  extractionNumbers?: Array<number | string>
  extractionIndex?: number
  drawPrize?: string
  drawDate?: string
}

interface MainRaffleWinner {
  userId: string
  name: string
  photoURL?: string
}

interface MainRaffleDrawResult {
  campaignId: string
  drawId: string
  drawDate: string
  drawPrize: string
  extractionNumbers: string[]
  selectedExtractionIndex: number
  selectedExtractionNumber: string
  raffleRangeStart: number
  raffleRangeEnd: number
  raffleTotalNumbers: number
  moduloTargetOffset: number
  targetNumber: number
  targetNumberFormatted: string
  winningNumber: number
  winningNumberFormatted: string
  fallbackDirection: 'none' | 'above' | 'below'
  winner: MainRaffleWinner
  publishedAtMs: number
}

interface GetLatestMainRaffleDrawOutput {
  hasResult: boolean
  result: MainRaffleDrawResult | null
}

interface GetMainRaffleDrawHistoryOutput {
  results: MainRaffleDrawResult[]
}

interface GetMainRaffleDrawHistoryInput {
  limit?: number
}

const BRAZIL_OFFSET_MS = -3 * 60 * 60 * 1000

function toBrazilLocalDate(sourceMs: number) {
  return new Date(sourceMs + BRAZIL_OFFSET_MS)
}

function formatBrazilDateId(sourceMs: number) {
  const localDate = toBrazilLocalDate(sourceMs)
  const year = localDate.getUTCFullYear()
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(localDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function sanitizeExtractionNumber(value: unknown, index: number): string {
  const raw = String(value ?? '').replace(/\D/g, '')
  if (!raw) {
    return ''
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_EXTRACTION_VALUE) {
    throw new HttpsError('invalid-argument', `Extracao ${index + 1} fora da faixa 0000000-9999999.`)
  }

  return String(parsed).padStart(7, '0')
}

function sanitizeExtractionNumbers(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== EXTRACTION_COUNT) {
    throw new HttpsError('invalid-argument', 'Informe exatamente 5 extracoes da Loteria Federal.')
  }

  return value.map((item, index) => sanitizeExtractionNumber(item, index))
}

function sanitizeExtractionIndex(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > EXTRACTION_COUNT) {
    throw new HttpsError('invalid-argument', 'extractionIndex deve estar entre 1 e 5.')
  }
  return parsed
}

function buildAvailableDrawPrizes(campaignData: DocumentData | undefined): string[] {
  const mainPrize = sanitizeString(campaignData?.mainPrize) || DEFAULT_MAIN_PRIZE
  const secondPrize = sanitizeString(campaignData?.secondPrize)
  const bonusPrize = sanitizeString(campaignData?.bonusPrize)

  const directPrizes = [mainPrize, secondPrize].filter(Boolean)
  const expandedPixPrizes: string[] = []

  const pixMatch = bonusPrize.match(/^\s*(\d+)\s*pix\b/i)
  if (bonusPrize && pixMatch) {
    const totalPix = Number(pixMatch[1])
    if (Number.isInteger(totalPix) && totalPix > 1 && totalPix <= 100) {
      for (let index = 1; index <= totalPix; index += 1) {
        expandedPixPrizes.push(`${bonusPrize} (Cota PIX ${index})`)
      }
    } else {
      expandedPixPrizes.push(bonusPrize)
    }
  } else if (bonusPrize) {
    expandedPixPrizes.push(bonusPrize)
  }

  return Array.from(new Set([...directPrizes, ...expandedPixPrizes]))
}

function sanitizeDrawPrize(value: unknown, allowedPrizes: string[]): string {
  const normalized = sanitizeString(value)
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Selecione o premio vigente do sorteio.')
  }

  if (!allowedPrizes.includes(normalized)) {
    throw new HttpsError('invalid-argument', 'Premio selecionado nao pertence aos premios vigentes da campanha.')
  }

  return normalized
}

function sanitizeOptionalDrawDate(value: unknown): string {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return formatBrazilDateId(Date.now())
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpsError('invalid-argument', 'drawDate deve estar no formato YYYY-MM-DD.')
  }

  return normalized
}

function sanitizeHistoryLimit(value: unknown, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(Math.max(1, parsed), max)
}

async function assertAdminRole(db: Firestore, uid: string) {
  const userSnapshot = await db.collection('users').doc(uid).get()
  const role = sanitizeString(userSnapshot.get('role')).toLowerCase()

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem publicar o resultado.')
  }
}

type ResolvedCandidate = {
  number: number
  numberStateRefPath: string
  ownerUid: string
  paidAtMs: number | null
  fallbackDirection: 'none' | 'above' | 'below'
}

function normalizePaidStatus(value: unknown): 'pago' | 'disponivel' {
  const normalized = sanitizeString(value).toLowerCase()
  return normalized === 'pago' || normalized === 'paid' ? 'pago' : 'disponivel'
}

function chooseDirectionalCandidate(
  direction: 'above' | 'below',
  current: ResolvedCandidate | null,
  incoming: ResolvedCandidate | null,
): ResolvedCandidate | null {
  if (!incoming) {
    return current
  }
  if (!current) {
    return incoming
  }

  if (direction === 'above') {
    return incoming.number < current.number ? incoming : current
  }

  return incoming.number > current.number ? incoming : current
}

async function findNearestCandidateByStatus(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    targetNumber: number
    rangeStart: number
    rangeEnd: number
    direction: 'above' | 'below'
    statusValue: 'pago' | 'paid'
  },
): Promise<ResolvedCandidate | null> {
  const { campaignId, targetNumber, rangeStart, rangeEnd, direction, statusValue } = params
  const collectionRef = db.collection('numberStates')
  const pageSize = 50
  const maxPages = 20
  let lastNumberCursor: number | null = null

  for (let page = 0; page < maxPages; page += 1) {
    let query = collectionRef
      .where('campaignId', '==', campaignId)
      .where('status', '==', statusValue)

    if (direction === 'above') {
      query = query
        .where('number', '>', targetNumber)
        .where('number', '<=', rangeEnd)
        .orderBy('number', 'asc')
    } else {
      query = query
        .where('number', '>=', rangeStart)
        .where('number', '<', targetNumber)
        .orderBy('number', 'desc')
    }

    if (Number.isInteger(lastNumberCursor)) {
      query = query.startAfter(lastNumberCursor as number)
    }

    const snapshot = await transaction.get(query.limit(pageSize))
    if (snapshot.empty) {
      return null
    }

    for (const document of snapshot.docs) {
      const number = Number(document.get('number'))
      const ownerUid = sanitizeString(document.get('ownerUid'))
      const awardedDrawId = sanitizeString(document.get('awardedDrawId'))

      if (!Number.isInteger(number) || !ownerUid || awardedDrawId) {
        continue
      }

      return {
        number,
        numberStateRefPath: document.ref.path,
        ownerUid,
        paidAtMs: readTimestampMillis(document.get('paidAt')),
        fallbackDirection: direction,
      }
    }

    const lastNumber = Number(snapshot.docs[snapshot.docs.length - 1]?.get('number'))
    if (!Number.isInteger(lastNumber)) {
      return null
    }
    lastNumberCursor = lastNumber
  }

  return null
}

async function findEligiblePaidNumber(
  transaction: Transaction,
  db: Firestore,
  params: {
    campaignId: string
    targetNumber: number
    rangeStart: number
    rangeEnd: number
  },
): Promise<ResolvedCandidate | null> {
  const { campaignId, targetNumber, rangeStart, rangeEnd } = params
  const collectionRef = db.collection('numberStates')

  const exactRef = collectionRef.doc(`${campaignId}_${targetNumber}`)
  const exactSnapshot = await transaction.get(exactRef)
  if (exactSnapshot.exists) {
    const exactStatus = normalizePaidStatus(exactSnapshot.get('status'))
    const exactOwnerUid = sanitizeString(exactSnapshot.get('ownerUid'))
    const exactAwardedDrawId = sanitizeString(exactSnapshot.get('awardedDrawId'))
    if (exactStatus === 'pago' && exactOwnerUid && !exactAwardedDrawId) {
      return {
        number: targetNumber,
        numberStateRefPath: exactRef.path,
        ownerUid: exactOwnerUid,
        paidAtMs: readTimestampMillis(exactSnapshot.get('paidAt')),
        fallbackDirection: 'none',
      }
    }
  }

  let aboveCandidate: ResolvedCandidate | null = null
  let belowCandidate: ResolvedCandidate | null = null

  for (const statusValue of ['pago', 'paid'] as const) {
    const aboveForStatus = await findNearestCandidateByStatus(transaction, db, {
      campaignId,
      targetNumber,
      rangeStart,
      rangeEnd,
      direction: 'above',
      statusValue,
    })
    aboveCandidate = chooseDirectionalCandidate('above', aboveCandidate, aboveForStatus)

    const belowForStatus = await findNearestCandidateByStatus(transaction, db, {
      campaignId,
      targetNumber,
      rangeStart,
      rangeEnd,
      direction: 'below',
      statusValue,
    })
    belowCandidate = chooseDirectionalCandidate('below', belowCandidate, belowForStatus)
  }

  if (belowCandidate && aboveCandidate) {
    const distanceBelow = targetNumber - belowCandidate.number
    const distanceAbove = aboveCandidate.number - targetNumber

    if (distanceBelow !== distanceAbove) {
      return distanceBelow < distanceAbove ? belowCandidate : aboveCandidate
    }

    const belowPaidAtMs = belowCandidate.paidAtMs
    const abovePaidAtMs = aboveCandidate.paidAtMs

    // Empate por distancia: prioriza quem comprou primeiro (paidAt menor).
    if (
      Number.isFinite(belowPaidAtMs)
      && Number.isFinite(abovePaidAtMs)
      && belowPaidAtMs !== abovePaidAtMs
    ) {
      return (belowPaidAtMs as number) < (abovePaidAtMs as number) ? belowCandidate : aboveCandidate
    }

    // Fallback deterministico para empate absoluto.
    return belowCandidate
  }

  if (belowCandidate) {
    return belowCandidate
  }

  if (aboveCandidate) {
    return aboveCandidate
  }

  return null
}

function parseMainRaffleResult(raw: Record<string, unknown> | null | undefined): MainRaffleDrawResult | null {
  if (!raw) {
    return null
  }

  const winnerRaw = asRecord(raw.winner)
  const extractionNumbers = Array.isArray(raw.extractionNumbers)
    ? raw.extractionNumbers.map((item) => sanitizeString(item))
    : []

  const result: MainRaffleDrawResult = {
    campaignId: sanitizeString(raw.campaignId),
    drawId: sanitizeString(raw.drawId),
    drawDate: sanitizeString(raw.drawDate),
    drawPrize: sanitizeString(raw.drawPrize),
    extractionNumbers,
    selectedExtractionIndex: Number(raw.selectedExtractionIndex),
    selectedExtractionNumber: sanitizeString(raw.selectedExtractionNumber),
    raffleRangeStart: Number(raw.raffleRangeStart),
    raffleRangeEnd: Number(raw.raffleRangeEnd),
    raffleTotalNumbers: Number(raw.raffleTotalNumbers),
    moduloTargetOffset: Number(raw.moduloTargetOffset),
    targetNumber: Number(raw.targetNumber),
    targetNumberFormatted: sanitizeString(raw.targetNumberFormatted),
    winningNumber: Number(raw.winningNumber),
    winningNumberFormatted: sanitizeString(raw.winningNumberFormatted),
    fallbackDirection: raw.fallbackDirection === 'above'
      ? 'above'
      : raw.fallbackDirection === 'below'
        ? 'below'
        : 'none',
    winner: {
      userId: sanitizeString(winnerRaw.userId),
      name: sanitizeString(winnerRaw.name) || 'Participante',
      photoURL: sanitizeString(winnerRaw.photoURL),
    },
    publishedAtMs: Number(raw.publishedAtMs),
  }

  if (
    !result.campaignId ||
    !result.drawId ||
    !result.drawDate ||
    !result.drawPrize ||
    result.extractionNumbers.length !== EXTRACTION_COUNT ||
    !Number.isInteger(result.selectedExtractionIndex) ||
    result.selectedExtractionIndex < 1 ||
    result.selectedExtractionIndex > EXTRACTION_COUNT ||
    !result.selectedExtractionNumber ||
    !Number.isInteger(result.targetNumber) ||
    result.targetNumber <= 0 ||
    !Number.isInteger(result.winningNumber) ||
    result.winningNumber <= 0 ||
    !result.winner.userId ||
    !Number.isFinite(result.publishedAtMs)
  ) {
    return null
  }

  return result
}

export function createPublishMainRaffleDrawHandler(db: Firestore) {
  return async (request: { auth?: { uid?: string | null } | null, data: unknown }): Promise<MainRaffleDrawResult> => {
    const uid = requireActiveUid(request.auth)

    await assertAdminRole(db, uid)

  const payload = asRecord(request.data) as PublishMainRaffleDrawInput
  const extractionNumbers = sanitizeExtractionNumbers(payload.extractionNumbers)
  const extractionIndex = sanitizeExtractionIndex(payload.extractionIndex)
  const selectedExtractionNumber = extractionNumbers[extractionIndex - 1]
  if (!selectedExtractionNumber) {
    throw new HttpsError('invalid-argument', 'A extracao usada deve estar preenchida.')
  }
  const selectedExtractionValue = Number(selectedExtractionNumber)

    const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
    const campaignData = campaignSnapshot.data()
    const availableDrawPrizes = buildAvailableDrawPrizes(campaignData)
    const drawPrize = sanitizeDrawPrize(payload.drawPrize, availableDrawPrizes)
    const raffleRange = readCampaignNumberRange(campaignData, CAMPAIGN_DOC_ID)
    if (raffleRange.total <= 0) {
      throw new HttpsError('failed-precondition', 'Campanha sem faixa de numeros configurada.')
    }

    const moduloTargetOffset = selectedExtractionValue % raffleRange.total === 0
      ? raffleRange.total
      : selectedExtractionValue % raffleRange.total
    const targetNumber = raffleRange.start + moduloTargetOffset - 1
    const targetNumberFormatted = String(targetNumber).padStart(7, '0')
    const drawDate = sanitizeOptionalDrawDate(payload.drawDate)
    const publishedAtMs = Date.now()

    const drawRef = db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION).doc()

    try {
      let result: MainRaffleDrawResult | null = null

      await db.runTransaction(async (transaction) => {
        const existingPrizeSnapshot = await transaction.get(
          db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION)
            .where('drawPrize', '==', drawPrize)
            .limit(1),
        )
        if (!existingPrizeSnapshot.empty) {
          throw new HttpsError(
            'failed-precondition',
            'Este premio ja foi sorteado em uma rodada anterior e nao pode ser reutilizado.',
          )
        }

        const candidate = await findEligiblePaidNumber(transaction, db, {
          campaignId: CAMPAIGN_DOC_ID,
          targetNumber,
          rangeStart: raffleRange.start,
          rangeEnd: raffleRange.end,
        })

        if (!candidate) {
          throw new HttpsError(
            'failed-precondition',
            'Nao ha numeros pagos elegiveis para apuracao no momento.',
          )
        }

        const winnerUserSnapshot = await transaction.get(db.collection('users').doc(candidate.ownerUid))
        const winnerUserData = asRecord(winnerUserSnapshot.data())
        const winnerName = formatPublicName(
          sanitizeString(winnerUserData.name) || sanitizeString(winnerUserData.displayName),
          candidate.ownerUid,
        )
        const winnerPhotoURL = sanitizeString(winnerUserData.photoURL)
        const winningNumberFormatted = String(candidate.number).padStart(7, '0')

        result = {
          campaignId: CAMPAIGN_DOC_ID,
          drawId: drawRef.id,
          drawDate,
          drawPrize,
          extractionNumbers,
          selectedExtractionIndex: extractionIndex,
          selectedExtractionNumber,
          raffleRangeStart: raffleRange.start,
          raffleRangeEnd: raffleRange.end,
          raffleTotalNumbers: raffleRange.total,
          moduloTargetOffset,
          targetNumber,
          targetNumberFormatted,
          winningNumber: candidate.number,
          winningNumberFormatted,
          fallbackDirection: candidate.fallbackDirection,
          winner: {
            userId: candidate.ownerUid,
            name: winnerName,
            photoURL: winnerPhotoURL,
          },
          publishedAtMs,
        }

        transaction.set(drawRef, {
          ...result,
          publishedByUid: uid,
          publishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        transaction.set(
          db.doc(candidate.numberStateRefPath),
          {
            awardedDrawId: drawRef.id,
            awardedPrize: drawPrize,
            awardedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )

        transaction.set(
          db.collection('campaigns').doc(CAMPAIGN_DOC_ID),
          {
            latestMainRaffleDraw: {
              ...result,
              publishedByUid: uid,
              publishedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      })

      if (!result) {
        throw new HttpsError('internal', 'Nao foi possivel concluir a apuracao.')
      }

      return result
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }

      const rawMessage = sanitizeString((error as { message?: unknown } | null)?.message)
      const lowerMessage = rawMessage.toLowerCase()

      if (lowerMessage.includes('index') || lowerMessage.includes('requires an index')) {
        throw new HttpsError(
          'failed-precondition',
          rawMessage
            || 'A consulta do sorteio precisa de indice no Firestore. Verifique os logs da funcao para criar o indice sugerido.',
        )
      }

      logger.error('publishMainRaffleDraw failed', {
        error: String(error),
        message: rawMessage,
      })
      throw new HttpsError(
        'internal',
        rawMessage || 'Nao foi possivel publicar o sorteio principal agora.',
      )
    }
  }
}

export function createGetLatestMainRaffleDrawHandler(db: Firestore) {
  return async (): Promise<GetLatestMainRaffleDrawOutput> => {
    try {
      const campaignSnapshot = await db.collection('campaigns').doc(CAMPAIGN_DOC_ID).get()
      const raw = asRecord(campaignSnapshot.get('latestMainRaffleDraw'))
      const result = parseMainRaffleResult(raw)
      if (!result) {
        return {
          hasResult: false,
          result: null,
        }
      }

      return {
        hasResult: true,
        result,
      }
    } catch (error) {
      logger.error('getLatestMainRaffleDraw failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o ultimo sorteio principal.')
    }
  }
}

export function createGetPublicMainRaffleDrawHistoryHandler(db: Firestore) {
  return async (request: { data?: unknown }): Promise<GetMainRaffleDrawHistoryOutput> => {
    const payload = asRecord(request.data) as GetMainRaffleDrawHistoryInput
    const historyLimit = sanitizeHistoryLimit(
      payload.limit,
      MAX_PUBLIC_MAIN_HISTORY_LIMIT,
      DEFAULT_PUBLIC_MAIN_HISTORY_LIMIT,
    )

    try {
      const historySnapshot = await db.collection(MAIN_RAFFLE_DRAW_HISTORY_COLLECTION)
        .orderBy('publishedAtMs', 'desc')
        .limit(historyLimit)
        .get()

      const results = historySnapshot.docs
        .map((documentSnapshot) => parseMainRaffleResult(asRecord(documentSnapshot.data())))
        .filter((item): item is MainRaffleDrawResult => Boolean(item))

      return {
        results,
      }
    } catch (error) {
      logger.error('getPublicMainRaffleDrawHistory failed', {
        error: String(error),
      })
      throw new HttpsError('internal', 'Nao foi possivel carregar o historico do sorteio principal.')
    }
  }
}
