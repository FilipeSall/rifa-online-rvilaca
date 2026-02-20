import { FirebaseError } from 'firebase/app'
import { updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { auth, db, storage } from '../../lib/firebase'

async function getCurrentUserWithValidation(expectedUserId?: string) {
  const currentUser = auth.currentUser

  if (!currentUser) {
    throw new Error('Usuario nao autenticado.')
  }

  if (expectedUserId && currentUser.uid !== expectedUserId) {
    throw new Error('Sessao desatualizada. Recarregue a pagina e tente novamente.')
  }

  return currentUser
}

async function uploadAvatarWithTimeout(file: File, path: string, timeoutMs = 12000) {
  const avatarRef = storageRef(storage, path)
  const uploadTask = uploadBytesResumable(avatarRef, file)

  const snapshot = await new Promise<(typeof uploadTask)['snapshot']>((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('avatar-upload-timeout'))
      uploadTask.cancel()
    }, timeoutMs)

    uploadTask.on(
      'state_changed',
      () => undefined,
      (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        reject(error)
      },
      () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        resolve(uploadTask.snapshot)
      },
    )
  })

  return snapshot
}

export async function loadUserPhone(expectedUserId: string) {
  const currentUser = await getCurrentUserWithValidation(expectedUserId)
  await currentUser.getIdToken()

  const snapshot = await getDoc(doc(db, 'users', currentUser.uid))

  if (!snapshot.exists()) {
    return null
  }

  return snapshot.data().phone ?? null
}

export async function saveUserProfile(expectedUserId: string, name: string, phone: string) {
  const currentUser = await getCurrentUserWithValidation(expectedUserId)

  const persist = async () => {
    await updateProfile(currentUser, { displayName: name })

    await setDoc(
      doc(db, 'users', currentUser.uid),
      {
        uid: currentUser.uid,
        name,
        phone: phone || null,
        email: currentUser.email || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  await currentUser.getIdToken()

  try {
    await persist()
  } catch (error) {
    const isPermissionDenied = error instanceof FirebaseError && error.code === 'permission-denied'

    if (!isPermissionDenied) {
      throw error
    }

    await currentUser.getIdToken(true)
    await persist()
  }
}

export async function uploadUserAvatar(file: File, expectedUserId: string) {
  const currentUser = await getCurrentUserWithValidation(expectedUserId)

  await currentUser.getIdToken()
  const uploadSnapshot = await uploadAvatarWithTimeout(file, `users/${currentUser.uid}/avatar`)
  const url = await getDownloadURL(uploadSnapshot.ref)
  await updateProfile(currentUser, { photoURL: url })

  return url
}
