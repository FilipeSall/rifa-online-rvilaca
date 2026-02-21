import { FirebaseError } from 'firebase/app'
import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '../lib/firebase'
import { saveUserProfile } from '../services/userDashboard/userDashboardService'
import { useAuthStore } from '../stores/authStore'

type UseEditProfileModalParams = {
  userId: string
  currentName: string
  onClose: () => void
  onSaved: (newName: string, newPhone: string, newCpf: string | null) => void
  loadPhone: () => Promise<string | null>
  loadCpf: () => Promise<string | null>
}

export function useEditProfileModal({
  userId,
  currentName,
  onClose,
  onSaved,
  loadPhone,
  loadCpf,
}: UseEditProfileModalParams) {
  const [name, setName] = useState(currentName)
  const [phone, setPhone] = useState('')
  const [cpf, setCpf] = useState('')
  const [hasCpf, setHasCpf] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [storedPhone, storedCpf] = await Promise.all([loadPhone(), loadCpf()])
        setPhone(storedPhone ?? '')
        setCpf(storedCpf ? storedCpf.replace(/\D/g, '') : '')
        setHasCpf(Boolean(storedCpf))
      } catch {
        // Ignore loading failures to keep the modal usable.
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [loadCpf, loadPhone])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === overlayRef.current) {
        onClose()
      }
    },
    [onClose],
  )

  const handleSave = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault()

      const trimmedName = name.trim()
      const trimmedPhone = phone.trim()
      const sanitizedCpf = cpf.replace(/\D/g, '')

      if (!trimmedName) {
        setError('O nome nao pode estar vazio.')
        return
      }

      if (!hasCpf && sanitizedCpf && sanitizedCpf.length !== 11) {
        setError('Informe um CPF valido com 11 digitos.')
        return
      }

      setIsSaving(true)
      setError(null)

      try {
        const cpfToSave = hasCpf ? null : sanitizedCpf || null
        await saveUserProfile(userId, trimmedName, trimmedPhone, cpfToSave)

        if (auth.currentUser) {
          useAuthStore.getState().setAuthUser(auth.currentUser)
        }

        onSaved(trimmedName, trimmedPhone, cpfToSave || null)
        onClose()
      } catch (err) {
        const isPermissionDenied = err instanceof FirebaseError && err.code === 'permission-denied'

        if (err instanceof Error && err.message === 'cpf-invalid') {
          setError('Informe um CPF valido com 11 digitos.')
          return
        }

        if (err instanceof Error && err.message === 'cpf-registry-denied') {
          setError('CPF ja cadastrado em outra conta ou regras do cpfRegistry nao publicadas.')
          return
        }

        if (isPermissionDenied) {
          setError('Sem permissao para salvar no Firestore. Verifique as regras/publicacao do projeto Firebase.')
          return
        }

        if (err instanceof Error && err.message === 'Sessao desatualizada. Recarregue a pagina e tente novamente.') {
          setError(err.message)
          return
        }

        setError('Erro ao salvar dados. Tente novamente.')
      } finally {
        setIsSaving(false)
      }
    },
    [cpf, hasCpf, name, onClose, onSaved, phone, userId],
  )

  return {
    overlayRef,
    name,
    setName,
    phone,
    setPhone,
    isLoading,
    isSaving,
    error,
    handleOverlayClick,
    handleSave,
    cpf,
    setCpf,
    hasCpf,
  }
}
