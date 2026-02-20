import { FirebaseError } from 'firebase/app'
import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '../lib/firebase'
import { saveUserProfile } from '../services/userDashboard/userDashboardService'
import { useAuthStore } from '../stores/authStore'

type UseEditProfileModalParams = {
  userId: string
  currentName: string
  onClose: () => void
  onSaved: (newName: string, newPhone: string) => void
  loadPhone: () => Promise<string | null>
}

export function useEditProfileModal({ userId, currentName, onClose, onSaved, loadPhone }: UseEditProfileModalParams) {
  const [name, setName] = useState(currentName)
  const [phone, setPhone] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const storedPhone = await loadPhone()
        setPhone(storedPhone ?? '')
      } catch {
        // Ignore loading failures to keep the modal usable.
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [loadPhone])

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

      if (!trimmedName) {
        setError('O nome nao pode estar vazio.')
        return
      }

      setIsSaving(true)
      setError(null)

      try {
        await saveUserProfile(userId, trimmedName, trimmedPhone)

        if (auth.currentUser) {
          useAuthStore.getState().setAuthUser(auth.currentUser)
        }

        onSaved(trimmedName, trimmedPhone)
        onClose()
      } catch (err) {
        const isPermissionDenied = err instanceof FirebaseError && err.code === 'permission-denied'

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
    [name, onClose, onSaved, phone, userId],
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
  }
}
