import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { onCall, onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import { REGION } from './lib/constants.js'
import {
  createGetDashboardSummaryHandler,
  createGetPublicCampaignDeadlineHandler,
  createGetPublicSalesSnapshotHandler,
  createUpsertCampaignSettingsHandler,
} from './lib/campaignHandlers.js'
import {
  createGetChampionsRankingHandler,
  createRefreshWeeklyTopBuyersRankingCacheHandler,
  createGetWeeklyTopBuyersRankingHandler,
} from './lib/rankingHandlers.js'
import {
  createGetPublicTopBuyersDrawHistoryHandler,
  createGetMyTopBuyersWinningSummaryHandler,
  createGetTopBuyersDrawHistoryHandler,
  createGetLatestTopBuyersDrawHandler,
  createGetLatestTopBuyersDrawExactCalculationHandler,
  createPublishTopBuyersDrawHandler,
} from './lib/topBuyersDrawHandlers.js'
import {
  createGetLatestMainRaffleDrawHandler,
  createGetPublicMainRaffleDrawHistoryHandler,
  createPublishMainRaffleDrawHandler,
} from './lib/mainRaffleDrawHandlers.js'
import {
  createGetManualNumberSelectionSnapshotHandler,
  createGetPublicNumberLookupHandler,
  createGetNumberChunkWindowHandler,
  createGetNumberWindowHandler,
  createPickRandomAvailableNumbersHandler,
} from './lib/numberHandlers.js'
import {
  createGetBalanceHandler,
  createPixDepositHandler,
  createPixWebhookHandler,
  createRequestWithdrawHandler,
} from './lib/paymentHandlers.js'
import {
  createReleaseReservationHandler,
  createReserveNumbersHandler,
} from './lib/reservationHandlers.js'
import {
  createClearOrderHistoryAdminHandler,
  createCleanupLegacyUserOrdersFieldHandler,
  createGetAdminUserDetailsHandler,
  createSearchAdminUsersHandler,
  createUpdateAdminUserRoleHandler,
} from './lib/userAdminHandlers.js'
import { createEnsureUserProfileHandler } from './lib/userProfileHandlers.js'
import {
  createLoginSimpleAccountHandler,
  createRegisterSimpleAccountHandler,
  createUpdateSimpleProfileHandler,
} from './lib/simpleAuthHandlers.js'

initializeApp()

const db = getFirestore()

const HORSEPAY_CLIENT_KEY = defineSecret('HORSEPAY_CLIENT_KEY')
const HORSEPAY_CLIENT_SECRET = defineSecret('HORSEPAY_CLIENT_SECRET')
const HORSEPAY_WEBHOOK_TOKEN = defineSecret('HORSEPAY_WEBHOOK_TOKEN')

setGlobalOptions({
  region: REGION,
})

const callableOptions = {
  region: REGION,
  cors: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://rifa-online-395d9.web.app',
    'https://rifa-online-395d9.firebaseapp.com',
    'https://jhonnybarber.com.br',
    'https://www.jhonnybarber.com.br',
  ],
}

const functionsRuntimeStartedAtMs = Date.now()

const securedCallableOptions = {
  ...callableOptions,
  secrets: [HORSEPAY_CLIENT_KEY, HORSEPAY_CLIENT_SECRET, HORSEPAY_WEBHOOK_TOKEN],
}

function readSecretValue(secretValue: string, envName: string): string {
  if (secretValue) {
    return secretValue
  }

  const envValue = process.env[envName]
  return typeof envValue === 'string' ? envValue.trim() : ''
}

const horsePaySecrets = {
  getClientKey: () => readSecretValue(HORSEPAY_CLIENT_KEY.value(), 'HORSEPAY_CLIENT_KEY'),
  getClientSecret: () => readSecretValue(HORSEPAY_CLIENT_SECRET.value(), 'HORSEPAY_CLIENT_SECRET'),
  getWebhookToken: () => readSecretValue(HORSEPAY_WEBHOOK_TOKEN.value(), 'HORSEPAY_WEBHOOK_TOKEN'),
}

export const upsertCampaignSettings = onCall(callableOptions, createUpsertCampaignSettingsHandler(db))

export const reserveNumbers = onCall(callableOptions, createReserveNumbersHandler(db))

export const releaseReservation = onCall(callableOptions, createReleaseReservationHandler(db))

export const getNumberWindow = onCall(callableOptions, createGetNumberWindowHandler(db))
export const getNumberChunkWindow = onCall(callableOptions, createGetNumberChunkWindowHandler(db))
export const getManualNumberSelectionSnapshot = onCall(
  callableOptions,
  createGetManualNumberSelectionSnapshotHandler(db),
)

export const getPublicNumberLookup = onCall(callableOptions, createGetPublicNumberLookupHandler(db))

export const pickRandomAvailableNumbers = onCall(
  callableOptions,
  createPickRandomAvailableNumbersHandler(db),
)

export const createPixDeposit = onCall(
  securedCallableOptions,
  createPixDepositHandler(db, horsePaySecrets),
)

export const requestWithdraw = onCall(
  securedCallableOptions,
  createRequestWithdrawHandler(db, horsePaySecrets),
)

export const getBalance = onCall(securedCallableOptions, createGetBalanceHandler(horsePaySecrets))

export const getDashboardSummary = onCall(callableOptions, createGetDashboardSummaryHandler(db))
export const getPublicCampaignDeadline = onCall(callableOptions, createGetPublicCampaignDeadlineHandler(db))
export const getPublicSalesSnapshot = onCall(callableOptions, createGetPublicSalesSnapshotHandler(db))

export const getChampionsRanking = onCall(callableOptions, createGetChampionsRankingHandler(db))
export const getWeeklyTopBuyersRanking = onCall(callableOptions, createGetWeeklyTopBuyersRankingHandler(db))
export const refreshWeeklyTopBuyersRankingCache = onCall(
  callableOptions,
  createRefreshWeeklyTopBuyersRankingCacheHandler(db),
)
export const publishTopBuyersDraw = onCall(callableOptions, createPublishTopBuyersDrawHandler(db))
export const getLatestTopBuyersDraw = onCall(callableOptions, createGetLatestTopBuyersDrawHandler(db))
export const getLatestTopBuyersDrawExactCalculation = onCall(
  callableOptions,
  createGetLatestTopBuyersDrawExactCalculationHandler(db),
)
export const getTopBuyersDrawHistory = onCall(callableOptions, createGetTopBuyersDrawHistoryHandler(db))
export const getPublicTopBuyersDrawHistory = onCall(callableOptions, createGetPublicTopBuyersDrawHistoryHandler(db))
export const getMyTopBuyersWinningSummary = onCall(callableOptions, createGetMyTopBuyersWinningSummaryHandler(db))
export const publishMainRaffleDraw = onCall(callableOptions, createPublishMainRaffleDrawHandler(db))
export const getLatestMainRaffleDraw = onCall(callableOptions, createGetLatestMainRaffleDrawHandler(db))
export const getPublicMainRaffleDrawHistory = onCall(
  callableOptions,
  createGetPublicMainRaffleDrawHistoryHandler(db),
)
export const registerSimpleAccount = onCall(callableOptions, createRegisterSimpleAccountHandler(db))
export const loginSimpleAccount = onCall(callableOptions, createLoginSimpleAccountHandler(db))
export const updateSimpleProfile = onCall(callableOptions, createUpdateSimpleProfileHandler(db))
export const ensureUserProfile = onCall(callableOptions, createEnsureUserProfileHandler(db))
export const searchAdminUsers = onCall(callableOptions, createSearchAdminUsersHandler(db))
export const getAdminUserDetails = onCall(callableOptions, createGetAdminUserDetailsHandler(db))
export const updateAdminUserRole = onCall(callableOptions, createUpdateAdminUserRoleHandler(db))
export const cleanupLegacyUserOrdersField = onCall(callableOptions, createCleanupLegacyUserOrdersFieldHandler(db))
export const clearOrderHistoryAdmin = onCall(callableOptions, createClearOrderHistoryAdminHandler(db))
export const getFunctionsRuntimeInfo = onCall(callableOptions, () => ({
  startedAtMs: functionsRuntimeStartedAtMs,
}))

export const pixWebhook = onRequest(
  { region: REGION, secrets: [HORSEPAY_WEBHOOK_TOKEN] },
  createPixWebhookHandler(db, horsePaySecrets),
)
