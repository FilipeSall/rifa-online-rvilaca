import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_PROJECT_ID = 'demo-rifa-online'
const DEFAULT_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const DEFAULT_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const SEEDED_BY = 'scripts/seed-emulator-admin-simple.mjs'

const DEFAULT_ADMIN_NAME = 'Admin Fake Local'
const DEFAULT_ADMIN_CPF = '00000000000'
const DEFAULT_ADMIN_PHONE = '99999999999'

function normalizeDigits(value) {
  return `${value || ''}`.replace(/\D/g, '')
}

function normalizeSearchText(value) {
  return `${value || ''}`
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

async function resolveUidFromRegistry(db, cpf, phone) {
  const [cpfSnap, phoneSnap] = await Promise.all([
    db.collection('cpfRegistry').doc(cpf).get(),
    db.collection('phoneRegistry').doc(phone).get(),
  ])

  const cpfUid = cpfSnap.exists ? `${cpfSnap.data()?.uid || ''}`.trim() : ''
  const phoneUid = phoneSnap.exists ? `${phoneSnap.data()?.uid || ''}`.trim() : ''

  if (cpfUid && phoneUid && cpfUid !== phoneUid) {
    throw new Error(`Conflito: cpfRegistry(${cpf}) uid=${cpfUid} e phoneRegistry(${phone}) uid=${phoneUid}.`)
  }

  return cpfUid || phoneUid || null
}

async function resolveUidFromPreviousSeed(db) {
  const snapshot = await db.collection('users')
    .where('seededBy', '==', SEEDED_BY)
    .limit(1)
    .get()

  if (snapshot.empty) {
    return null
  }

  return snapshot.docs[0].id
}

async function ensureAuthUser(auth, preferredUid, name) {
  if (preferredUid) {
    try {
      const existing = await auth.getUser(preferredUid)
      await auth.updateUser(existing.uid, {
        displayName: name,
        disabled: false,
      })
      return existing.uid
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : ''
      if (code !== 'auth/user-not-found') {
        throw error
      }

      const created = await auth.createUser({
        uid: preferredUid,
        displayName: name,
        disabled: false,
      })
      return created.uid
    }
  }

  const created = await auth.createUser({
    displayName: name,
    disabled: false,
  })
  return created.uid
}

async function upsertAdminProfile(db, uid, name, cpf, phone) {
  const previousCpfByUidSnapshot = await db.collection('cpfRegistry')
    .where('uid', '==', uid)
    .get()
  const previousPhoneByUidSnapshot = await db.collection('phoneRegistry')
    .where('uid', '==', uid)
    .get()

  const cleanupBatch = db.batch()
  for (const documentSnapshot of previousCpfByUidSnapshot.docs) {
    if (documentSnapshot.id !== cpf) {
      cleanupBatch.delete(documentSnapshot.ref)
    }
  }
  for (const documentSnapshot of previousPhoneByUidSnapshot.docs) {
    if (documentSnapshot.id !== phone) {
      cleanupBatch.delete(documentSnapshot.ref)
    }
  }
  await cleanupBatch.commit()

  await db.collection('cpfRegistry').doc(cpf).set({
    uid,
    cpf,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db.collection('phoneRegistry').doc(phone).set({
    uid,
    phone,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  await db.collection('users').doc(uid).set({
    uid,
    name,
    email: null,
    cpf,
    phone,
    role: 'admin',
    providerIds: ['custom'],
    photoURL: null,
    nameSearch: normalizeSearchText(name),
    emailSearch: null,
    cpfSearch: cpf,
    phoneSearch: phone,
    createdAtAuth: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: null,
    seededBy: SEEDED_BY,
  }, { merge: true })
}

export async function seedEmulatorAdminSimple() {
  const projectId = ensureLocalEmulatorEnv()
  ensureAdminApp(projectId)

  const name = `${process.env.ADMIN_FAKE_NAME || DEFAULT_ADMIN_NAME}`.trim()
  const cpf = normalizeDigits(process.env.ADMIN_FAKE_CPF || DEFAULT_ADMIN_CPF)
  const phone = normalizeDigits(process.env.ADMIN_FAKE_PHONE || DEFAULT_ADMIN_PHONE)

  if (name.length < 2) {
    throw new Error('ADMIN_FAKE_NAME invalido.')
  }

  if (cpf.length !== 11) {
    throw new Error(`ADMIN_FAKE_CPF invalido: "${cpf}". Esperado 11 digitos.`)
  }

  if (phone.length < 10 || phone.length > 11) {
    throw new Error(`ADMIN_FAKE_PHONE invalido: "${phone}". Esperado 10 ou 11 digitos.`)
  }

  const auth = getAuth()
  const db = getFirestore()

  const preferredUid = await resolveUidFromRegistry(db, cpf, phone)
    || await resolveUidFromPreviousSeed(db)
  const uid = await ensureAuthUser(auth, preferredUid, name)

  await auth.setCustomUserClaims(uid, { role: 'admin' })
  await upsertAdminProfile(db, uid, name, cpf, phone)

  console.log('Conta admin fake pronta no emulator:')
  console.log(`- UID: ${uid}`)
  console.log(`- Nome: ${name}`)
  console.log(`- CPF (login): ${cpf}`)
  console.log(`- Telefone (login): ${phone}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedEmulatorAdminSimple().catch((error) => {
    console.error('Falha ao seedar admin fake no emulator:', error)
    process.exitCode = 1
  })
}
