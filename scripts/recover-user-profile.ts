import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type RecoverOptions = {
  dryRun: boolean
  orderId: string | null
  uid: string | null
  email: string | null
  name: string | null
  cpf: string | null
  phone: string | null
  skipAuthLookup: boolean
}

type OrderProfileData = {
  uid: string | null
  payerName: string | null
  payerCpf: string | null
  payerPhone: string | null
}

const DEFAULT_PAYER_NAME = 'jeferson silverio do nascimento jefusca'
const DEFAULT_PAYER_CPF = '10343082624'
const DEFAULT_PAYER_PHONE = '34991382125'

function printUsage() {
  console.log([
    'Recover user profile into Firestore users/{uid} and cpfRegistry/{cpf}.',
    '',
    'Required:',
    '  FIREBASE_SERVICE_ACCOUNT_PATH=<path-to-service-account.json>',
    '',
    'Usage:',
    '  bun run scripts/recover-user-profile.ts --order-id <ORDER_ID>',
    '  bun run scripts/recover-user-profile.ts --uid <UID> [--name ... --cpf ... --phone ... --email ...]',
    '',
    'Options:',
    '  --order-id <id>     Read uid/name/cpf/phone from orders/{id}',
    '  --uid <uid>         Force target uid (overrides order userId)',
    '  --name <name>       Force profile name',
    '  --cpf <cpf>         Force CPF (11 digits)',
    '  --phone <phone>     Force phone',
    '  --email <email>     Force email',
    '  --skip-auth         Skip Firebase Auth lookup',
    '  --confirm           Apply writes (default is dry-run)',
    '  --help              Show help',
  ].join('\n'))
}

function findArgValue(argv: string[], ...names: string[]) {
  for (const name of names) {
    const index = argv.findIndex((item) => item === name)
    if (index >= 0) {
      return argv[index + 1] ?? null
    }
  }

  return null
}

function sanitizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

function sanitizeCpf(value: unknown) {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  const digits = normalized.replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

function sanitizePhone(value: unknown) {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  const digits = normalized.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) {
    return null
  }

  return digits
}

function sanitizeEmail(value: unknown) {
  const normalized = sanitizeString(value)
  if (!normalized) {
    return null
  }

  const lower = normalized.toLowerCase()
  if (!lower.includes('@')) {
    return null
  }

  return lower
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buildUserSearchFields(params: {
  name?: string | null
  email?: string | null
  cpf?: string | null
  phone?: string | null
}) {
  const output: Record<string, string | null> = {}

  if ('name' in params) {
    output.nameSearch = params.name ? normalizeSearchText(params.name) : null
  }

  if ('email' in params) {
    output.emailSearch = params.email ? normalizeSearchText(params.email) : null
  }

  if ('cpf' in params) {
    output.cpfSearch = params.cpf ? params.cpf.replace(/\D/g, '') : null
  }

  if ('phone' in params) {
    output.phoneSearch = params.phone ? params.phone.replace(/\D/g, '') : null
  }

  return output
}

function parseArgs(argv: string[]): RecoverOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage()
    process.exit(0)
  }

  const dryRun = !argv.includes('--confirm')
  const orderId = sanitizeString(findArgValue(argv, '--order-id', '--order'))
  const uid = sanitizeString(findArgValue(argv, '--uid'))
  const email = sanitizeEmail(findArgValue(argv, '--email'))
  const name = sanitizeString(findArgValue(argv, '--name'))
  const cpf = sanitizeCpf(findArgValue(argv, '--cpf'))
  const phone = sanitizePhone(findArgValue(argv, '--phone'))
  const skipAuthLookup = argv.includes('--skip-auth')

  if (!orderId && !uid) {
    throw new Error('Informe --order-id <id> ou --uid <uid>.')
  }

  return {
    dryRun,
    orderId,
    uid,
    email,
    name,
    cpf,
    phone,
    skipAuthLookup,
  }
}

function getServiceAccount() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (!serviceAccountPath) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_PATH')
  }

  const absolutePath = resolve(process.cwd(), serviceAccountPath)
  const raw = readFileSync(absolutePath, 'utf8')
  const parsed = JSON.parse(raw) as ServiceAccount

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid service account JSON. Expected project_id, client_email and private_key.')
  }

  return parsed
}

function parseAuthCreationTime(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return Timestamp.fromDate(parsed)
}

async function readOrderProfile(orderId: string): Promise<OrderProfileData> {
  const orderRef = db.collection('orders').doc(orderId)
  const orderSnapshot = await orderRef.get()

  if (!orderSnapshot.exists) {
    throw new Error(`Pedido ${orderId} nao encontrado em orders.`)
  }

  const data = orderSnapshot.data() || {}
  return {
    uid: sanitizeString(data.userId),
    payerName: sanitizeString(data.payerName),
    payerCpf: sanitizeCpf(data.payerCpf),
    payerPhone: sanitizePhone(data.payerPhone),
  }
}

const options = parseArgs(process.argv.slice(2))
const serviceAccount = getServiceAccount()
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
    projectId,
  })
}

const db = getFirestore()
const auth = getAuth()

async function run() {
  let orderData: OrderProfileData = {
    uid: null,
    payerName: null,
    payerCpf: null,
    payerPhone: null,
  }

  if (options.orderId) {
    orderData = await readOrderProfile(options.orderId)
  }

  const uid = options.uid || orderData.uid
  if (!uid) {
    throw new Error('Nao foi possivel resolver uid. Use --uid ou informe um --order-id com userId.')
  }

  let authRecord: Awaited<ReturnType<typeof auth.getUser>> | null = null

  if (!options.skipAuthLookup) {
    try {
      authRecord = await auth.getUser(uid)
    } catch (error) {
      console.warn(`Auth user ${uid} nao encontrado ou sem permissao de leitura. Continuando sem dados do Auth.`)
    }
  }

  const email = options.email || sanitizeEmail(authRecord?.email) || null
  const cpf = options.cpf || orderData.payerCpf || DEFAULT_PAYER_CPF
  const phone = options.phone || orderData.payerPhone || sanitizePhone(authRecord?.phoneNumber) || DEFAULT_PAYER_PHONE
  const name =
    options.name
    || orderData.payerName
    || sanitizeString(authRecord?.displayName)
    || (email ? sanitizeString(email.split('@')[0]) : null)
    || DEFAULT_PAYER_NAME

  if (!cpf) {
    throw new Error('CPF invalido ou ausente. Informe --cpf com 11 digitos.')
  }

  if (!name) {
    throw new Error('Nome invalido ou ausente. Informe --name.')
  }

  const providerIds = Array.from(
    new Set(
      (authRecord?.providerData || [])
        .map((provider) => sanitizeString(provider.providerId))
        .filter((value): value is string => Boolean(value)),
    ),
  )

  const createdAtAuth = parseAuthCreationTime(authRecord?.metadata?.creationTime || null)
  const userRef = db.collection('users').doc(uid)
  const cpfRef = db.collection('cpfRegistry').doc(cpf)
  const cpfSnapshot = await cpfRef.get()

  if (cpfSnapshot.exists) {
    const existingUid = sanitizeString(cpfSnapshot.get('uid'))
    if (existingUid && existingUid !== uid) {
      throw new Error(`CPF ${cpf} ja pertence ao uid ${existingUid} em cpfRegistry.`)
    }
  }

  const profilePayload = {
    uid,
    name,
    email,
    ...buildUserSearchFields({
      name,
      email,
      cpf,
      phone,
    }),
    ...(phone ? { phone } : {}),
    cpf,
    role: 'user',
    photoURL: sanitizeString(authRecord?.photoURL) || null,
    providerIds,
    createdAtAuth: createdAtAuth || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  }

  console.log(`Project: ${projectId}`)
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (no writes)' : 'CONFIRMED (writes enabled)'}`)
  console.log(`Target uid: ${uid}`)
  console.log(`Source order: ${options.orderId || '(not provided)'}`)
  console.log(`Resolved name: ${name}`)
  console.log(`Resolved cpf: ${cpf}`)
  console.log(`Resolved phone: ${phone || '(null)'}`)
  console.log(`Resolved email: ${email || '(null)'}`)
  console.log(`Auth providers: ${providerIds.length > 0 ? providerIds.join(', ') : '(none)'}`)
  console.log(`CPF registry exists: ${cpfSnapshot.exists ? 'yes' : 'no'}`)

  if (options.dryRun) {
    console.log('\nDry-run payload preview (timestamps omitted):')
    console.log(JSON.stringify({
      ...profilePayload,
      createdAtAuth: createdAtAuth ? createdAtAuth.toDate().toISOString() : '[serverTimestamp]',
      updatedAt: '[serverTimestamp]',
      lastLoginAt: '[serverTimestamp]',
    }, null, 2))
    console.log('\nDry-run complete. Use --confirm to apply.')
    return
  }

  const batch = db.batch()

  batch.set(userRef, profilePayload, { merge: true })
  if (!cpfSnapshot.exists) {
    batch.set(cpfRef, {
      uid,
      cpf,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  console.log('Perfil criado/atualizado com sucesso.')
}

run().catch((error) => {
  console.error('recover-user-profile failed:', error)
  process.exit(1)
})
