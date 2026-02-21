import { FirebaseError } from 'firebase/app'
import { updateProfile } from 'firebase/auth'
import { doc, getDoc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore'
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

export async function loadUserProfile(expectedUserId: string) {
  const currentUser = await getCurrentUserWithValidation(expectedUserId)
  const userDocRef = doc(db, 'users', currentUser.uid)

  const readProfile = async (fromServer = false) => {
    const snapshot = fromServer ? await getDocFromServer(userDocRef) : await getDoc(userDocRef)

    if (!snapshot.exists()) {
      return { phone: null, cpf: null }
    }

    const data = snapshot.data()
    return {
      phone: data.phone ?? null,
      cpf: data.cpf ?? null,
    }
  }

  await currentUser.getIdToken()

  try {
    return await readProfile(true)
  } catch (error) {
    const isPermissionDenied = error instanceof FirebaseError && error.code === 'permission-denied'

    if (!isPermissionDenied) {
      throw error
    }

    await currentUser.getIdToken(true)
    return readProfile(true)
  }
}

export async function loadUserPhone(expectedUserId: string) {
  const profile = await loadUserProfile(expectedUserId)
  return profile.phone
}

export async function loadUserCpf(expectedUserId: string) {
  const profile = await loadUserProfile(expectedUserId)
  return profile.cpf
}

export async function saveUserProfile(expectedUserId: string, name: string, phone: string, cpf?: string | null) {
  const currentUser = await getCurrentUserWithValidation(expectedUserId)

  const persist = async () => {
    await updateProfile(currentUser, { displayName: name })

    const sanitizedCpf = cpf ? cpf.replace(/\D/g, '') : null

    if (sanitizedCpf) {
      if (sanitizedCpf.length !== 11) {
        throw new Error('cpf-invalid')
      }

      try {
        await setDoc(doc(db, 'cpfRegistry', sanitizedCpf), {
          uid: currentUser.uid,
          cpf: sanitizedCpf,
          createdAt: serverTimestamp(),
        })
      } catch (error) {
        const isPermissionDenied = error instanceof FirebaseError && error.code === 'permission-denied'

        if (isPermissionDenied) {
          throw new Error('cpf-registry-denied')
        }

        throw error
      }
    }

    await setDoc(
      doc(db, 'users', currentUser.uid),
      {
        uid: currentUser.uid,
        name,
        phone: phone || null,
        email: currentUser.email || null,
        ...(sanitizedCpf ? { cpf: sanitizedCpf } : {}),
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
