import type { User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { buildUserSearchFields } from '../../utils/userSearch'

export async function upsertUserProfile(user: User) {
  const userRef = doc(db, 'users', user.uid)
  const fallbackName = user.email?.split('@')[0] || 'Usuário'
  let existingRole: unknown = null

  try {
    const existingSnapshot = await getDoc(userRef)
    existingRole = existingSnapshot.exists() ? existingSnapshot.data().role : null
  } catch {
    existingRole = null
  }
  const normalizedRole = existingRole === 'admin' ? 'admin' : 'user'
  const profilePayload = {
    uid: user.uid,
    name: user.displayName || fallbackName,
    email: user.email || null,
    ...buildUserSearchFields({
      name: user.displayName || fallbackName,
      email: user.email || null,
    }),
    ...(user.phoneNumber ? { phone: user.phoneNumber } : {}),
    ...(user.phoneNumber ? buildUserSearchFields({ phone: user.phoneNumber }) : {}),
    role: normalizedRole,
    photoURL: user.photoURL || null,
    providerIds: user.providerData.map((provider) => provider.providerId),
    createdAtAuth: user.metadata.creationTime || null,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }

  await setDoc(userRef, profilePayload, { merge: true })
}
