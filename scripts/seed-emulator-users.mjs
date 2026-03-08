import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_PROJECT_ID = 'demo-rifa-online'
const DEFAULT_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
const DEFAULT_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const SEEDED_BY = 'scripts/seed-emulator-users.mjs'

const USERS_TO_SEED = [
  {
    cpf: '00000000000',
    phone: '99999999999',
    role: 'admin',
    name: 'Admin Local',
  },
  {
    cpf: '11111111111',
    phone: '98911111111',
    role: 'user',
    name: 'Usuario Seed 01',
  },
  {
    cpf: '22222222222',
    phone: '98922222222',
    role: 'user',
    name: 'Usuario Seed 02',
  },
]

function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeDigits(value) {
  return `${value || ''}`.replace(/\D/g, '')
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
  const [cpfSnapshot, phoneSnapshot] = await Promise.all([
    db.collection('cpfRegistry').doc(cpf).get(),
    db.collection('phoneRegistry').doc(phone).get(),
  ])

  const cpfUid = cpfSnapshot.exists ? `${cpfSnapshot.data()?.uid || ''}`.trim() : ''
  const phoneUid = phoneSnapshot.exists ? `${phoneSnapshot.data()?.uid || ''}`.trim() : ''

  if (cpfUid && phoneUid && cpfUid !== phoneUid) {
    throw new Error(`Conflito de registry para CPF ${cpf} e telefone ${phone}.`)
  }

  return cpfUid || phoneUid || null
}

async function ensureAuthUser(auth, preferredUid, name, deterministicUid) {
  const uid = preferredUid || deterministicUid
  try {
    const existing = await auth.getUser(uid)
    await auth.updateUser(existing.uid, {
      displayName: name,
      disabled: false,
    })

    return {
      uid: existing.uid,
      created: false,
    }
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : ''
    if (code !== 'auth/user-not-found') {
      throw error
    }

    const created = await auth.createUser({
      uid,
      displayName: name,
      disabled: false,
    })

    return {
      uid: created.uid,
      created: true,
    }
  }
}

async function cleanupUidRegistries(db, uid, cpf, phone) {
  const [cpfSnapshot, phoneSnapshot] = await Promise.all([
    db.collection('cpfRegistry').where('uid', '==', uid).get(),
    db.collection('phoneRegistry').where('uid', '==', uid).get(),
  ])

  const cleanupBatch = db.batch()
  for (const documentSnapshot of cpfSnapshot.docs) {
    if (documentSnapshot.id !== cpf) {
      cleanupBatch.delete(documentSnapshot.ref)
    }
  }

  for (const documentSnapshot of phoneSnapshot.docs) {
    if (documentSnapshot.id !== phone) {
      cleanupBatch.delete(documentSnapshot.ref)
    }
  }

  await cleanupBatch.commit()
}

async function upsertUserProfileDoc(db, user, uid) {
  const nameSearch = normalizeSearchText(user.name)
  const cpf = normalizeDigits(user.cpf)
  const phone = normalizeDigits(user.phone)

  await cleanupUidRegistries(db, uid, cpf, phone)

  await Promise.all([
    db.collection('cpfRegistry').doc(cpf).set({
      uid,
      cpf,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    db.collection('phoneRegistry').doc(phone).set({
      uid,
      phone,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    db.collection('users').doc(uid).set({
      uid,
      name: user.name,
      email: null,
      cpf,
      phone,
      role: user.role,
      providerIds: ['custom'],
      photoURL: null,
      nameSearch,
      emailSearch: null,
      cpfSearch: cpf,
      phoneSearch: phone,
      createdAtAuth: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: null,
      seededBy: SEEDED_BY,
    }, { merge: true }),
  ])
}

export async function seedEmulatorUsers() {
  const projectId = ensureLocalEmulatorEnv()
  ensureAdminApp(projectId)

  const auth = getAuth()
  const db = getFirestore()

  for (const user of USERS_TO_SEED) {
    const cpf = normalizeDigits(user.cpf)
    const phone = normalizeDigits(user.phone)

    if (cpf.length !== 11) {
      throw new Error(`CPF invalido no seed: "${user.cpf}"`)
    }

    if (phone.length < 10 || phone.length > 11) {
      throw new Error(`Telefone invalido no seed: "${user.phone}"`)
    }

    const preferredUid = await resolveUidFromRegistry(db, cpf, phone)
    const deterministicUid = `emu-${cpf}`
    const result = await ensureAuthUser(auth, preferredUid, user.name, deterministicUid)

    await auth.setCustomUserClaims(result.uid, {
      role: user.role,
    })

    await upsertUserProfileDoc(db, user, result.uid)

    console.log(
      `${result.created ? 'created' : 'updated'} user cpf=${cpf} phone=${phone} role=${user.role} uid=${result.uid}`,
    )
  }

  console.log('Seed de usuarios do emulator concluido com sucesso.')
  console.log('Admin local: CPF 00000000000 | Telefone 99999999999')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedEmulatorUsers().catch((error) => {
    console.error('Falha ao seedar usuarios do emulator:', error)
    process.exitCode = 1
  })
}
