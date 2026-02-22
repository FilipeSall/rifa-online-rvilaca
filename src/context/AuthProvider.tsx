import { FirebaseError } from 'firebase/app'
import { doc, onSnapshot } from 'firebase/firestore'
import { onIdTokenChanged } from 'firebase/auth'
import { useEffect, useRef, type ReactNode } from 'react'
import { auth } from '../lib/firebase'
import { db } from '../lib/firebase'
import { upsertUserProfile } from '../services/firestore/userProfile'
import { useAuthStore, type UserRole } from '../stores/authStore'

type AuthProviderProps = {
  children: ReactNode
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const setAuthReady = useAuthStore((state) => state.setAuthReady)
  const setUserRole = useAuthStore((state) => state.setUserRole)
  const setRoleReady = useAuthStore((state) => state.setRoleReady)
  const syncingUserIdsRef = useRef<Set<string>>(new Set())
  const deniedUserIdsRef = useRef<Set<string>>(new Set())
  const syncedUserIdsRef = useRef<Set<string>>(new Set())
  const roleListenerRef = useRef<(() => void) | null>(null)
  const roleListenerUidRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      const currentState = useAuthStore.getState()
      const currentUid = currentState.user?.uid ?? null
      const nextUid = user?.uid ?? null

      if (currentUid !== nextUid) {
        setAuthUser(user)
      }

      if (!currentState.isAuthReady) {
        setAuthReady(true)
      }

      if (!user) {
        if (roleListenerRef.current) {
          roleListenerRef.current()
          roleListenerRef.current = null
          roleListenerUidRef.current = null
        }

        syncingUserIdsRef.current.clear()
        syncedUserIdsRef.current.clear()
        setUserRole(null)
        setRoleReady(true)
        return
      }

      const hasSameRoleListener =
        roleListenerRef.current !== null && roleListenerUidRef.current === user.uid

      if (!hasSameRoleListener) {
        if (roleListenerRef.current) {
          roleListenerRef.current()
          roleListenerRef.current = null
          roleListenerUidRef.current = null
        }

        setUserRole(null)
        setRoleReady(false)

        const userDocRef = doc(db, 'users', user.uid)
        roleListenerRef.current = onSnapshot(
          userDocRef,
          (snapshot) => {
            const currentState = useAuthStore.getState()

            if (!snapshot.exists()) {
              if (currentState.userRole === 'user' && currentState.isRoleReady) {
                return
              }

              setUserRole('user')
              setRoleReady(true)
              return
            }

            const roleValue = snapshot.data().role
            const normalizedRole: UserRole = roleValue === 'admin' ? 'admin' : 'user'

            if (currentState.userRole === normalizedRole && currentState.isRoleReady) {
              return
            }

            setUserRole(normalizedRole)
            setRoleReady(true)
          },
          (error) => {
            setUserRole('user')
            setRoleReady(true)
          },
        )
        roleListenerUidRef.current = user.uid
      }

      if (
        syncingUserIdsRef.current.has(user.uid) ||
        deniedUserIdsRef.current.has(user.uid) ||
        syncedUserIdsRef.current.has(user.uid)
      ) {
        return
      }

      syncingUserIdsRef.current.add(user.uid)

      upsertUserProfile(user)
        .then(() => {
          syncedUserIdsRef.current.add(user.uid)
        })
        .catch((error) => {
          if (error instanceof FirebaseError && error.code === 'permission-denied') {
            deniedUserIdsRef.current.add(user.uid)
            return
          }
        })
        .finally(() => {
          syncingUserIdsRef.current.delete(user.uid)
        })
    })

    return () => {
      if (roleListenerRef.current) {
        roleListenerRef.current()
        roleListenerRef.current = null
        roleListenerUidRef.current = null
      }

      unsubscribe()
    }
  }, [setAuthReady, setAuthUser, setRoleReady, setUserRole])

  return children
}
