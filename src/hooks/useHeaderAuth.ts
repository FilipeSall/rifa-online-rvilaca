import { GoogleAuthProvider, signInWithPopup, type AuthError } from 'firebase/auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { getGoogleAuthErrorMessage } from '../utils/home'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export function useHeaderAuth() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const authMenuRef = useRef<HTMLDivElement>(null)

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
    setIsSigningIn(false)
    setAuthError(null)
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      closeAuthModal()
    }
  }, [isLoggedIn, closeAuthModal])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!isAuthModalOpen || !authMenuRef.current) {
        return
      }

      if (!authMenuRef.current.contains(event.target as Node)) {
        closeAuthModal()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAuthModal()
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isAuthModalOpen, closeAuthModal])

  const handleAuthButtonClick = useCallback(() => {
    if (isLoggedIn) {
      navigate('/minha-conta')
      return
    }

    setAuthError(null)
    setIsSigningIn(false)
    setIsAuthModalOpen((currentValue) => !currentValue)
  }, [isLoggedIn, navigate])

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true)
    setAuthError(null)

    try {
      await signInWithPopup(auth, googleProvider)
      closeAuthModal()
    } catch (error) {
      const currentAuthError = error as AuthError
      setAuthError(getGoogleAuthErrorMessage(currentAuthError.code))
    } finally {
      setIsSigningIn(false)
    }
  }, [closeAuthModal])

  return {
    isLoggedIn,
    isAuthModalOpen,
    isSigningIn,
    authError,
    authMenuRef,
    handleAuthButtonClick,
    handleGoogleSignIn,
  }
}
