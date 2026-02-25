import type { User } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase'

type EnsureUserProfileResponse = {
  uid: string
  role: 'user' | 'admin'
  created: boolean
  updatedAtMs: number
}

const ensureUserProfileCallable = httpsCallable<Record<string, never>, EnsureUserProfileResponse>(
  functions,
  'ensureUserProfile',
)

export async function upsertUserProfile(_user: User) {
  await ensureUserProfileCallable({})
}
