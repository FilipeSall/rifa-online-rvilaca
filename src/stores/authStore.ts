import type { User } from 'firebase/auth'
import { create } from 'zustand'

type AuthState = {
  user: User | null
  isLoggedIn: boolean
  isAuthReady: boolean
  setAuthUser: (user: User | null) => void
  setAuthReady: (isAuthReady: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoggedIn: false,
  isAuthReady: false,
  setAuthUser: (user) =>
    set({
      user,
      isLoggedIn: Boolean(user),
    }),
  setAuthReady: (isAuthReady) => set({ isAuthReady }),
}))
