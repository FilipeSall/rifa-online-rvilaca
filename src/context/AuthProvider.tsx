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

const ADMIN_DEBUG = import.meta.env.DEV

function adminDebug(message: string, payload?: unknown) {
  if (!ADMIN_DEBUG) {
    return
  }

  const timestamp = new Date().toISOString()
  if (payload === undefined) {
    console.log(`[admin-debug][AuthProvider][${timestamp}] ${message}`)
    return
  }

  console.log(`[admin-debug][AuthProvider][${timestamp}] ${message}`, payload)
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
    adminDebug('effect mounted')

    const unsubscribe = onIdTokenChanged(auth, (user) => {
      const currentState = useAuthStore.getState()
      const currentUid = currentState.user?.uid ?? null
      const nextUid = user?.uid ?? null

      adminDebug('onIdTokenChanged', {
        hasUser: Boolean(user),
        uid: nextUid,
      })

      if (currentUid !== nextUid) {
        setAuthUser(user)
      } else {
        adminDebug('auth user unchanged, skipped store update', { uid: nextUid })
      }

      if (!currentState.isAuthReady) {
        setAuthReady(true)
      }

      if (!user) {
        if (roleListenerRef.current) {
          roleListenerRef.current()
          roleListenerRef.current = null
          roleListenerUidRef.current = null
          adminDebug('cleared role listener due to sign out')
        }

        syncingUserIdsRef.current.clear()
        syncedUserIdsRef.current.clear()
        setUserRole(null)
        setRoleReady(true)
        adminDebug('no user, role ready set to true')
        return
      }

      const hasSameRoleListener =
        roleListenerRef.current !== null && roleListenerUidRef.current === user.uid

      if (!hasSameRoleListener) {
        if (roleListenerRef.current) {
          roleListenerRef.current()
          roleListenerRef.current = null
          roleListenerUidRef.current = null
          adminDebug('cleared previous role listener for uid swap')
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
              adminDebug('user snapshot missing, fallback role user')
              return
            }

            const roleValue = snapshot.data().role
            const normalizedRole: UserRole = roleValue === 'admin' ? 'admin' : 'user'

            if (currentState.userRole === normalizedRole && currentState.isRoleReady) {
              return
            }

            setUserRole(normalizedRole)
            setRoleReady(true)
            adminDebug('role snapshot updated', {
              uid: user.uid,
              roleValue,
              normalizedRole,
            })
          },
          (error) => {
            setUserRole('user')
            setRoleReady(true)
            adminDebug('role snapshot error, fallback role user', {
              uid: user.uid,
              error: String(error),
            })
          },
        )
        roleListenerUidRef.current = user.uid
      } else {
        adminDebug('token refresh for same uid, reusing role listener', {
          uid: user.uid,
        })
      }

      if (
        syncingUserIdsRef.current.has(user.uid) ||
        deniedUserIdsRef.current.has(user.uid) ||
        syncedUserIdsRef.current.has(user.uid)
      ) {
        adminDebug('upsertUserProfile skipped (syncing/denied/synced)', { uid: user.uid })
        return
      }

      syncingUserIdsRef.current.add(user.uid)
      adminDebug('upsertUserProfile start', { uid: user.uid })

      upsertUserProfile(user)
        .then(() => {
          syncedUserIdsRef.current.add(user.uid)
        })
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
          adminDebug('upsertUserProfile finished', { uid: user.uid })
        })
    })

    return () => {
      if (roleListenerRef.current) {
        roleListenerRef.current()
        roleListenerRef.current = null
        roleListenerUidRef.current = null
        adminDebug('cleanup role snapshot listener')
      }

      unsubscribe()
      adminDebug('effect unmounted')
    }
  }, [setAuthReady, setAuthUser, setRoleReady, setUserRole])

  return children
}
