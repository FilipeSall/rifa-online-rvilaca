import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthError,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { HiOutlineArrowRight } from 'react-icons/hi2'
import { toast } from 'react-toastify'
import { auth, db } from '../../lib/firebase'
import { getEmailAuthErrorMessage, getGoogleAuthErrorMessage, getPasswordResetAuthErrorMessage } from '../../utils/home'
import { formatCpfInput } from '../../utils/cpf'
import { buildUserSearchFields } from '../../utils/userSearch'

type QuickCheckoutAuthModalCloseReason = 'dismiss' | 'login-success' | 'signup-success'

type QuickCheckoutAuthModalProps = {
  isOpen: boolean
  onClose: (reason: QuickCheckoutAuthModalCloseReason) => void
}

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

function isContinueUriError(error: unknown) {
  const authError = error as AuthError
  return authError?.code === 'auth/unauthorized-continue-uri' || authError?.code === 'auth/invalid-continue-uri'
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
    return { sent: true, usedFallback: false, error: null as unknown }
  } catch (error) {
    console.error('[quick-checkout-auth:email-verification] send_failed_with_action_settings', {
      uid: user.uid,
      actionUrl: actionSettings.url,
      ...getAuthErrorDebugData(error),
    })

    if (!isContinueUriError(error)) {
      return { sent: false, usedFallback: false, error }
    }

    try {
      await sendEmailVerification(user)
      return { sent: true, usedFallback: true, error: null as unknown }
    } catch (fallbackError) {
      console.error('[quick-checkout-auth:email-verification] fallback_send_failed', {
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
    return { sent: true, usedFallback: false, error: null as unknown }
  } catch (error) {
    console.error('[quick-checkout-auth:password-reset] send_failed_with_action_settings', {
      email,
      actionUrl: actionSettings.url,
      ...getAuthErrorDebugData(error),
    })

    if (!isContinueUriError(error)) {
      return { sent: false, usedFallback: false, error }
    }

    try {
      await sendPasswordResetEmail(auth, email)
      return { sent: true, usedFallback: true, error: null as unknown }
    } catch (fallbackError) {
      console.error('[quick-checkout-auth:password-reset] fallback_send_failed', {
        email,
        ...getAuthErrorDebugData(fallbackError),
      })
      return { sent: false, usedFallback: true, error: fallbackError }
    }
  }
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    const parts = []
    parts.push(digits.slice(0, 2))
    if (digits.length > 2) parts.push(digits.slice(2, 6))
    if (digits.length > 6) parts.push(digits.slice(6, 10))
    const [ddd, first, second] = parts
    let formatted = ddd ? `(${ddd})` : ''
    if (first) formatted += ` ${first}`
    if (second) formatted += `-${second}`
    return formatted.trim()
  }
  const ddd = digits.slice(0, 2)
  const first = digits.slice(2, 7)
  const second = digits.slice(7, 11)
  return `(${ddd}) ${first}-${second}`
}

export default function QuickCheckoutAuthModal({ isOpen, onClose }: QuickCheckoutAuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)
  const [isPasswordResetSubmitting, setIsPasswordResetSubmitting] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [cpfValue, setCpfValue] = useState('')
  const [phoneValue, setPhoneValue] = useState('')
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null)
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null)

  const isBusy = useMemo(
    () => isSigningIn || isEmailSubmitting || isPasswordResetSubmitting,
    [isEmailSubmitting, isPasswordResetSubmitting, isSigningIn],
  )

  const resetForm = useCallback(() => {
    setMode('login')
    setIsSigningIn(false)
    setIsEmailSubmitting(false)
    setIsPasswordResetSubmitting(false)
    setEmailValue('')
    setPasswordValue('')
    setCpfValue('')
    setPhoneValue('')
    setGoogleAuthError(null)
    setEmailAuthError(null)
  }, [])

  const requestClose = useCallback((reason: QuickCheckoutAuthModalCloseReason) => {
    if (isBusy && reason === 'dismiss') {
      return
    }

    onClose(reason)
  }, [isBusy, onClose])

  useEffect(() => {
    if (!isOpen) {
      resetForm()
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose('dismiss')
      }
    }

    window.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, requestClose, resetForm])

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true)
    setGoogleAuthError(null)
    setEmailAuthError(null)

    try {
      if (shouldPreferGoogleRedirectFlow()) {
        await signInWithRedirect(auth, googleProvider)
        return
      }

      await signInWithPopup(auth, googleProvider)
      toast.success('Login realizado com sucesso.', {
        position: 'bottom-right',
        toastId: 'auth-login-success',
      })
      requestClose('login-success')
    } catch (error) {
      const authError = error as AuthError
      setGoogleAuthError(getGoogleAuthErrorMessage(authError.code))
    } finally {
      setIsSigningIn(false)
    }
  }, [requestClose])

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
      const result = await sendPasswordResetEmailWithFallback(normalizedEmail)
      if (result.sent) {
        const successMessage = result.usedFallback
          ? 'Se existir conta para este email, enviamos o link de recuperacao usando o fluxo padrao do Firebase.'
          : 'Se existir conta para este email, enviamos um link de recuperacao de senha.'
        toast.success(successMessage, {
          position: 'bottom-right',
        })
        return
      }

      const authError = result.error as AuthError
      if (authError?.code === 'auth/user-not-found') {
        toast.success('Se existir conta para este email, enviamos um link de recuperacao de senha.', {
          position: 'bottom-right',
        })
        return
      }

      setEmailAuthError(getPasswordResetAuthErrorMessage(authError?.code))
    } catch (error) {
      const authError = error as AuthError
      if (authError?.code === 'auth/user-not-found') {
        toast.success('Se existir conta para este email, enviamos um link de recuperacao de senha.', {
          position: 'bottom-right',
        })
      } else {
        setEmailAuthError(getPasswordResetAuthErrorMessage(authError?.code))
      }
    } finally {
      setIsPasswordResetSubmitting(false)
    }
  }, [emailValue])

  const handleLoginSubmit = useCallback(async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!emailValue || !passwordValue) {
      setEmailAuthError('Preencha email e senha para continuar.')
      return
    }

    setIsEmailSubmitting(true)
    setEmailAuthError(null)
    setGoogleAuthError(null)

    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailValue.trim().toLowerCase(), passwordValue)
      const signedUser = userCredential.user
      const usesPasswordProvider = signedUser.providerData.some((provider) => provider.providerId === 'password')

      if (usesPasswordProvider && !signedUser.emailVerified) {
        await signOut(auth).catch(() => null)
        setEmailAuthError('Seu email ainda nao foi confirmado. Verifique sua caixa de entrada para ativar a conta.')
        return
      }

      toast.success('Login realizado com sucesso.', {
        position: 'bottom-right',
        toastId: 'auth-login-success',
      })
      requestClose('login-success')
    } catch (error) {
      const authError = error as AuthError
      setEmailAuthError(getEmailAuthErrorMessage(authError.code, false))
    } finally {
      setIsEmailSubmitting(false)
    }
  }, [emailValue, passwordValue, requestClose])

  const handleSignupSubmit = useCallback(async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!emailValue || !passwordValue) {
      setEmailAuthError('Preencha email e senha para continuar.')
      return
    }

    const normalizedEmail = emailValue.trim().toLowerCase()
    const sanitizedCpf = cpfValue.replace(/\D/g, '')
    const sanitizedPhone = phoneValue.replace(/\D/g, '')
    if (sanitizedCpf.length !== 11) {
      setEmailAuthError('Informe um CPF valido (11 digitos).')
      return
    }
    if (sanitizedPhone.length < 10) {
      setEmailAuthError('Informe um telefone valido para continuar.')
      return
    }

    setIsEmailSubmitting(true)
    setEmailAuthError(null)
    setGoogleAuthError(null)
    let createdUser: User | null = null

    try {
      const existingMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail)
      if (existingMethods.length > 0) {
        setEmailAuthError('Este email ja esta em uso. Faca login ou recupere a senha.')
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

      const verificationResult = await sendVerificationEmailWithFallback(userCredential.user)
      const verificationMessage = verificationResult.sent
        ? verificationResult.usedFallback
          ? 'Conta criada! Enviamos o email de confirmacao com link padrao do Firebase.'
          : 'Conta criada! Enviamos um email de confirmacao para ativar sua conta.'
        : `Conta criada, mas ${getVerificationErrorMessage(verificationResult.error).toLowerCase()}`

      await signOut(auth).catch(() => null)
      toast[verificationResult.sent ? 'success' : 'warning'](verificationMessage, {
        position: 'bottom-right',
      })
      requestClose('signup-success')
    } catch (error) {
      if (createdUser) {
        try {
          await deleteUser(createdUser)
        } catch (deleteError) {
          console.error('Failed to rollback newly created user:', deleteError)
        } finally {
          await signOut(auth).catch(() => null)
        }
      }

      if (error instanceof FirebaseError) {
        if (error.code === 'permission-denied' || error.code === 'already-exists') {
          setEmailAuthError('CPF ja cadastrado em outra conta ou regras do Firestore nao publicadas.')
          return
        }

        if (error.code === 'auth/network-request-failed') {
          setEmailAuthError('Falha de rede ao criar conta. Tente novamente.')
          return
        }
      }

      const authError = error as AuthError
      setEmailAuthError(getEmailAuthErrorMessage(authError.code, true))
    } finally {
      setIsEmailSubmitting(false)
    }
  }, [cpfValue, emailValue, passwordValue, phoneValue, requestClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-end bg-black/75 p-3 sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      onClick={() => requestClose('dismiss')}
    >
      <div
        className="relative w-full max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-luxury-card p-5 shadow-2xl sm:max-w-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Fechar autenticacao rapida"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => requestClose('dismiss')}
          disabled={isBusy}
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-pink">Checkout rapido</p>
          <h2 className="mt-2 text-lg font-bold text-white">Entre ou crie conta para finalizar sua compra</h2>
          <p className="mt-2 text-xs text-gray-400">
            Depois do login, voce segue direto para o checkout com os numeros ja selecionados.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/20 p-1">
          <button
            className={`h-10 rounded-md text-xs font-black uppercase tracking-[0.15em] transition ${
              mode === 'login'
                ? 'bg-neon-pink text-black'
                : 'text-gray-300 hover:bg-white/5'
            }`}
            type="button"
            onClick={() => setMode('login')}
            disabled={isBusy}
          >
            Entrar
          </button>
          <button
            className={`h-10 rounded-md text-xs font-black uppercase tracking-[0.15em] transition ${
              mode === 'signup'
                ? 'bg-neon-pink text-black'
                : 'text-gray-300 hover:bg-white/5'
            }`}
            type="button"
            onClick={() => setMode('signup')}
            disabled={isBusy}
          >
            Criar conta
          </button>
        </div>

        <button
          className="group mt-4 flex h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-luxury-bg px-3 text-left text-sm font-semibold text-white transition-all hover:border-neon-pink/50 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={isBusy}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
            <FcGoogle className="text-lg" />
          </span>
          <span className="flex-1">{isSigningIn ? 'Conectando...' : 'Continuar com Google'}</span>
          <HiOutlineArrowRight className="text-base text-neon-pink/80 transition-transform group-hover:translate-x-0.5" />
        </button>
        {googleAuthError ? <p className="mt-2 text-[11px] text-red-300">{googleAuthError}</p> : null}

        <div className="my-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30">
          <span className="h-px flex-1 bg-white/10" />
          ou
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form className="space-y-3" onSubmit={mode === 'signup' ? handleSignupSubmit : handleLoginSubmit}>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Email</label>
            <input
              className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
              type="email"
              placeholder="Digite seu email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              autoComplete="email"
              disabled={isBusy}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Senha</label>
            <input
              className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
              type="password"
              placeholder="Digite sua senha"
              value={passwordValue}
              onChange={(event) => setPasswordValue(event.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={isBusy}
              required
            />
          </div>

          {mode === 'signup' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Telefone</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                type="tel"
                inputMode="tel"
                placeholder="(00) 00000-0000"
                value={formatPhone(phoneValue)}
                onChange={(event) => setPhoneValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
                disabled={isBusy}
                required
              />
            </div>
          ) : null}

          {mode === 'signup' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">CPF</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={formatCpfInput(cpfValue)}
                onChange={(event) => setCpfValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
                disabled={isBusy}
                required
              />
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neon-pink/80 transition-colors hover:text-neon-pink disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handlePasswordResetRequest()}
                disabled={isBusy}
              >
                {isPasswordResetSubmitting ? 'Enviando link...' : 'Esqueci minha senha'}
              </button>
            </div>
          )}

          <button
            className="flex h-10 w-full items-center justify-center rounded bg-neon-pink px-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isBusy}
          >
            {isEmailSubmitting ? (mode === 'signup' ? 'Criando conta...' : 'Entrando...') : (mode === 'signup' ? 'Criar conta' : 'Entrar')}
          </button>
          {emailAuthError ? <p className="text-[11px] text-red-300">{emailAuthError}</p> : null}
        </form>
      </div>
    </div>
  )
}
