import { mkdirSync, createWriteStream, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import {
  FieldPath,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
}

type UserProfile = {
  uid: string
  name: string
  cpf: string | null
  phone: string | null
}

type CliOptions = {
  campaignId: string | null
  outputDir: string
  summaryFileName: string
  detailsFileName: string
  onlyWithPurchases: boolean
  includeAllStatuses: boolean
  recoverLegacyNumbers: boolean
  batchSize: number
}

const DEFAULT_OUTPUT_DIR = 'tmp/reports'
const DEFAULT_SUMMARY_FILENAME = 'users-purchased-numbers-summary.csv'
const DEFAULT_DETAILS_FILENAME = 'users-purchased-numbers-detailed.csv'
const DEFAULT_BATCH_SIZE = 400
const MIN_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 1000

function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function extractDigits(value: unknown): string {
  return sanitizeString(value).replace(/\D/g, '')
}

function sanitizeCpf(value: unknown): string | null {
  const digits = extractDigits(value)
  return digits || null
}

function sanitizePhone(value: unknown): string | null {
  const digits = extractDigits(value)
  return digits || null
}

function sanitizeName(value: unknown): string {
  const normalized = sanitizeString(value)
  return normalized || 'Usuario'
}

function parseOrderNumberCandidate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  const digits = extractDigits(value)
  if (!digits) {
    return null
  }

  const parsed = Number(digits)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function sanitizeNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  const output = new Set<number>()
  for (const item of value) {
    const parsed = parseOrderNumberCandidate(item)
    if (parsed !== null) {
      output.add(parsed)
    }
  }

  return Array.from(output).sort((a, b) => a - b)
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const raw = String(value)
  if (!/[",\n\r]/.test(raw)) {
    return raw
  }

  return `"${raw.replace(/"/g, '""')}"`
}

function toCsvLine(cells: unknown[]): string {
  return `${cells.map((cell) => csvCell(cell)).join(',')}\n`
}

function findArgValue(argv: string[], ...names: string[]): string | null {
  for (const name of names) {
    const index = argv.findIndex((item) => item === name)
    if (index >= 0) {
      const next = argv[index + 1]
      if (next && !next.startsWith('--')) {
        return next
      }
      return null
    }
  }

  return null
}

function hasFlag(argv: string[], ...names: string[]): boolean {
  return names.some((name) => argv.includes(name))
}

function sanitizeBatchSize(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return DEFAULT_BATCH_SIZE
  }

  return Math.max(MIN_BATCH_SIZE, Math.min(parsed, MAX_BATCH_SIZE))
}

function printHelp() {
  console.log([
    'Exporta relatorio completo de usuarios (cpf, nome, telefone) com numeros comprados.',
    '',
    'Requisitos de ambiente:',
    '  FIREBASE_SERVICE_ACCOUNT_PATH=<caminho-do-service-account.json>',
    '  FIREBASE_PROJECT_ID=<opcional, sobrescreve project_id do service account>',
    '',
    'Uso:',
    '  bun run scripts/export-users-purchased-numbers.ts [opcoes]',
    '',
    'Opcoes:',
    '  --campaign-id <id>           Filtra pedidos por campanha',
    `  --output-dir <dir>           Diretorio de saida (default: ${DEFAULT_OUTPUT_DIR})`,
    `  --summary-file <nome.csv>    Nome do CSV resumo (default: ${DEFAULT_SUMMARY_FILENAME})`,
    `  --details-file <nome.csv>    Nome do CSV detalhado (default: ${DEFAULT_DETAILS_FILENAME})`,
    '  --only-with-purchases        Inclui no resumo apenas usuarios com numero comprado',
    '  --include-all-statuses       Nao restringe para pedidos paid',
    '  --no-legacy-recovery         Nao tenta recuperar numeros de orders/{id}/numbers',
    `  --batch-size <n>             Tamanho de pagina (default: ${DEFAULT_BATCH_SIZE}, min: ${MIN_BATCH_SIZE}, max: ${MAX_BATCH_SIZE})`,
    '  --help                        Exibe esta ajuda',
  ].join('\n'))
}

function parseCliOptions(argv: string[]): CliOptions {
  if (hasFlag(argv, '--help', '-h')) {
    printHelp()
    process.exit(0)
  }

  const campaignId = sanitizeString(findArgValue(argv, '--campaign-id')) || null
  const outputDir = sanitizeString(findArgValue(argv, '--output-dir')) || DEFAULT_OUTPUT_DIR
  const summaryFileName = sanitizeString(findArgValue(argv, '--summary-file')) || DEFAULT_SUMMARY_FILENAME
  const detailsFileName = sanitizeString(findArgValue(argv, '--details-file')) || DEFAULT_DETAILS_FILENAME
  const batchSize = sanitizeBatchSize(findArgValue(argv, '--batch-size'))

  return {
    campaignId,
    outputDir,
    summaryFileName,
    detailsFileName,
    onlyWithPurchases: hasFlag(argv, '--only-with-purchases'),
    includeAllStatuses: hasFlag(argv, '--include-all-statuses'),
    recoverLegacyNumbers: !hasFlag(argv, '--no-legacy-recovery'),
    batchSize,
  }
}

function getServiceAccount() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (!serviceAccountPath) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_PATH')
  }

  const absolutePath = resolve(process.cwd(), serviceAccountPath)
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8')) as ServiceAccount

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid service account JSON. Expected project_id, client_email and private_key.')
  }

  return parsed
}

function readTimestampIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return new Date(value.toMillis()).toISOString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString()
  }

  if (
    typeof value === 'object'
    && value !== null
    && 'toMillis' in value
    && typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      const ms = Number((value as { toMillis: () => number }).toMillis())
      if (Number.isFinite(ms) && ms > 0) {
        return new Date(ms).toISOString()
      }
    } catch {
      return ''
    }
  }

  return ''
}

async function readLegacyOrderNumbers(orderRef: DocumentReference<DocumentData>): Promise<number[]> {
  const snapshot = await orderRef.collection('numbers')
    .select('number', 'ticketNumber', 'numero', 'value')
    .get()

  const recovered = new Set<number>()

  for (const document of snapshot.docs) {
    const data = document.data()
    const candidates = [
      data.number,
      data.ticketNumber,
      data.numero,
      data.value,
      document.id,
    ]

    for (const candidate of candidates) {
      const parsed = parseOrderNumberCandidate(candidate)
      if (parsed !== null) {
        recovered.add(parsed)
        break
      }
    }
  }

  return Array.from(recovered).sort((a, b) => a - b)
}

async function readUsersInPages(db: ReturnType<typeof getFirestore>, batchSize: number) {
  const users = new Map<string, UserProfile>()
  let scannedUsers = 0
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null

  for (;;) {
    let query = db.collection('users')
      .orderBy(FieldPath.documentId())
      .limit(batchSize)

    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    scannedUsers += snapshot.size

    for (const document of snapshot.docs) {
      const data = document.data()
      users.set(document.id, {
        uid: document.id,
        name: sanitizeName(data.name),
        cpf: sanitizeCpf(data.cpf),
        phone: sanitizePhone(data.phone),
      })
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
    if (snapshot.size < batchSize) {
      break
    }
  }

  return { users, scannedUsers }
}

async function run() {
  const options = parseCliOptions(process.argv.slice(2))
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

  console.log(`Project: ${projectId}`)
  console.log(`Campaign filter: ${options.campaignId || '(all)'}`)
  console.log(`Statuses: ${options.includeAllStatuses ? 'all' : 'paid only'}`)
  console.log(`Legacy recovery: ${options.recoverLegacyNumbers ? 'enabled' : 'disabled'}`)

  const outputDir = resolve(process.cwd(), options.outputDir)
  mkdirSync(outputDir, { recursive: true })

  const summaryFilePath = resolve(outputDir, options.summaryFileName)
  const detailsFilePath = resolve(outputDir, options.detailsFileName)

  const detailsStream = createWriteStream(detailsFilePath, { encoding: 'utf8' })
  detailsStream.write(toCsvLine([
    'uid',
    'cpf',
    'nome',
    'telefone',
    'numero',
    'order_id',
    'campaign_id',
    'order_status',
    'order_type',
    'order_created_at_iso',
  ]))

  const { users, scannedUsers } = await readUsersInPages(db, options.batchSize)
  console.log(`Users scanned: ${scannedUsers}`)

  const numbersByUser = new Map<string, Set<number>>()

  let scannedOrders = 0
  let ordersWithoutUserId = 0
  let ordersWithLegacyRecovery = 0
  let numbersRecoveredFromLegacy = 0
  let detailsRows = 0

  let ordersQuery: Query<DocumentData> = db.collection('orders')
  ordersQuery = ordersQuery.where('type', '==', 'deposit')

  if (!options.includeAllStatuses) {
    ordersQuery = ordersQuery.where('status', '==', 'paid')
  }

  if (options.campaignId) {
    ordersQuery = ordersQuery.where('campaignId', '==', options.campaignId)
  }

  ordersQuery = ordersQuery.select(
    'userId',
    'status',
    'type',
    'campaignId',
    'createdAt',
    'reservedNumbers',
    'payerName',
    'payerCpf',
    'payerPhone',
  )

  let lastOrderDoc: QueryDocumentSnapshot<DocumentData> | null = null

  for (;;) {
    let query = ordersQuery
      .orderBy(FieldPath.documentId())
      .limit(options.batchSize)

    if (lastOrderDoc) {
      query = query.startAfter(lastOrderDoc)
    }

    const snapshot = await query.get()
    if (snapshot.empty) {
      break
    }

    scannedOrders += snapshot.size

    for (const orderDoc of snapshot.docs) {
      const orderData = orderDoc.data()
      const userId = sanitizeString(orderData.userId)

      if (!userId) {
        ordersWithoutUserId += 1
        continue
      }

      if (!users.has(userId)) {
        users.set(userId, {
          uid: userId,
          name: sanitizeName(orderData.payerName),
          cpf: sanitizeCpf(orderData.payerCpf),
          phone: sanitizePhone(orderData.payerPhone),
        })
      }

      let numbers = sanitizeNumbers(orderData.reservedNumbers)

      if (numbers.length === 0 && options.recoverLegacyNumbers) {
        const recovered = await readLegacyOrderNumbers(orderDoc.ref)
        if (recovered.length > 0) {
          numbers = recovered
          ordersWithLegacyRecovery += 1
          numbersRecoveredFromLegacy += recovered.length
        }
      }

      if (numbers.length === 0) {
        continue
      }

      const userNumbers = numbersByUser.get(userId) || new Set<number>()
      for (const number of numbers) {
        userNumbers.add(number)
      }
      numbersByUser.set(userId, userNumbers)

      const profile = users.get(userId) as UserProfile
      const orderStatus = sanitizeString(orderData.status).toLowerCase()
      const orderType = sanitizeString(orderData.type).toLowerCase()
      const campaignId = sanitizeString(orderData.campaignId)
      const orderCreatedAtIso = readTimestampIso(orderData.createdAt)

      for (const number of numbers) {
        detailsStream.write(toCsvLine([
          profile.uid,
          profile.cpf || '',
          profile.name,
          profile.phone || '',
          number,
          orderDoc.id,
          campaignId,
          orderStatus,
          orderType,
          orderCreatedAtIso,
        ]))
        detailsRows += 1
      }
    }

    lastOrderDoc = snapshot.docs[snapshot.docs.length - 1] || null
    if (snapshot.size < options.batchSize) {
      break
    }
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    detailsStream.end((error:unknown) => {
      if (error) {
        rejectPromise(error)
        return
      }
      resolvePromise()
    })
  })

  const summaryStream = createWriteStream(summaryFilePath, { encoding: 'utf8' })
  summaryStream.write(toCsvLine([
    'uid',
    'cpf',
    'nome',
    'telefone',
    'total_numeros_comprados',
    'numeros_comprados',
  ]))

  const sortedUsers = Array.from(users.values()).sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name, 'pt-BR')
    if (nameCompare !== 0) {
      return nameCompare
    }

    return left.uid.localeCompare(right.uid)
  })

  let summaryRows = 0
  let usersWithPurchases = 0
  let totalUniqueNumbers = 0

  for (const user of sortedUsers) {
    const numbers = Array.from(numbersByUser.get(user.uid) || []).sort((a, b) => a - b)
    if (numbers.length > 0) {
      usersWithPurchases += 1
      totalUniqueNumbers += numbers.length
    }

    if (options.onlyWithPurchases && numbers.length === 0) {
      continue
    }

    summaryStream.write(toCsvLine([
      user.uid,
      user.cpf || '',
      user.name,
      user.phone || '',
      numbers.length,
      numbers.join(';'),
    ]))

    summaryRows += 1
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    summaryStream.end((error:unknown) => {
      if (error) {
        rejectPromise(error)
        return
      }
      resolvePromise()
    })
  })

  console.log('Export complete.')
  console.log(`Orders scanned: ${scannedOrders}`)
  console.log(`Orders without userId: ${ordersWithoutUserId}`)
  console.log(`Orders recovered from legacy subcollection: ${ordersWithLegacyRecovery}`)
  console.log(`Numbers recovered from legacy subcollection: ${numbersRecoveredFromLegacy}`)
  console.log(`Users loaded: ${users.size}`)
  console.log(`Users with purchases: ${usersWithPurchases}`)
  console.log(`Total unique purchased numbers (by user): ${totalUniqueNumbers}`)
  console.log(`Summary rows: ${summaryRows}`)
  console.log(`Detailed rows: ${detailsRows}`)
  console.log(`Summary file: ${summaryFilePath}`)
  console.log(`Detailed file: ${detailsFilePath}`)
}

run().catch((error) => {
  console.error('Export failed:', error)
  process.exit(1)
})
