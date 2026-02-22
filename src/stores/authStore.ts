import type { User } from 'firebase/auth'
import { create } from 'zustand'

export type UserRole = 'user' | 'admin'

type AuthState = {
  user: User | null
  isLoggedIn: boolean
  isAuthReady: boolean
  userRole: UserRole | null
  isRoleReady: boolean
  setAuthUser: (user: User | null) => void
  setAuthReady: (isAuthReady: boolean) => void
  setUserRole: (role: UserRole | null) => void
  setRoleReady: (isRoleReady: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoggedIn: false,
  isAuthReady: false,
  userRole: null,
  isRoleReady: false,
  setAuthUser: (user) =>
    set({
      user,
      isLoggedIn: Boolean(user),
    }),
  setAuthReady: (isAuthReady) => set({ isAuthReady }),
  setUserRole: (userRole) => set({ userRole }),
  setRoleReady: (isRoleReady) => set({ isRoleReady }),
}))
