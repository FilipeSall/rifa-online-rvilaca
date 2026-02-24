import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  sendEmailVerification,
  signOut,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthError,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { OPEN_AUTH_MODAL_EVENT } from '../const/auth'
import { auth, db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { getEmailAuthErrorMessage, getGoogleAuthErrorMessage } from '../utils/home'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
const GOOGLE_POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
])
const MOBILE_USER_AGENT_REGEX = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
const GOOGLE_AUTH_FLOW = `${import.meta.env.VITE_FIREBASE_GOOGLE_AUTH_FLOW ?? 'redirect'}`.toLowerCase()

function shouldPreferGoogleRedirectFlow() {
  if (GOOGLE_AUTH_FLOW === 'popup') {
    return false
  }

  if (GOOGLE_AUTH_FLOW === 'redirect') {
    return true
  }

  if (import.meta.env.PROD) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  return MOBILE_USER_AGENT_REGEX.test(window.navigator.userAgent)
}

function shouldFallbackToGoogleRedirect(error: unknown) {
  const authError = error as AuthError
  const errorMessage = `${authError?.message ?? ''}`.toLowerCase()

  if (authError?.code === 'auth/popup-closed-by-user') {
    return false
  }

  if (GOOGLE_POPUP_FALLBACK_CODES.has(authError?.code)) {
    return true
  }

  return errorMessage.includes('cross-origin-opener-policy') || errorMessage.includes('window.closed')
}

function getVerificationActionSettings() {
  const origin = window.location.origin.replace(/\/+$/, '')
  return {
    url: `${origin}/?email_verified=1`,
    handleCodeInApp: false,
  }
}

function getVerificationErrorMessage(error: unknown) {
  const authError = error as AuthError
  if (authError?.code === 'auth/unauthorized-continue-uri' || authError?.code === 'auth/invalid-continue-uri') {
    return 'a configuracao do link de confirmacao esta invalida. Ajuste os dominios autorizados no Firebase.'
  }

  if (authError?.code === 'auth/too-many-requests') {
    return 'Ja enviamos um email recentemente. Aguarde um pouco e tente novamente.'
  }

  if (authError?.code === 'auth/network-request-failed') {
    return 'Falha de rede ao enviar email de confirmacao. Tente novamente.'
  }

  return 'Nao foi possivel enviar o email de confirmacao agora.'
}

function isContinueUriError(error: unknown) {
  const authError = error as AuthError
  return authError?.code === 'auth/unauthorized-continue-uri' || authError?.code === 'auth/invalid-continue-uri'
}

async function sendVerificationEmailWithFallback(user: User) {
  try {
    await sendEmailVerification(user, getVerificationActionSettings())
    return { sent: true, usedFallback: false, error: null as unknown }
  } catch (error) {
    if (!isContinueUriError(error)) {
      return { sent: false, usedFallback: false, error }
    }

    try {
      await sendEmailVerification(user)
      return { sent: true, usedFallback: true, error: null as unknown }
    } catch (fallbackError) {
      return { sent: false, usedFallback: true, error: fallbackError }
    }
  }
}

export function useHeaderAuth() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const userRole = useAuthStore((state) => state.userRole)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isEmailFormOpen, setIsEmailFormOpen] = useState(false)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [cpfValue, setCpfValue] = useState('')
  const [phoneValue, setPhoneValue] = useState('')
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null)
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null)
  const authMenuRef = useRef<HTMLDivElement>(null)

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
    setIsSigningIn(false)
    setIsEmailFormOpen(false)
    setIsCreatingAccount(false)
    setEmailValue('')
    setPasswordValue('')
    setCpfValue('')
    setPhoneValue('')
    setIsEmailSubmitting(false)
    setGoogleAuthError(null)
    setEmailAuthError(null)
  }, [])

  const openAuthModal = useCallback(() => {
    setGoogleAuthError(null)
    setEmailAuthError(null)
    setIsSigningIn(false)
    setIsAuthModalOpen(true)
  }, [])

  useEffect(() => {
    if (isLoggedIn && !isEmailSubmitting) {
      closeAuthModal()
    }
  }, [isLoggedIn, isEmailSubmitting, closeAuthModal])

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

  useEffect(() => {
    const handleOpenAuthModalRequest = () => {
      if (isLoggedIn) {
        return
      }

      openAuthModal()
    }

    window.addEventListener(OPEN_AUTH_MODAL_EVENT, handleOpenAuthModalRequest)

    return () => {
      window.removeEventListener(OPEN_AUTH_MODAL_EVENT, handleOpenAuthModalRequest)
    }
  }, [isLoggedIn, openAuthModal])

  useEffect(() => {
    let isMounted = true

    const resolveGoogleRedirect = async () => {
      try {
        await getRedirectResult(auth)
      } catch (error) {
        if (!isMounted) {
          return
        }

        const redirectAuthError = error as AuthError
        setGoogleAuthError(getGoogleAuthErrorMessage(redirectAuthError.code))
      }
    }

    void resolveGoogleRedirect()

    return () => {
      isMounted = false
    }
  }, [])

  const handleAuthButtonClick = useCallback(() => {
    if (isLoggedIn) {
      navigate(userRole === 'admin' ? '/dashboard' : '/minha-conta')
      return
    }

    if (isAuthModalOpen) {
      closeAuthModal()
      return
    }

    openAuthModal()
  }, [closeAuthModal, isAuthModalOpen, isLoggedIn, navigate, openAuthModal, userRole])

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true)
    setGoogleAuthError(null)
    setEmailAuthError(null)

    try {
      if (shouldPreferGoogleRedirectFlow()) {
        closeAuthModal()
        await signInWithRedirect(auth, googleProvider)
        return
      }

      await signInWithPopup(auth, googleProvider)
      closeAuthModal()
    } catch (error) {
      const currentAuthError = error as AuthError

      if (shouldFallbackToGoogleRedirect(currentAuthError)) {
        try {
          closeAuthModal()
          await signInWithRedirect(auth, googleProvider)
          return
        } catch (redirectError) {
          const redirectAuthError = redirectError as AuthError
          setGoogleAuthError(getGoogleAuthErrorMessage(redirectAuthError.code))
          return
        }
      }

      setGoogleAuthError(getGoogleAuthErrorMessage(currentAuthError.code))
    } finally {
      setIsSigningIn(false)
    }
  }, [closeAuthModal])

  const handleSignOut = useCallback(async () => {
    closeAuthModal()
    await signOut(auth)
    navigate('/')
  }, [closeAuthModal, navigate])

  const handleEmailOptionClick = useCallback(() => {
    setIsEmailFormOpen(true)
    setIsCreatingAccount(false)
    setCpfValue('')
    setPhoneValue('')
    setEmailAuthError(null)
    setGoogleAuthError(null)
  }, [])

  const handleCreateAccountClick = useCallback(() => {
    setIsEmailFormOpen(true)
    setIsCreatingAccount((currentValue) => !currentValue)
    setCpfValue('')
    setPhoneValue('')
    setEmailAuthError(null)
    setGoogleAuthError(null)
  }, [])

  const handleEmailAuthSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!emailValue || !passwordValue) {
        setEmailAuthError('Preencha email e senha para continuar.')
        return
      }

      const sanitizedCpf = cpfValue.replace(/\D/g, '')
      const sanitizedPhone = phoneValue.replace(/\D/g, '')
      if (isCreatingAccount && sanitizedCpf.length !== 11) {
        setEmailAuthError('Informe um CPF válido (11 dígitos).')
        return
      }
      if (isCreatingAccount && sanitizedPhone.length < 10) {
        setEmailAuthError('Informe um telefone válido para continuar.')
        return
      }

      setIsEmailSubmitting(true)
      setEmailAuthError(null)
      setGoogleAuthError(null)
      let createdUser: User | null = null

      try {
        if (isCreatingAccount) {
          const normalizedEmail = emailValue.trim().toLowerCase()
          const existingMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail)
          if (existingMethods.length > 0) {
            setEmailAuthError('Este email já está em uso. Faça login ou recupere a senha.')
            return
          }

          const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, passwordValue)
          createdUser = userCredential.user
          await userCredential.user.getIdToken(true)

          const profileName = normalizedEmail.split('@')[0] || 'Usuario'

          const cpfRegistryRef = doc(db, 'cpfRegistry', sanitizedCpf)
          const userDocRef = doc(db, 'users', userCredential.user.uid)
          const batch = writeBatch(db)

          batch.set(cpfRegistryRef, {
            uid: userCredential.user.uid,
            cpf: sanitizedCpf,
            createdAt: serverTimestamp(),
          })

          batch.set(
            userDocRef,
            {
              uid: userCredential.user.uid,
              name: profileName,
              email: normalizedEmail,
              cpf: sanitizedCpf,
              phone: sanitizedPhone,
              role: 'user',
              providerIds: ['password'],
              lastLoginAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )

          await batch.commit()
          const verificationResult = await sendVerificationEmailWithFallback(userCredential.user)
          const verificationMessage = verificationResult.sent
            ? verificationResult.usedFallback
              ? 'Conta criada! Enviamos o email de confirmacao com link padrao do Firebase.'
              : 'Conta criada! Enviamos um email de confirmacao para ativar sua conta.'
            : `Conta criada, mas ${getVerificationErrorMessage(verificationResult.error).toLowerCase()}`

          await signOut(auth).catch(() => null)
          closeAuthModal()
          toast[verificationResult.sent ? 'success' : 'warning'](verificationMessage, {
            position: 'bottom-right',
          })
          return
        } else {
          const userCredential = await signInWithEmailAndPassword(auth, emailValue.trim().toLowerCase(), passwordValue)
          const signedUser = userCredential.user
          const usesPasswordProvider = signedUser.providerData.some((provider) => provider.providerId === 'password')
          if (usesPasswordProvider && !signedUser.emailVerified) {
            let message = 'Seu email ainda nao foi confirmado. Verifique sua caixa de entrada para ativar a conta.'

            try {
              const verificationResult = await sendVerificationEmailWithFallback(signedUser)
              if (verificationResult.sent) {
                message = verificationResult.usedFallback
                  ? 'Seu email ainda nao foi confirmado. Reenviamos usando o link padrao do Firebase.'
                  : 'Seu email ainda nao foi confirmado. Reenviamos um novo link de ativacao.'
              } else {
                message = getVerificationErrorMessage(verificationResult.error)
              }
            } catch (sendError) {
              message = getVerificationErrorMessage(sendError)
            } finally {
              await signOut(auth).catch(() => null)
            }

            setEmailAuthError(message)
            return
          }
        }

        closeAuthModal()
      } catch (error) {
        if (isCreatingAccount && createdUser) {
          try {
            await deleteUser(createdUser)
          } catch (deleteError) {
            console.error('Failed to rollback newly created user:', deleteError)
          } finally {
            await signOut(auth).catch(() => null)
          }
        }

        if (error instanceof FirebaseError && isCreatingAccount) {
          if (error.code === 'permission-denied' || error.code === 'already-exists') {
            setEmailAuthError('CPF já cadastrado em outra conta ou regras do Firestore não publicadas.')
            return
          }

          if (error.code === 'auth/network-request-failed') {
            setEmailAuthError('Falha de rede ao criar conta. Tente novamente.')
            return
          }
        }

        const currentAuthError = error as AuthError
        setEmailAuthError(getEmailAuthErrorMessage(currentAuthError.code, isCreatingAccount))
      } finally {
        setIsEmailSubmitting(false)
      }
    },
    [closeAuthModal, cpfValue, emailValue, isCreatingAccount, passwordValue, phoneValue]
  )

  return {
    isLoggedIn,
    userRole,
    isAuthModalOpen,
    isSigningIn,
    isEmailFormOpen,
    isCreatingAccount,
    emailValue,
    passwordValue,
    cpfValue,
    phoneValue,
    isEmailSubmitting,
    googleAuthError,
    emailAuthError,
    authMenuRef,
    handleAuthButtonClick,
    handleGoogleSignIn,
    handleSignOut,
    handleEmailOptionClick,
    handleCreateAccountClick,
    handleEmailAuthSubmit,
    setEmailValue,
    setPasswordValue,
    setCpfValue,
    setPhoneValue,
  }
}
