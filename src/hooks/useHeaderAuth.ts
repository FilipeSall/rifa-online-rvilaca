import { FirebaseError } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthError,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { auth, db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { getEmailAuthErrorMessage, getGoogleAuthErrorMessage } from '../utils/home'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export function useHeaderAuth() {
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
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

  const handleAuthButtonClick = useCallback(() => {
    if (isLoggedIn) {
      navigate('/minha-conta')
      return
    }

    if (isAuthModalOpen) {
      closeAuthModal()
      return
    }

    setGoogleAuthError(null)
    setEmailAuthError(null)
    setIsSigningIn(false)
    setIsAuthModalOpen(true)
  }, [closeAuthModal, isAuthModalOpen, isLoggedIn, navigate])

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningIn(true)
    setGoogleAuthError(null)
    setEmailAuthError(null)

    try {
      await signInWithPopup(auth, googleProvider)
      closeAuthModal()
    } catch (error) {
      const currentAuthError = error as AuthError
      setGoogleAuthError(getGoogleAuthErrorMessage(currentAuthError.code))
    } finally {
      setIsSigningIn(false)
    }
  }, [closeAuthModal])

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
              providerIds: ['password'],
              lastLoginAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )

          await batch.commit()
        } else {
          await signInWithEmailAndPassword(auth, emailValue.trim().toLowerCase(), passwordValue)
        }
        closeAuthModal()
        if (isCreatingAccount) {
          navigate('/#comprar-numeros')
          toast.success('Conta criada com sucesso! Escolha seus números.', {
            position: 'bottom-right',
          })
        }
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
    [closeAuthModal, cpfValue, emailValue, isCreatingAccount, navigate, passwordValue, phoneValue]
  )

  return {
    isLoggedIn,
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
    handleEmailOptionClick,
    handleCreateAccountClick,
    handleEmailAuthSubmit,
    setEmailValue,
    setPasswordValue,
    setCpfValue,
    setPhoneValue,
  }
}
