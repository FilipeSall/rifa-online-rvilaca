import {
  signInWithCustomToken,
  signOut,
  type AuthError,
} from 'firebase/auth'
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { OPEN_AUTH_MODAL_EVENT } from '../const/auth'
import { auth } from '../lib/firebase'
import {
  clearSimpleAuthSession,
  loginSimpleAccount,
  normalizeSimpleAuthIdentifier,
  registerSimpleAccount,
  saveSimpleAuthSession,
} from '../services/auth/simpleAuthService'
import { useAuthStore } from '../stores/authStore'

function getSimpleAuthErrorMessage(error: unknown, isCreatingAccount: boolean) {
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

  return isCreatingAccount
    ? 'Nao foi possivel criar sua conta agora.'
    : 'Nao foi possivel entrar na sua conta agora.'
}

export function useHeaderAuth() {
  const navigate = useNavigate()
  const storeIsLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const userRole = useAuthStore((state) => state.userRole)
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isSimpleFormOpen, setIsSimpleFormOpen] = useState(false)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [identifierValue, setIdentifierValue] = useState('')
  const [nameValue, setNameValue] = useState('')
  const [cpfValue, setCpfValue] = useState('')
  const [confirmCpfValue, setConfirmCpfValue] = useState('')
  const [phoneValue, setPhoneValue] = useState('')
  const [confirmPhoneValue, setConfirmPhoneValue] = useState('')
  const [isSimpleSubmitting, setIsSimpleSubmitting] = useState(false)
  const [simpleAuthError, setSimpleAuthError] = useState<string | null>(null)
  const authMenuRef = useRef<HTMLDivElement>(null)

  const showLoginSuccessToast = useCallback(() => {
    toast.success('Login realizado com sucesso.', {
      position: 'bottom-right',
      toastId: 'auth-login-success',
    })
  }, [])

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
    setIsSimpleFormOpen(false)
    setIsCreatingAccount(false)
    setIdentifierValue('')
    setNameValue('')
    setCpfValue('')
    setConfirmCpfValue('')
    setPhoneValue('')
    setConfirmPhoneValue('')
    setIsSimpleSubmitting(false)
    setSimpleAuthError(null)
  }, [])

  const openAuthModal = useCallback(() => {
    setSimpleAuthError(null)
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
    if (isLoggedIn && !isSimpleSubmitting) {
      closeAuthModal()
    }
  }, [isLoggedIn, isSimpleSubmitting, closeAuthModal])

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

  const handleSignOut = useCallback(async () => {
    closeAuthModal()
    clearSimpleAuthSession()
    await signOut(auth)
    navigate('/')
  }, [closeAuthModal, navigate])

  const handleSimpleOptionClick = useCallback(() => {
    setIsSimpleFormOpen(true)
    setIsCreatingAccount(false)
    setNameValue('')
    setCpfValue('')
    setConfirmCpfValue('')
    setPhoneValue('')
    setConfirmPhoneValue('')
    setSimpleAuthError(null)
  }, [])

  const handleCreateAccountClick = useCallback(() => {
    setIsSimpleFormOpen(true)
    setIsCreatingAccount((currentValue) => !currentValue)
    setNameValue('')
    setIdentifierValue('')
    setCpfValue('')
    setConfirmCpfValue('')
    setPhoneValue('')
    setConfirmPhoneValue('')
    setSimpleAuthError(null)
  }, [])

  const handleSimpleAuthSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault()

      const identifierDigits = normalizeSimpleAuthIdentifier(identifierValue)
      const name = nameValue.trim()
      const cpfDigits = normalizeSimpleAuthIdentifier(cpfValue)
      const confirmCpfDigits = normalizeSimpleAuthIdentifier(confirmCpfValue)
      const phoneDigits = normalizeSimpleAuthIdentifier(phoneValue)
      const confirmPhoneDigits = normalizeSimpleAuthIdentifier(confirmPhoneValue)

      if (!isCreatingAccount && (identifierDigits.length !== 10 && identifierDigits.length !== 11)) {
        setSimpleAuthError('Informe um CPF ou telefone valido para entrar.')
        return
      }

      if (isCreatingAccount && name.length < 2) {
        setSimpleAuthError('Informe seu nome completo para criar a conta.')
        return
      }

      if (isCreatingAccount && cpfDigits.length !== 11) {
        setSimpleAuthError('Informe um CPF valido com 11 digitos.')
        return
      }

      if (isCreatingAccount && (phoneDigits.length < 10 || phoneDigits.length > 11)) {
        setSimpleAuthError('Informe um telefone valido com DDD.')
        return
      }

      if (isCreatingAccount && phoneDigits !== confirmPhoneDigits) {
        setSimpleAuthError('Os telefones informados nao conferem.')
        return
      }

      if (isCreatingAccount && cpfDigits !== confirmCpfDigits) {
        setSimpleAuthError('Os CPFs informados nao conferem.')
        return
      }

      setIsSimpleSubmitting(true)
      setSimpleAuthError(null)

      try {
        if (isCreatingAccount) {
          const result = await registerSimpleAccount({
            name,
            cpf: cpfDigits,
            phone: phoneDigits,
          })

          const userCredential = await signInWithCustomToken(auth, result.token)
          setAuthUser(userCredential.user)
          saveSimpleAuthSession(result.profile, cpfDigits)

          toast.success('Conta criada e login realizado com sucesso.', {
            position: 'bottom-right',
            toastId: 'auth-signup-success',
          })
        } else {
          const result = await loginSimpleAccount({ identifier: identifierDigits })
          const userCredential = await signInWithCustomToken(auth, result.token)
          setAuthUser(userCredential.user)
          saveSimpleAuthSession(result.profile, identifierDigits)
          showLoginSuccessToast()
        }

        closeAuthModal()
      } catch (error) {
        setSimpleAuthError(getSimpleAuthErrorMessage(error, isCreatingAccount))
      } finally {
        setIsSimpleSubmitting(false)
      }
    },
    [
      closeAuthModal,
      confirmCpfValue,
      confirmPhoneValue,
      cpfValue,
      identifierValue,
      isCreatingAccount,
      nameValue,
      phoneValue,
      setAuthUser,
      showLoginSuccessToast,
    ],
  )

  return {
    isLoggedIn,
    userRole,
    isAuthModalOpen,
    isSimpleFormOpen,
    isCreatingAccount,
    identifierValue,
    nameValue,
    cpfValue,
    confirmCpfValue,
    phoneValue,
    confirmPhoneValue,
    isSimpleSubmitting,
    simpleAuthError,
    authMenuRef,
    handleAuthButtonClick,
    handleSignOut,
    handleSimpleOptionClick,
    handleCreateAccountClick,
    handleSimpleAuthSubmit,
    setIdentifierValue,
    setNameValue,
    setCpfValue,
    setConfirmCpfValue,
    setPhoneValue,
    setConfirmPhoneValue,
  }
}
