import { onAuthStateChanged } from 'firebase/auth'
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setAuthReady(true)

      if (!user || syncingUserIdsRef.current.has(user.uid)) {
        return
      }

      syncingUserIdsRef.current.add(user.uid)

      upsertUserProfile(user).catch((error) => {
        console.error('Failed to upsert Firestore user profile:', error)
      }).finally(() => {
        syncingUserIdsRef.current.delete(user.uid)
      })
    })

    return unsubscribe
  }, [setAuthReady, setAuthUser])

  return children
}
