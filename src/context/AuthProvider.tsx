import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, type ReactNode } from 'react'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'

type AuthProviderProps = {
  children: ReactNode
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const setAuthReady = useAuthStore((state) => state.setAuthReady)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setAuthReady(true)
    })

    return unsubscribe
  }, [setAuthReady, setAuthUser])

  return children
}
