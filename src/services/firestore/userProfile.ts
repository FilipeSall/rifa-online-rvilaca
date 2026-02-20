import type { User } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'

export async function upsertUserProfile(user: User) {
  const userRef = doc(db, 'users', user.uid)
  const fallbackName = user.email?.split('@')[0] || 'Usuário'

  await setDoc(
    userRef,
    {
      uid: user.uid,
      name: user.displayName || fallbackName,
      email: user.email || null,
      phone: user.phoneNumber || null,
      photoURL: user.photoURL || null,
      providerIds: user.providerData.map((provider) => provider.providerId),
      createdAtAuth: user.metadata.creationTime || null,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  )
}
