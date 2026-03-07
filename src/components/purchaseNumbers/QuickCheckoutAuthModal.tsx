import {
  signInWithCustomToken,
  type AuthError,
} from 'firebase/auth'
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { toast } from 'react-toastify'
import { auth } from '../../lib/firebase'
import {
  loginSimpleAccount,
  normalizeSimpleAuthIdentifier,
  registerSimpleAccount,
  saveSimpleAuthSession,
} from '../../services/auth/simpleAuthService'
import { formatCpfInput } from '../../utils/cpf'

type QuickCheckoutAuthModalCloseReason = 'dismiss' | 'login-success' | 'signup-success'

type QuickCheckoutAuthModalProps = {
  isOpen: boolean
  onClose: (reason: QuickCheckoutAuthModalCloseReason) => void
}

function getSimpleAuthErrorMessage(error: unknown, mode: 'login' | 'signup') {
  const authError = error as AuthError
  if (authError?.code === 'functions/invalid-argument') {
    return 'Confira os dados e tente novamente.'
  }

  if (authError?.code === 'functions/not-found') {
    return 'Conta nao encontrada. Cadastre-se para continuar.'
  }

  if (authError?.code === 'functions/already-exists') {
    return 'CPF ou telefone ja cadastrado em outra conta.'
  }

  if (authError?.code === 'functions/unavailable' || authError?.code === 'auth/network-request-failed') {
    return 'Falha de rede. Tente novamente.'
  }

  return mode === 'signup'
    ? 'Nao foi possivel criar sua conta agora.'
    : 'Nao foi possivel entrar na sua conta agora.'
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
  const [isSimpleSubmitting, setIsSimpleSubmitting] = useState(false)
  const [identifierValue, setIdentifierValue] = useState('')
  const [nameValue, setNameValue] = useState('')
  const [cpfValue, setCpfValue] = useState('')
  const [confirmCpfValue, setConfirmCpfValue] = useState('')
  const [phoneValue, setPhoneValue] = useState('')
  const [confirmPhoneValue, setConfirmPhoneValue] = useState('')
  const [simpleAuthError, setSimpleAuthError] = useState<string | null>(null)

  const isBusy = useMemo(
    () => isSimpleSubmitting,
    [isSimpleSubmitting],
  )

  const resetForm = useCallback(() => {
    setMode('login')
    setIsSimpleSubmitting(false)
    setIdentifierValue('')
    setNameValue('')
    setCpfValue('')
    setConfirmCpfValue('')
    setPhoneValue('')
    setConfirmPhoneValue('')
    setSimpleAuthError(null)
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

  const handleLoginSubmit = useCallback(async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    const identifierDigits = normalizeSimpleAuthIdentifier(identifierValue)
    if (identifierDigits.length !== 10 && identifierDigits.length !== 11) {
      setSimpleAuthError('Informe um CPF ou telefone valido para entrar.')
      return
    }

    setIsSimpleSubmitting(true)
    setSimpleAuthError(null)

    try {
      const result = await loginSimpleAccount({ identifier: identifierDigits })
      await signInWithCustomToken(auth, result.token)
      saveSimpleAuthSession(result.profile, identifierDigits)

      toast.success('Login realizado com sucesso.', {
        position: 'bottom-right',
        toastId: 'auth-login-success',
      })
      requestClose('login-success')
    } catch (error) {
      setSimpleAuthError(getSimpleAuthErrorMessage(error, 'login'))
    } finally {
      setIsSimpleSubmitting(false)
    }
  }, [identifierValue, requestClose])

  const handleSignupSubmit = useCallback(async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = nameValue.trim()
    const sanitizedCpf = normalizeSimpleAuthIdentifier(cpfValue)
    const confirmCpf = normalizeSimpleAuthIdentifier(confirmCpfValue)
    const sanitizedPhone = normalizeSimpleAuthIdentifier(phoneValue)
    const confirmPhone = normalizeSimpleAuthIdentifier(confirmPhoneValue)

    if (name.length < 2) {
      setSimpleAuthError('Informe seu nome completo para criar a conta.')
      return
    }

    if (sanitizedCpf.length !== 11) {
      setSimpleAuthError('Informe um CPF valido com 11 digitos.')
      return
    }

    if (sanitizedPhone.length < 10 || sanitizedPhone.length > 11) {
      setSimpleAuthError('Informe um telefone valido com DDD.')
      return
    }

    if (sanitizedPhone !== confirmPhone) {
      setSimpleAuthError('Os telefones informados nao conferem.')
      return
    }

    if (sanitizedCpf !== confirmCpf) {
      setSimpleAuthError('Os CPFs informados nao conferem.')
      return
    }

    setIsSimpleSubmitting(true)
    setSimpleAuthError(null)

    try {
      const result = await registerSimpleAccount({
        name,
        cpf: sanitizedCpf,
        phone: sanitizedPhone,
      })

      await signInWithCustomToken(auth, result.token)
      saveSimpleAuthSession(result.profile, sanitizedCpf)

      toast.success('Conta criada e login realizado com sucesso.', {
        position: 'bottom-right',
        toastId: 'auth-signup-success',
      })
      requestClose('login-success')
    } catch (error) {
      setSimpleAuthError(getSimpleAuthErrorMessage(error, 'signup'))
    } finally {
      setIsSimpleSubmitting(false)
    }
  }, [confirmCpfValue, confirmPhoneValue, cpfValue, nameValue, phoneValue, requestClose])

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

        <form className="mt-4 space-y-3" onSubmit={mode === 'signup' ? handleSignupSubmit : handleLoginSubmit}>
          {mode === 'signup' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Nome</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                type="text"
                placeholder="Digite seu nome"
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                disabled={isBusy}
                required
              />
            </div>
          ) : null}

          {mode === 'login' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">CPF ou telefone</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                type="text"
                inputMode="numeric"
                placeholder="Digite seu CPF ou telefone"
                value={identifierValue}
                onChange={(event) => setIdentifierValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
                disabled={isBusy}
                required
              />
            </div>
          ) : null}

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
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Confirmar telefone</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                type="tel"
                inputMode="tel"
                placeholder="Repita seu telefone"
                value={formatPhone(confirmPhoneValue)}
                onChange={(event) => setConfirmPhoneValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
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
          ) : null}

          {mode === 'signup' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Confirmar CPF</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-neon-pink/60 focus:outline-none focus:ring-1 focus:ring-neon-pink/30"
                type="text"
                inputMode="numeric"
                placeholder="Repita seu CPF"
                value={formatCpfInput(confirmCpfValue)}
                onChange={(event) => setConfirmCpfValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
                disabled={isBusy}
                required
              />
            </div>
          ) : null}

          <button
            className="flex h-10 w-full items-center justify-center rounded bg-neon-pink px-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isBusy}
          >
            {isSimpleSubmitting ? (mode === 'signup' ? 'Criando conta...' : 'Entrando...') : (mode === 'signup' ? 'Criar conta' : 'Entrar')}
          </button>
          {simpleAuthError ? <p className="text-[11px] text-red-300">{simpleAuthError}</p> : null}
        </form>
      </div>
    </div>
  )
}
