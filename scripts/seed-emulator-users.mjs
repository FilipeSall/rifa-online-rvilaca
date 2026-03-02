import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_PROJECT_ID = 'demo-rifa-online'
const DEFAULT_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const DEFAULT_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

const USERS_TO_SEED = [
  {
    email: 'admin@gmail.com',
    password: 'admin123',
    role: 'admin',
    name: 'Admin Local',
  },
  {
    email: 'filipesallesdev@gmail.com',
    password: '199200',
    role: 'admin',
    name: 'Filipe Salles Admin',
  },
  {
    email: 'filipesalles69@gmail.com',
    password: '199200',
    role: 'user',
    name: 'Filipe Salles User',
  },
  {
    email: 'teste@gmail.com',
    password: 'teste123',
    role: 'user',
    name: 'Usuario Teste',
  },
]

function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function ensureLocalEmulatorEnv() {
  process.env.GCLOUD_PROJECT ??= DEFAULT_PROJECT_ID
  process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= DEFAULT_AUTH_EMULATOR_HOST
  process.env.FIRESTORE_EMULATOR_HOST ??= DEFAULT_FIRESTORE_EMULATOR_HOST

  const projectId = process.env.GCLOUD_PROJECT
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST

  const localHosts = ['127.0.0.1', 'localhost']
  const authHostName = authHost.split(':')[0]
  const firestoreHostName = firestoreHost.split(':')[0]

  if (!localHosts.includes(authHostName) || !localHosts.includes(firestoreHostName)) {
    throw new Error(
      `Seed abortado: hosts de emulator invalidos (auth=${authHost}, firestore=${firestoreHost}).`,
    )
  }

  if (projectId !== DEFAULT_PROJECT_ID) {
    throw new Error(
      `Seed abortado: projeto esperado ${DEFAULT_PROJECT_ID}, recebido ${projectId}.`,
    )
  }

  return projectId
}

function ensureAdminApp(projectId) {
  if (!getApps().length) {
    initializeApp({ projectId })
  }
}

async function upsertAuthUser(auth, user) {
  try {
    const existing = await auth.getUserByEmail(user.email)
    const updated = await auth.updateUser(existing.uid, {
      email: user.email,
      password: user.password,
      displayName: user.name,
      emailVerified: true,
      disabled: false,
    })

    return {
      uid: updated.uid,
      created: false,
    }
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : ''
    if (code !== 'auth/user-not-found') {
      throw error
    }

    const created = await auth.createUser({
      email: user.email,
      password: user.password,
      displayName: user.name,
      emailVerified: true,
      disabled: false,
    })

    return {
      uid: created.uid,
      created: true,
    }
  }
}

async function upsertUserProfileDoc(db, user, uid) {
  const email = user.email.toLowerCase().trim()
  const nameSearch = normalizeSearchText(user.name)
  const emailSearch = normalizeSearchText(email)

  await db.collection('users').doc(uid).set(
    {
      uid,
      name: user.name,
      email,
      role: user.role,
      providerIds: ['password'],
      photoURL: null,
      nameSearch,
      emailSearch,
      cpfSearch: null,
      phoneSearch: null,
      createdAtAuth: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: null,
      seededBy: 'scripts/seed-emulator-users.mjs',
    },
    { merge: true },
  )
}

export async function seedEmulatorUsers() {
  const projectId = ensureLocalEmulatorEnv()
  ensureAdminApp(projectId)

  const auth = getAuth()
  const db = getFirestore()

  for (const user of USERS_TO_SEED) {
    const result = await upsertAuthUser(auth, user)

    await auth.setCustomUserClaims(result.uid, {
      role: user.role,
    })

    await upsertUserProfileDoc(db, user, result.uid)

    console.log(`${result.created ? 'created' : 'updated'} user ${user.email} (${user.role}) uid=${result.uid}`)
  }

  console.log('Seed de usuarios do emulator concluido com sucesso.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedEmulatorUsers().catch((error) => {
    console.error('Falha ao seedar usuarios do emulator:', error)
    process.exitCode = 1
  })
}
