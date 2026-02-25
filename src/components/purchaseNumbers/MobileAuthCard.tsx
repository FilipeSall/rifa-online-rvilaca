import { useCallback, useMemo, useState, type SyntheticEvent } from 'react'
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, type AuthError } from 'firebase/auth'
import { FcGoogle } from 'react-icons/fc'
import { HiOutlineArrowLeft, HiOutlineArrowRight } from 'react-icons/hi2'
import { toast } from 'react-toastify'
import { auth } from '../../lib/firebase'
import { getEmailAuthErrorMessage, getGoogleAuthErrorMessage, getPasswordResetAuthErrorMessage } from '../../utils/home'

type MobileAuthCardProps = {
  onBackToCart: () => void
}

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
const GOOGLE_AUTH_FLOW = `${import.meta.env.VITE_FIREBASE_GOOGLE_AUTH_FLOW ?? 'auto'}`.toLowerCase()

export default function MobileAuthCard({ onBackToCart }: MobileAuthCardProps) {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isEmailFormOpen, setIsEmailFormOpen] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)
  const [isPasswordResetSubmitting, setIsPasswordResetSubmitting] = useState(false)
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null)
  const [emailAuthError, setEmailAuthError] = useState<string | null>(null)

  const isBusy = useMemo(
    () => isSigningIn || isEmailSubmitting || isPasswordResetSubmitting,
    [isEmailSubmitting, isPasswordResetSubmitting, isSigningIn],
  )

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true)
    setGoogleAuthError(null)
    setEmailAuthError(null)

    try {
      if (GOOGLE_AUTH_FLOW === 'redirect') {
        await signInWithRedirect(auth, googleProvider)
        return
      }

      await signInWithPopup(auth, googleProvider)
      toast.success('Login realizado com sucesso.', {
        position: 'bottom-right',
        toastId: 'auth-login-success',
      })
    } catch (error) {
      const authError = error as AuthError
      setGoogleAuthError(getGoogleAuthErrorMessage(authError.code))
    } finally {
      setIsSigningIn(false)
    }
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
      await sendPasswordResetEmail(auth, normalizedEmail)
      toast.success('Se existir conta para este email, enviamos um link de recuperação de senha.', {
        position: 'bottom-right',
      })
    } catch (error) {
      const authError = error as AuthError
      if (authError.code === 'auth/user-not-found') {
        toast.success('Se existir conta para este email, enviamos um link de recuperação de senha.', {
          position: 'bottom-right',
        })
      } else {
        setEmailAuthError(getPasswordResetAuthErrorMessage(authError.code))
      }
    } finally {
      setIsPasswordResetSubmitting(false)
    }
  }, [emailValue])

  const handleEmailAuthSubmit = useCallback(async (event: SyntheticEvent<HTMLFormElement>) => {
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
    } catch (error) {
      const authError = error as AuthError
      setEmailAuthError(getEmailAuthErrorMessage(authError.code, false))
    } finally {
      setIsEmailSubmitting(false)
    }
  }, [emailValue, passwordValue])

  return (
    <div className="rounded-2xl border border-gold/25 bg-luxury-card p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Autenticação</p>
          <h2 className="mt-2 text-lg font-bold text-white">Entre para finalizar sua compra</h2>
        </div>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
          type="button"
          aria-label="Voltar ao carrinho"
          onClick={onBackToCart}
          disabled={isBusy}
        >
          <HiOutlineArrowLeft className="text-base" />
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Faça login para manter os numeros selecionados e seguir direto para o checkout.
      </p>

      <button
        className="group mt-4 flex h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-luxury-bg px-3 text-left text-sm font-semibold text-white transition-all hover:border-gold/50 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={isSigningIn || isEmailSubmitting || isPasswordResetSubmitting}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
          <FcGoogle className="text-lg" />
        </span>
        <span className="flex-1">{isSigningIn ? 'Conectando...' : 'Entrar com Google'}</span>
        <HiOutlineArrowRight className="text-base text-gold/80 transition-transform group-hover:translate-x-0.5" />
      </button>
      {googleAuthError ? <p className="mt-2 text-[11px] text-red-300">{googleAuthError}</p> : null}

      <div className="my-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30">
        <span className="h-px flex-1 bg-white/10" />
        ou
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <button
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-left text-sm font-semibold text-white transition-all hover:border-gold/50 hover:bg-black/60"
        type="button"
        onClick={() => setIsEmailFormOpen((current) => !current)}
        disabled={isBusy}
      >
        Entrar com email
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isEmailFormOpen ? 'mt-3 max-h-[360px] opacity-100 translate-y-0' : 'mt-0 max-h-0 opacity-0 -translate-y-2 pointer-events-none'
        }`}
        aria-hidden={!isEmailFormOpen}
      >
        <form className="space-y-3" onSubmit={handleEmailAuthSubmit}>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Email</label>
            <input
              className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/30"
              type="email"
              placeholder="Digite seu email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              autoComplete="email"
              disabled={isBusy}
              required={isEmailFormOpen}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Senha</label>
            <input
              className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/30"
              type="password"
              placeholder="Digite sua senha"
              value={passwordValue}
              onChange={(event) => setPasswordValue(event.target.value)}
              autoComplete="current-password"
              disabled={isBusy}
              required={isEmailFormOpen}
            />
          </div>
          <div className="flex justify-end">
            <button
              className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold/80 transition-colors hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void handlePasswordResetRequest()}
              disabled={isBusy}
            >
              {isPasswordResetSubmitting ? 'Enviando link...' : 'Esqueci minha senha'}
            </button>
          </div>
          <button
            className="flex h-10 w-full items-center justify-center rounded bg-gold px-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isBusy}
          >
            {isEmailSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
          {emailAuthError ? <p className="text-[11px] text-red-300">{emailAuthError}</p> : null}
        </form>
      </div>
    </div>
  )
}
