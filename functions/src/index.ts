import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { onCall, onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'
import { REGION } from './lib/constants.js'
import {
  createGetDashboardSummaryHandler,
  createUpsertCampaignSettingsHandler,
} from './lib/campaignHandlers.js'
import {
  createGetNumberWindowHandler,
  createPickRandomAvailableNumbersHandler,
} from './lib/numberHandlers.js'
import {
  createGetBalanceHandler,
  createPixDepositHandler,
  createPixWebhookHandler,
  createRequestWithdrawHandler,
} from './lib/paymentHandlers.js'
import { createReserveNumbersHandler } from './lib/reservationHandlers.js'

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
  ],
}

const securedCallableOptions = {
  ...callableOptions,
  secrets: [HORSEPAY_CLIENT_KEY, HORSEPAY_CLIENT_SECRET, HORSEPAY_WEBHOOK_TOKEN],
}

const horsePaySecrets = {
  getClientKey: () => HORSEPAY_CLIENT_KEY.value(),
  getClientSecret: () => HORSEPAY_CLIENT_SECRET.value(),
  getWebhookToken: () => HORSEPAY_WEBHOOK_TOKEN.value(),
}

export const upsertCampaignSettings = onCall(callableOptions, createUpsertCampaignSettingsHandler(db))

export const reserveNumbers = onCall(callableOptions, createReserveNumbersHandler(db))

export const getNumberWindow = onCall(callableOptions, createGetNumberWindowHandler(db))

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

export const pixWebhook = onRequest(
  { region: REGION, secrets: [HORSEPAY_WEBHOOK_TOKEN] },
  createPixWebhookHandler(db, horsePaySecrets),
)
