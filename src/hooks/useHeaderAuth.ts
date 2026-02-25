import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  sendPasswordResetEmail,
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
import { getEmailAuthErrorMessage, getGoogleAuthErrorMessage, getPasswordResetAuthErrorMessage } from '../utils/home'
import { buildUserSearchFields } from '../utils/userSearch'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
const GOOGLE_AUTH_FLOW = `${import.meta.env.VITE_FIREBASE_GOOGLE_AUTH_FLOW ?? 'auto'}`.toLowerCase()

function shouldPreferGoogleRedirectFlow() {
  return GOOGLE_AUTH_FLOW === 'redirect'
}

function getVerificationActionSettings() {
  const origin = window.location.origin.replace(/\/+$/, '')
  return {
    url: `${origin}/?email_verified=1`,
    handleCodeInApp: false,
  }
}

function getPasswordResetActionSettings() {
  const origin = window.location.origin.replace(/\/+$/, '')
  return {
    url: `${origin}/?password_reset=1`,
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

function getAuthErrorDebugData(error: unknown) {
  const authError = error as AuthError
  return {
    code: authError?.code || 'unknown',
    message: authError?.message || 'unknown',
  }
}

async function sendVerificationEmailWithFallback(user: User) {
  const actionSettings = getVerificationActionSettings()

  try {
    await sendEmailVerification(user, actionSettings)
    console.info('[auth:email-verification] sent_with_action_settings', {
      uid: user.uid,
      actionUrl: actionSettings.url,
    })
    return { sent: true, usedFallback: false, error: null as unknown }
  } catch (error) {
    console.error('[auth:email-verification] send_failed_with_action_settings', {
      uid: user.uid,
      actionUrl: actionSettings.url,
      ...getAuthErrorDebugData(error),
    })

    if (!isContinueUriError(error)) {
      return { sent: false, usedFallback: false, error }
    }

    try {
      await sendEmailVerification(user)
      console.info('[auth:email-verification] sent_with_default_fallback', {
        uid: user.uid,
      })
      return { sent: true, usedFallback: true, error: null as unknown }
    } catch (fallbackError) {
      console.error('[auth:email-verification] fallback_send_failed', {
        uid: user.uid,
        ...getAuthErrorDebugData(fallbackError),
      })
      return { sent: false, usedFallback: true, error: fallbackError }
    }
  }
}

async function sendPasswordResetEmailWithFallback(email: string) {
  const actionSettings = getPasswordResetActionSettings()

  try {
    await sendPasswordResetEmail(auth, email, actionSettings)
    console.info('[auth:password-reset] sent_with_action_settings', {
      email,
      actionUrl: actionSettings.url,
    })
    return { sent: true, usedFallback: false, error: null as unknown }
  } catch (error) {
    console.error('[auth:password-reset] send_failed_with_action_settings', {
      email,
      actionUrl: actionSettings.url,
      ...getAuthErrorDebugData(error),
    })

    if (!isContinueUriError(error)) {
      return { sent: false, usedFallback: false, error }
    }

    try {
      await sendPasswordResetEmail(auth, email)
      console.info('[auth:password-reset] sent_with_default_fallback', { email })
      return { sent: true, usedFallback: true, error: null as unknown }
    } catch (fallbackError) {
      console.error('[auth:password-reset] fallback_send_failed', {
        email,
        ...getAuthErrorDebugData(fallbackError),
      })
      return { sent: false, usedFallback: true, error: fallbackError }
    }
  }
}

function isPasswordProviderUser(user: User) {
  return user.providerData.some((provider) => provider.providerId === 'password')
}

async function sendPasswordSignupVerificationEmail(user: User) {
  if (user.emailVerified || !isPasswordProviderUser(user)) {
    return {
      attempted: false,
      sent: false,
      usedFallback: false,
      error: null as unknown,
    }
  }

  const verificationResult = await sendVerificationEmailWithFallback(user)
  return {
    attempted: true,
    ...verificationResult,
  }
}

export function useHeaderAuth() {
  const navigate = useNavigate()
  const storeIsLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const userRole = useAuthStore((state) => state.userRole)
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isEmailFormOpen, setIsEmailFormOpen] = useState(false)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [cpfValue, setCpfValue] = useState('')
  const [phoneValue, setPhoneValue] = useState('')
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)
  const [isPasswordResetSubmitting, setIsPasswordResetSubmitting] = useState(false)
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null)
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null)
  const authMenuRef = useRef<HTMLDivElement>(null)
  const showLoginSuccessToast = useCallback(() => {
    toast.success('Login realizado com sucesso.', {
      position: 'bottom-right',
      toastId: 'auth-login-success',
    })
  }, [])

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
    setIsPasswordResetSubmitting(false)
    setGoogleAuthError(null)
    setEmailAuthError(null)
  }, [])

  const openAuthModal = useCallback(() => {
    setGoogleAuthError(null)
    setEmailAuthError(null)
    setIsSigningIn(false)
    setIsAuthModalOpen(true)
  }, [])

  const isLoggedIn = storeIsLoggedIn || Boolean(auth.currentUser)

  useEffect(() => {
    const currentAuthUser = auth.currentUser
    if (storeIsLoggedIn || !currentAuthUser) {
      return
    }

    setAuthUser(currentAuthUser)
  }, [setAuthUser, storeIsLoggedIn])

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
        const redirectResult = await getRedirectResult(auth)

        if (redirectResult?.user) {
          setAuthUser(redirectResult.user)
          showLoginSuccessToast()
        }
      } catch (error) {
        const redirectAuthError = error as AuthError

        if (!isMounted) {
          return
        }

        const redirectErrorMessage = getGoogleAuthErrorMessage(redirectAuthError.code)
        setGoogleAuthError(redirectErrorMessage)
        toast.error(redirectErrorMessage, {
          position: 'bottom-right',
          toastId: 'auth-redirect-error',
        })
      }
    }

    void resolveGoogleRedirect()

    return () => {
      isMounted = false
    }
  }, [setAuthUser, showLoginSuccessToast])

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

    const useRedirectFlow = shouldPreferGoogleRedirectFlow()

    try {
      if (useRedirectFlow) {
        closeAuthModal()
        await signInWithRedirect(auth, googleProvider)
        return
      }

      await signInWithPopup(auth, googleProvider)
      showLoginSuccessToast()
      closeAuthModal()
    } catch (error) {
      const currentAuthError = error as AuthError

      setGoogleAuthError(getGoogleAuthErrorMessage(currentAuthError.code))
    } finally {
      setIsSigningIn(false)
    }
  }, [closeAuthModal, showLoginSuccessToast])

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

  const handlePasswordResetRequest = useCallback(async () => {
    const normalizedEmail = emailValue.trim().toLowerCase()
    if (!normalizedEmail) {
      setEmailAuthError('Informe seu email para recuperar a senha.')
      return
    }

    setIsPasswordResetSubmitting(true)
    setEmailAuthError(null)
    setGoogleAuthError(null)

    try {
      const resetResult = await sendPasswordResetEmailWithFallback(normalizedEmail)
      if (resetResult.sent) {
        const successMessage = resetResult.usedFallback
          ? 'Se existir conta para este email, enviamos o link de recuperação usando o fluxo padrão do Firebase.'
          : 'Se existir conta para este email, enviamos um link de recuperação de senha.'

        toast.success(successMessage, {
          position: 'bottom-right',
        })
        return
      }

      const currentAuthError = resetResult.error as AuthError
      if (currentAuthError?.code === 'auth/user-not-found') {
        toast.success('Se existir conta para este email, enviamos um link de recuperação de senha.', {
          position: 'bottom-right',
        })
        return
      }

      setEmailAuthError(getPasswordResetAuthErrorMessage(currentAuthError?.code))
    } catch (error) {
      const currentAuthError = error as AuthError
      if (currentAuthError?.code === 'auth/user-not-found') {
        toast.success('Se existir conta para este email, enviamos um link de recuperação de senha.', {
          position: 'bottom-right',
        })
        return
      }

      setEmailAuthError(getPasswordResetAuthErrorMessage(currentAuthError?.code))
    } finally {
      setIsPasswordResetSubmitting(false)
    }
  }, [emailValue])

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
              ...buildUserSearchFields({
                name: profileName,
                email: normalizedEmail,
                cpf: sanitizedCpf,
                phone: sanitizedPhone,
              }),
              role: 'user',
              providerIds: ['password'],
              lastLoginAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )

          await batch.commit()
          const verificationResult = await sendPasswordSignupVerificationEmail(userCredential.user)
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
              const verificationResult = await sendPasswordSignupVerificationEmail(signedUser)
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

        showLoginSuccessToast()
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
    [closeAuthModal, cpfValue, emailValue, isCreatingAccount, passwordValue, phoneValue, showLoginSuccessToast]
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
    isPasswordResetSubmitting,
    googleAuthError,
    emailAuthError,
    authMenuRef,
    handleAuthButtonClick,
    handleGoogleSignIn,
    handleSignOut,
    handleEmailOptionClick,
    handleCreateAccountClick,
    handlePasswordResetRequest,
    handleEmailAuthSubmit,
    setEmailValue,
    setPasswordValue,
    setCpfValue,
    setPhoneValue,
  }
}
