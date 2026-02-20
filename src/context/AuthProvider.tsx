import { FirebaseError } from 'firebase/app'
import { onIdTokenChanged } from 'firebase/auth'
import { useEffect, useRef, type ReactNode } from 'react'
import { auth } from '../lib/firebase'
import { upsertUserProfile } from '../services/firestore/userProfile'
import { useAuthStore } from '../stores/authStore'

type AuthProviderProps = {
  children: ReactNode
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const setAuthReady = useAuthStore((state) => state.setAuthReady)
  const syncingUserIdsRef = useRef<Set<string>>(new Set())
  const deniedUserIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      setAuthUser(user)
      setAuthReady(true)

      if (!user || syncingUserIdsRef.current.has(user.uid) || deniedUserIdsRef.current.has(user.uid)) {
        return
      }

      syncingUserIdsRef.current.add(user.uid)

      upsertUserProfile(user)
        .catch((error) => {
          if (error instanceof FirebaseError && error.code === 'permission-denied') {
            deniedUserIdsRef.current.add(user.uid)
            console.warn(
              'Firestore profile sync desativado para este usuário: permission-denied. Publique as regras no projeto correto para reativar.',
            )
            return
          }

          console.error('Failed to upsert Firestore user profile:', error)
        })
        .finally(() => {
          syncingUserIdsRef.current.delete(user.uid)
        })
    })

    return unsubscribe
  }, [setAuthReady, setAuthUser])

  return children
}
