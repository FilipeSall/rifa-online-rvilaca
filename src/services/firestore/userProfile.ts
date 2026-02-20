import { FirebaseError } from 'firebase/app'
import type { User } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'

export async function upsertUserProfile(user: User) {
  const userRef = doc(db, 'users', user.uid)
  const fallbackName = user.email?.split('@')[0] || 'Usuário'
  const profilePayload = {
    uid: user.uid,
    name: user.displayName || fallbackName,
    email: user.email || null,
    phone: user.phoneNumber || null,
    photoURL: user.photoURL || null,
    providerIds: user.providerData.map((provider) => provider.providerId),
    createdAtAuth: user.metadata.creationTime || null,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }

  await user.getIdToken()

  try {
    await setDoc(userRef, profilePayload, { merge: true })
  } catch (error) {
    if (!(error instanceof FirebaseError) || error.code !== 'permission-denied') {
      throw error
    }

    await user.getIdToken(true)
    await setDoc(userRef, profilePayload, { merge: true })
  }
}
