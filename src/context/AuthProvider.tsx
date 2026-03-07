import { FirebaseError } from 'firebase/app'
import { onIdTokenChanged, signInWithCustomToken } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { useEffect, useRef, type ReactNode } from 'react'
import { auth } from '../lib/firebase'
import { db } from '../lib/firebase'
import {
  clearSimpleAuthSession,
  loginSimpleAccount,
  readSimpleAuthSession,
} from '../services/auth/simpleAuthService'
import { upsertUserProfile } from '../services/firestore/userProfile'
import { useAuthStore, type UserRole } from '../stores/authStore'
import { markFetchedNow, readCachedJson, shouldFetchAfterDays, writeCachedJson } from '../utils/fetchCache'

type AuthProviderProps = {
  children: ReactNode
}

type UserRoleCache = {
  uid: string
  role: UserRole
}

const ROLE_FETCH_EVERY_DAYS = 5
const PROFILE_SYNC_FETCH_EVERY_DAYS = 5

function buildRoleCacheKey(uid: string) {
  return `rifa-online:cache:user-role:${uid}:v1`
}

function buildRoleLastFetchKey(uid: string) {
  return `rifa-online:last-fetch:user-role:${uid}:v1`
}

function buildProfileSyncLastFetchKey(uid: string) {
  return `rifa-online:last-fetch:profile-sync:${uid}:v1`
}

function readCachedUserRole(uid: string): UserRole | null {
  const cached = readCachedJson<UserRoleCache>(buildRoleCacheKey(uid))
  if (!cached || cached.uid !== uid) {
    return null
  }

  return cached.role === 'admin' ? 'admin' : cached.role === 'user' ? 'user' : null
}

function cacheUserRole(uid: string, role: UserRole) {
  writeCachedJson(buildRoleCacheKey(uid), { uid, role } satisfies UserRoleCache)
  markFetchedNow(buildRoleLastFetchKey(uid))
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const setAuthReady = useAuthStore((state) => state.setAuthReady)
  const setUserRole = useAuthStore((state) => state.setUserRole)
  const setRoleReady = useAuthStore((state) => state.setRoleReady)
  const syncingUserIdsRef = useRef<Set<string>>(new Set())
  const deniedUserIdsRef = useRef<Set<string>>(new Set())
  const syncedUserIdsRef = useRef<Set<string>>(new Set())
  const fetchingRoleUserIdsRef = useRef<Set<string>>(new Set())
  const didAttemptSimpleSessionRestoreRef = useRef(false)

  useEffect(() => {
    if (didAttemptSimpleSessionRestoreRef.current) {
      return
    }

    didAttemptSimpleSessionRestoreRef.current = true

    let cancelled = false

    void auth.authStateReady()
      .then(() => {
        if (cancelled || auth.currentUser) {
          return
        }

        const cachedSession = readSimpleAuthSession()
        if (!cachedSession?.lastIdentifier) {
          return
        }

        return loginSimpleAccount({ identifier: cachedSession.lastIdentifier })
          .then((result) => {
            if (cancelled || auth.currentUser) {
              return
            }

            return signInWithCustomToken(auth, result.token)
          })
          .catch(() => {
            clearSimpleAuthSession()
          })
      })

    return () => {
      cancelled = true
    }
  }, [])

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
        syncingUserIdsRef.current.clear()
        fetchingRoleUserIdsRef.current.clear()
        syncedUserIdsRef.current.clear()
        setUserRole(null)
        setRoleReady(true)
        return
      }

      const uid = user.uid
      const cachedRole = readCachedUserRole(uid)
      if (cachedRole) {
        if (currentState.userRole !== cachedRole || !currentState.isRoleReady) {
          setUserRole(cachedRole)
          setRoleReady(true)
        }
      } else {
        setUserRole(null)
        setRoleReady(false)
      }

      const shouldRefreshRole =
        !cachedRole || shouldFetchAfterDays(buildRoleLastFetchKey(uid), ROLE_FETCH_EVERY_DAYS)
      if (shouldRefreshRole && !fetchingRoleUserIdsRef.current.has(uid)) {
        fetchingRoleUserIdsRef.current.add(uid)

        const userDocRef = doc(db, 'users', uid)
        void getDoc(userDocRef)
          .then((snapshot) => {
            if (auth.currentUser?.uid !== uid) {
              return
            }

            const roleValue = snapshot.exists() ? snapshot.data().role : null
            const normalizedRole: UserRole = roleValue === 'admin' ? 'admin' : 'user'
            cacheUserRole(uid, normalizedRole)

            const state = useAuthStore.getState()
            if (state.userRole !== normalizedRole || !state.isRoleReady) {
              setUserRole(normalizedRole)
              setRoleReady(true)
            }
          })
          .catch(() => {
            if (auth.currentUser?.uid !== uid || cachedRole) {
              return
            }

            setUserRole('user')
            setRoleReady(true)
          })
          .finally(() => {
            fetchingRoleUserIdsRef.current.delete(uid)
          })
      }

      if (
        syncingUserIdsRef.current.has(uid) ||
        deniedUserIdsRef.current.has(uid) ||
        syncedUserIdsRef.current.has(uid)
      ) {
        return
      }

      const profileSyncKey = buildProfileSyncLastFetchKey(uid)
      if (!shouldFetchAfterDays(profileSyncKey, PROFILE_SYNC_FETCH_EVERY_DAYS)) {
        syncedUserIdsRef.current.add(uid)
        return
      }

      syncingUserIdsRef.current.add(uid)

      upsertUserProfile(user)
        .then(() => {
          syncedUserIdsRef.current.add(uid)
          markFetchedNow(profileSyncKey)
        })
        .catch((error) => {
          if (error instanceof FirebaseError && error.code === 'permission-denied') {
            deniedUserIdsRef.current.add(uid)
            markFetchedNow(profileSyncKey)
            return
          }
        })
        .finally(() => {
          syncingUserIdsRef.current.delete(uid)
        })
    })

    return () => {
      unsubscribe()
    }
  }, [setAuthReady, setAuthUser, setRoleReady, setUserRole])

  return children
}
