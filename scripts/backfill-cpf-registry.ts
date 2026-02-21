import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type WriteBatch } from 'firebase-admin/firestore'

type ServiceAccount = {
  project_id?: string
  client_email?: string
  private_key?: string
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

function sanitizeCpf(value: unknown) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

const serviceAccount = getServiceAccount()
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
const dryRun = process.env.DRY_RUN !== 'false'

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

async function commitInChunks(pathsAndData: Array<{ path: string; data: Record<string, unknown> }>, chunkSize = 400) {
  let committed = 0
  for (let i = 0; i < pathsAndData.length; i += chunkSize) {
    const chunk = pathsAndData.slice(i, i + chunkSize)
    const batch: WriteBatch = db.batch()
    for (const row of chunk) {
      batch.set(db.doc(row.path), row.data, { merge: false })
    }
    await batch.commit()
    committed += chunk.length
  }
  return committed
}

async function run() {
  console.log(`Backfilling cpfRegistry in project "${projectId}" (${dryRun ? 'DRY_RUN' : 'APPLY'})...`)

  const usersSnap = await db.collection('users').get()
  const cpfToUid = new Map<string, string>()
  const conflicts = new Map<string, string[]>()
  const invalidCpfUsers: string[] = []

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data()
    const cpf = sanitizeCpf(data.cpf)
    if (!data.cpf) continue

    if (!cpf) {
      invalidCpfUsers.push(userDoc.id)
      continue
    }

    const existingUid = cpfToUid.get(cpf)
    if (!existingUid) {
      cpfToUid.set(cpf, userDoc.id)
      continue
    }

    const current = conflicts.get(cpf) || [existingUid]
    current.push(userDoc.id)
    conflicts.set(cpf, current)
  }

  const writes: Array<{ path: string; data: Record<string, unknown> }> = []
  let alreadyMapped = 0
  let mismatchMapped = 0

  for (const [cpf, uid] of cpfToUid.entries()) {
    if (conflicts.has(cpf)) continue

    const registryRef = db.doc(`cpfRegistry/${cpf}`)
    const registrySnap = await registryRef.get()

    if (!registrySnap.exists) {
      writes.push({
        path: registryRef.path,
        data: {
          uid,
          cpf,
          createdAt: FieldValue.serverTimestamp(),
        },
      })
      continue
    }

    const mappedUid = registrySnap.get('uid')
    if (mappedUid === uid) {
      alreadyMapped += 1
    } else {
      mismatchMapped += 1
      const current = conflicts.get(cpf) || []
      conflicts.set(cpf, [...current, uid, String(mappedUid)])
    }
  }

  console.log(`Users scanned: ${usersSnap.size}`)
  console.log(`Unique CPF in users: ${cpfToUid.size}`)
  console.log(`Invalid CPF format in users: ${invalidCpfUsers.length}`)
  console.log(`CPF already mapped correctly: ${alreadyMapped}`)
  console.log(`CPF with mapping mismatch/conflict: ${conflicts.size}`)
  console.log(`CPF registry docs to create: ${writes.length}`)

  if (invalidCpfUsers.length > 0) {
    console.log('Users with invalid cpf field:')
    console.log(invalidCpfUsers.join(', '))
  }

  if (conflicts.size > 0) {
    console.log('CPF conflicts detected (manual cleanup required):')
    for (const [cpf, uids] of conflicts.entries()) {
      console.log(`${cpf}: ${Array.from(new Set(uids)).join(', ')}`)
    }
  }

  if (dryRun) {
    console.log('Dry run complete. Set DRY_RUN=false to apply writes.')
    return
  }

  const written = await commitInChunks(writes)
  console.log(`Backfill complete. Created ${written} cpfRegistry documents.`)
}

run().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
