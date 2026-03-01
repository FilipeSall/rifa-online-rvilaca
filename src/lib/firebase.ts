import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check'
import { getAuth } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const requiredFirebaseEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const missingEnv = Object.entries(requiredFirebaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missingEnv.length > 0) {
  throw new Error(`Missing Firebase environment variables: ${missingEnv.join(', ')}`)
}

const firebaseConfig: FirebaseOptions = {
  apiKey: requiredFirebaseEnv.VITE_FIREBASE_API_KEY,
  authDomain: requiredFirebaseEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: requiredFirebaseEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: requiredFirebaseEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: requiredFirebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: requiredFirebaseEnv.VITE_FIREBASE_APP_ID,
  measurementId: requiredFirebaseEnv.VITE_FIREBASE_MEASUREMENT_ID,
}

const app = initializeApp(firebaseConfig)
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim()
const appCheckProvider = `${import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER ?? 'v3'}`.trim().toLowerCase() === 'enterprise'
  ? 'enterprise'
  : 'v3'
const appCheckEnabledEnv = `${import.meta.env.VITE_FIREBASE_APPCHECK_ENABLED ?? ''}`.trim().toLowerCase()
// App Check deve ser opt-in para evitar quebrar autenticacao em deploys sem configuracao valida.
const isAppCheckEnabled = appCheckEnabledEnv === 'true'

if (isAppCheckEnabled && !appCheckSiteKey) {
  throw new Error('Missing Firebase environment variable: VITE_FIREBASE_APPCHECK_SITE_KEY')
}

let appCheck: AppCheck | null = null

if (isAppCheckEnabled && appCheckSiteKey) {
  appCheck = initializeAppCheck(app, {
    provider: appCheckProvider === 'enterprise'
      ? new ReCaptchaEnterpriseProvider(appCheckSiteKey)
      : new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

const auth = getAuth(app)
let db: Firestore

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
} catch {
  // Fallback para ambientes sem suporte ao cache persistente.
  db = getFirestore(app)
}

const storage = getStorage(app)
const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'southamerica-east1')

const analyticsPromise = isSupported()
  .then((supported) => (supported ? getAnalytics(app) : null))
  .catch(() => null)

export { app, auth, db, storage, functions, analyticsPromise, firebaseConfig, appCheck }
