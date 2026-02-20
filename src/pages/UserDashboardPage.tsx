import { FirebaseError } from 'firebase/app'
import { signOut, updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import Header from '../components/home/Header'
import { auth, db, storage } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = 'numeros' | 'comprovantes'
type TicketStatus = 'pago' | 'aguardando' | 'cancelado'

type MockTicket = {
  number: string
  orderId: string
  date: string
  status: TicketStatus
}

type MockOrder = {
  id: string
  cotas: number
  totalBrl: string
  date: string
  status: TicketStatus
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TICKETS: MockTicket[] = [
  { number: '054231', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '089142', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '1345820', orderId: 'PED-0042', date: '15 Fev 2026, 14:30', status: 'pago' },
  { number: '2891034', orderId: 'PED-0051', date: '18 Fev 2026, 09:15', status: 'aguardando' },
  { number: '0023445', orderId: 'PED-0029', date: '10 Jan 2026, 10:00', status: 'cancelado' },
]

const MOCK_ORDERS: MockOrder[] = [
  { id: 'PED-0042', cotas: 3, totalBrl: 'R$ 7,50', date: '15 Fev 2026, 14:30', status: 'pago' },
  { id: 'PED-0051', cotas: 1, totalBrl: 'R$ 2,50', date: '18 Fev 2026, 09:15', status: 'aguardando' },
  { id: 'PED-0029', cotas: 5, totalBrl: 'R$ 12,50', date: '10 Jan 2026, 10:00', status: 'cancelado' },
]

const TICKET_FILTERS = ['Todos', 'Pagos', 'Aguardando', 'Cancelados']
const RECEIPT_FILTERS = ['Todos', 'Aprovados', 'Pendentes', 'Cancelados']

const NAV_ITEMS: { icon: string; label: string; section: Section | null }[] = [
  { icon: 'confirmation_number', label: 'Meus Números', section: 'numeros' },
  { icon: 'receipt_long', label: 'Comprovantes', section: 'comprovantes' },
  { icon: 'emoji_events', label: 'Resultados', section: null },
]

function getAvatarUploadErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'avatar-upload-timeout') {
    return 'Upload indisponível no momento. O serviço demorou para responder.'
  }

  if (!(error instanceof FirebaseError)) {
    return 'Não foi possível alterar a foto agora. Tente novamente mais tarde.'
  }

  if (error.code === 'storage/unauthorized') {
    return 'Sem permissão para enviar foto. Verifique as regras do Firebase Storage.'
  }

  if (error.code === 'storage/quota-exceeded') {
    return 'Upload indisponível: cota/plano do Firebase Storage excedido. Ative o Blaze para continuar.'
  }

  if (error.code === 'storage/bucket-not-found' || error.code === 'storage/project-not-found') {
    return 'Upload indisponível: bucket do Firebase Storage não está provisionado neste projeto.'
  }

  const serverResponse =
    typeof (error as FirebaseError & { serverResponse?: unknown }).serverResponse === 'string'
      ? (error as FirebaseError & { serverResponse?: string }).serverResponse?.toLowerCase() || ''
      : ''
  const combined = `${error.code} ${error.message}`.toLowerCase()
  const looksLikeStorageProvisioningIssue =
    serverResponse.includes('cors') ||
    serverResponse.includes('preflight') ||
    serverResponse.includes('billing') ||
    serverResponse.includes('blaze') ||
    combined.includes('cors') ||
    combined.includes('preflight')

  if (looksLikeStorageProvisioningIssue) {
    return 'Upload indisponível neste projeto. Ative o plano Blaze e provisione/configure o Firebase Storage.'
  }

  return 'Não foi possível alterar a foto agora. Tente novamente mais tarde.'
}

async function uploadAvatarWithTimeout(file: File, path: string, timeoutMs = 12000) {
  const avatarRef = storageRef(storage, path)
  const uploadTask = uploadBytesResumable(avatarRef, file)

  const snapshot = await new Promise<(typeof uploadTask)['snapshot']>((resolve, reject) => {
    let settled = false
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('avatar-upload-timeout'))
      uploadTask.cancel()
    }, timeoutMs)

    uploadTask.on(
      'state_changed',
      () => undefined,
      (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        reject(error)
      },
      () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        resolve(uploadTask.snapshot)
      },
    )
  })

  return snapshot
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  if (status === 'pago')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Pago
      </span>
    )
  if (status === 'aguardando')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Aguardando
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Cancelado
    </span>
  )
}

function OrderStatusBadge({ status }: { status: TicketStatus }) {
  if (status === 'pago')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aprovado
      </span>
    )
  if (status === 'aguardando')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Pendente
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Expirado
    </span>
  )
}

function ReceiptCard({ order }: { order: MockOrder }) {
  const stripe =
    order.status === 'pago' ? 'bg-emerald-500' : order.status === 'aguardando' ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-white/5 bg-luxury-card shadow-lg transition-all hover:-translate-y-0.5 hover:border-white/10 hover:shadow-xl ${
        order.status === 'cancelado' ? 'opacity-75 hover:opacity-100' : ''
      }`}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-1.5 ${stripe}`} />
      <div className="flex h-full flex-col justify-between gap-5 p-5 pl-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">{order.id}</p>
            <h3 className="font-bold leading-snug text-white transition-colors group-hover:text-gold">
              Sorteio de Motos + PIX
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">Campanha Principal 2026</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-y border-white/5 py-4">
          <div>
            <p className="text-[10px] text-text-muted">Data da Compra</p>
            <p className="mt-0.5 text-sm font-medium text-slate-200">{order.date}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted">Quantidade</p>
            <p className="mt-0.5 text-sm font-medium text-slate-200">
              {order.cotas} {order.cotas === 1 ? 'cota' : 'cotas'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] text-text-muted">Valor Total</p>
            <p className="mt-0.5 text-xl font-bold text-gold">{order.totalBrl}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {order.status === 'pago' && (
            <>
              <button
                type="button"
                className="group/btn flex w-full items-center justify-center gap-2 rounded-lg border border-gold/30 px-4 py-2.5 text-sm font-bold text-gold transition-all hover:bg-gold hover:text-black"
              >
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover/btn:animate-bounce">download</span>
                Baixar Comprovante
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 px-4 py-2.5 text-sm font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-white"
              >
                <span className="material-symbols-outlined text-[18px]">share</span>
                Enviar no WhatsApp
              </button>
            </>
          )}
          {order.status === 'aguardando' && (
            <>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-gold/20 transition-all hover:bg-gold-hover"
              >
                <span className="material-symbols-outlined text-[18px]">pix</span>
                Pagar Agora
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold text-text-muted transition-all hover:border-white/20 hover:text-white"
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                Copiar código PIX
              </button>
            </>
          )}
          {order.status === 'cancelado' && (
            <>
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold text-text-muted opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">block</span>
                Indisponível
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

type EditProfileModalProps = {
  userId: string
  currentName: string
  currentEmail: string | null
  onClose: () => void
  onSaved: (newName: string, newPhone: string) => void
}

function EditProfileModal({ userId, currentName, currentEmail, onClose, onSaved }: EditProfileModalProps) {
  const [name, setName] = useState(currentName)
  const [phone, setPhone] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Load current phone from Firestore (token refresh mirrors upsertUserProfile pattern)
  useEffect(() => {
    const load = async () => {
      try {
        const currentUser = auth.currentUser
        if (!currentUser || currentUser.uid !== userId) return
        await currentUser.getIdToken()
        const snap = await getDoc(doc(db, 'users', currentUser.uid))
        if (snap.exists()) setPhone(snap.data().phone ?? '')
      } catch {
        // Silently ignore — phone field will just be empty
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [userId])

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('O nome não pode estar vazio.')
      return
    }
    setIsSaving(true)
    setError(null)

    const persist = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error('Usuário não autenticado.')
      if (currentUser.uid !== userId) throw new Error('Sessão desatualizada. Recarregue a página e tente novamente.')

      // 1. Update Firebase Auth displayName
      await updateProfile(currentUser, { displayName: name.trim() })
      useAuthStore.getState().setAuthUser(currentUser)

      // 2. Upsert on authenticated uid document.
      await setDoc(doc(db, 'users', currentUser.uid), {
        uid: currentUser.uid,
        name: name.trim(),
        phone: phone.trim() || null,
        email: currentUser.email || null,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    }

    try {
      // Ensure token is fresh before hitting Firestore (mirrors upsertUserProfile)
      if (auth.currentUser) await auth.currentUser.getIdToken()
      await persist()
      onSaved(name.trim(), phone.trim())
      onClose()
    } catch (err) {
      const isPermissionDenied =
        err instanceof FirebaseError && err.code === 'permission-denied'
      if (isPermissionDenied && auth.currentUser) {
        // Single retry with forced token refresh
        try {
          await auth.currentUser.getIdToken(true)
          await persist()
          onSaved(name.trim(), phone.trim())
          onClose()
          return
        } catch {
          // Fall through to generic error message
        }
      }
      if (isPermissionDenied) {
        setError('Sem permissão para salvar no Firestore. Verifique as regras/publicação do projeto Firebase.')
        return
      }
      if (err instanceof Error && err.message === 'Sessão desatualizada. Recarregue a página e tente novamente.') {
        setError(err.message)
        return
      }
      setError('Erro ao salvar dados. Tente novamente.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-luxury-border bg-luxury-card shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-luxury-border px-6 py-4">
          <div>
            <h2 className="font-bold text-white">Editar dados</h2>
            <p className="text-xs text-text-muted mt-0.5">Atualize suas informações pessoais</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-gold border-t-transparent" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-5 p-6">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-name" className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Nome completo
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-luxury-border bg-luxury-bg px-4 py-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-phone" className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Telefone / WhatsApp
              </label>
              <input
                id="edit-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-lg border border-luxury-border bg-luxury-bg px-4 py-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                placeholder="(11) 99999-9999"
                autoComplete="tel"
              />
            </div>

            {/* Email — read-only */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                E-mail
                <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] normal-case tracking-normal text-text-muted">
                  Gerenciado pelo Google
                </span>
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-luxury-border bg-white/5 px-4 py-3 text-sm text-text-muted">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                {currentEmail ?? '—'}
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-luxury-border px-4 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:border-white/20 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-hover disabled:opacity-60"
              >
                {isSaving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                ) : (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                )}
                {isSaving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UserDashboardPage() {
  const { user, isLoggedIn, isAuthReady } = useAuthStore()
  const navigate = useNavigate()

  const [activeSection, setActiveSection] = useState<Section>('numeros')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [firestorePhone, setFirestorePhone] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Meus Números state
  const [ticketFilter, setTicketFilter] = useState('Todos')
  const [ticketSearch, setTicketSearch] = useState('')

  // Comprovantes state
  const [receiptFilter, setReceiptFilter] = useState('Todos')
  const [receiptSearch, setReceiptSearch] = useState('')

  useEffect(() => {
    if (isAuthReady && !isLoggedIn) navigate('/')
  }, [isAuthReady, isLoggedIn, navigate])

  // Load phone from Firestore on mount
  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        if (auth.currentUser) await auth.currentUser.getIdToken()
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (snap.exists()) setFirestorePhone(snap.data().phone ?? null)
      } catch {
        // Ignore — phone simply won't be shown
      }
    }
    load()
  }, [user])

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !auth.currentUser) return
    // Reset input so the same file can be re-selected if needed
    if (photoInputRef.current) photoInputRef.current.value = ''
    setIsUploadingPhoto(true)
    try {
      await auth.currentUser.getIdToken()
      const uploadSnapshot = await uploadAvatarWithTimeout(file, `users/${auth.currentUser.uid}/avatar`)
      const url = await getDownloadURL(uploadSnapshot.ref)
      await updateProfile(auth.currentUser, { photoURL: url })
      useAuthStore.getState().setAuthUser(auth.currentUser)
    } catch (error) {
      console.error('Avatar upload failed:', error)
      toast.error(getAvatarUploadErrorMessage(error), {
        position: 'bottom-right',
      })
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    navigate('/')
  }

  const filteredTickets = MOCK_TICKETS.filter((t) => {
    const matchesFilter =
      ticketFilter === 'Todos' ||
      (ticketFilter === 'Pagos' && t.status === 'pago') ||
      (ticketFilter === 'Aguardando' && t.status === 'aguardando') ||
      (ticketFilter === 'Cancelados' && t.status === 'cancelado')
    const matchesSearch =
      ticketSearch === '' ||
      t.number.includes(ticketSearch) ||
      t.orderId.toLowerCase().includes(ticketSearch.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const filteredOrders = MOCK_ORDERS.filter((o) => {
    const matchesFilter =
      receiptFilter === 'Todos' ||
      (receiptFilter === 'Aprovados' && o.status === 'pago') ||
      (receiptFilter === 'Pendentes' && o.status === 'aguardando') ||
      (receiptFilter === 'Cancelados' && o.status === 'cancelado')
    const matchesSearch = receiptSearch === '' || o.id.toLowerCase().includes(receiptSearch.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const paidCount = MOCK_TICKETS.filter((t) => t.status === 'pago').length

  if (!isAuthReady || !user) {
    return (
      <>
        <Header />
        <div className="flex min-h-[60vh] items-center justify-center bg-luxury-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold border-t-transparent" />
        </div>
      </>
    )
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Usuário'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen bg-luxury-bg font-display text-white">
      <Header />

      {isEditOpen && (
        <EditProfileModal
          userId={user.uid}
          currentName={displayName}
          currentEmail={user.email}
          onClose={() => setIsEditOpen(false)}
          onSaved={(_name, newPhone) => setFirestorePhone(newPhone || null)}
        />
      )}

      <div className="flex">
        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-luxury-border bg-luxury-card sticky top-20 min-h-[calc(100vh-80px)]">
          <div className="flex flex-col gap-1 p-5">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Menu Principal
            </p>
            {NAV_ITEMS.map(({ icon, label, section }) => (
              <button
                key={label}
                type="button"
                onClick={() => section && setActiveSection(section)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  section === activeSection
                    ? 'border border-gold/20 bg-gold/10 text-gold'
                    : 'text-text-muted hover:bg-white/5 hover:text-white'
                } ${!section ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-luxury-border p-5">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-400 transition-colors hover:bg-red-500/10"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="text-sm font-medium">Sair da Conta</span>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-4xl space-y-6">

            {/* Profile card */}
            <div className="relative overflow-hidden rounded-2xl border border-luxury-border bg-luxury-card p-6 md:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/5 blur-3xl" />
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col items-center gap-5 text-center md:flex-row md:items-start md:text-left">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {/* Hidden file input */}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />

                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="h-20 w-20 rounded-full border-2 border-gold/30 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold/30 bg-gold/10 text-2xl font-bold text-gold">
                        {initials}
                      </div>
                    )}

                    {/* Upload / loading overlay button */}
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      title="Alterar foto"
                      className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-luxury-card bg-gold text-black shadow-sm transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploadingPhoto ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="space-y-1.5">
                    <h1 className="text-xl font-bold text-white">{displayName}</h1>
                    <div className="flex flex-col gap-1 text-sm text-text-muted">
                      {user.email && (
                        <div className="flex items-center justify-center gap-2 md:justify-start">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>mail</span>
                          <span>{user.email}</span>
                        </div>
                      )}
                      {firestorePhone && (
                        <div className="flex items-center justify-center gap-2 md:justify-start">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>call</span>
                          <span>{firestorePhone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-luxury-border px-5 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:border-gold/40 hover:text-gold"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                    Editar dados
                  </button>
                  <Link
                    to="/comprar"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-hover"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                    Comprar Números
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-luxury-border px-5 py-2.5 text-sm font-medium text-text-muted transition-colors hover:border-red-500/50 hover:text-red-400 lg:hidden"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
                    Sair
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
                <div className="rounded-lg bg-gold/10 p-2.5 text-gold">
                  <span className="material-symbols-outlined">confirmation_number</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Números Ativos</p>
                  <p className="text-2xl font-bold text-white">{paidCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400">
                  <span className="material-symbols-outlined">emoji_events</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Sorteios Ganhos</p>
                  <p className="text-2xl font-bold text-white">0</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4">
                <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
                  <span className="material-symbols-outlined">calendar_month</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Próximo Sorteio</p>
                  <p className="text-lg font-bold text-white">A definir</p>
                </div>
              </div>
            </div>

            {/* Mobile section tabs */}
            <div className="flex gap-1 rounded-xl border border-luxury-border bg-luxury-card p-1 lg:hidden">
              {(['numeros', 'comprovantes'] as Section[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveSection(s)}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                    activeSection === s ? 'bg-gold text-black' : 'text-text-muted hover:text-white'
                  }`}
                >
                  {s === 'numeros' ? 'Meus Números' : 'Comprovantes'}
                </button>
              ))}
            </div>

            {/* ── Section: Meus Números ── */}
            {activeSection === 'numeros' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white">Meus Números</h2>
                  <p className="mt-0.5 text-sm text-text-muted">
                    Gerencie seus números da sorte e confira o status dos seus bilhetes.
                  </p>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-3">
                    {TICKET_FILTERS.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setTicketFilter(filter)}
                        className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                          ticketFilter === filter
                            ? 'bg-gold text-black'
                            : 'border border-luxury-border bg-luxury-card text-text-muted hover:border-gold/40 hover:text-gold'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full lg:max-w-xs">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
                    </div>
                    <input
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      className="block w-full rounded-lg border border-luxury-border bg-luxury-card py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                      placeholder="Buscar por número ou pedido..."
                      type="text"
                    />
                  </div>
                </div>

                {/* Prize reminder banner */}
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-xs text-text-muted">
                  <span className="material-symbols-outlined text-gold" style={{ fontSize: 16 }}>info</span>
                  <span>Cada número concorre a <span className="font-semibold text-white">todos os prêmios</span> simultaneamente:</span>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 font-medium text-gold">🏆 BMW R 1200 GS</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-medium text-white">🏍 Honda CG Start 160</span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-400">💸 20× PIX R$ 1.000</span>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-luxury-border bg-luxury-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-luxury-border bg-white/5 text-[10px] uppercase tracking-widest text-text-muted">
                        <tr>
                          <th className="px-5 py-3.5" scope="col">Número</th>
                          <th className="hidden px-5 py-3.5 sm:table-cell" scope="col">Pedido</th>
                          <th className="hidden px-5 py-3.5 sm:table-cell" scope="col">Data</th>
                          <th className="px-5 py-3.5" scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-luxury-border">
                        {filteredTickets.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-10 text-center text-text-muted">
                              Nenhum número encontrado.
                            </td>
                          </tr>
                        ) : (
                          filteredTickets.map((ticket) => (
                            <tr
                              key={ticket.number}
                              className={`transition-colors hover:bg-white/5 ${ticket.status === 'cancelado' ? 'opacity-50' : ''}`}
                            >
                              <td className="px-5 py-4">
                                <div
                                  className={`inline-flex h-10 w-24 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                                    ticket.status === 'pago' ? 'bg-gold/10 text-gold' : 'bg-white/5 text-text-muted'
                                  }`}
                                >
                                  {ticket.number}
                                </div>
                              </td>
                              <td className="hidden px-5 py-4 text-xs text-text-muted sm:table-cell">{ticket.orderId}</td>
                              <td className="hidden px-5 py-4 text-xs text-text-muted sm:table-cell">{ticket.date}</td>
                              <td className="px-5 py-4">
                                <TicketStatusBadge status={ticket.status} />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-luxury-border bg-white/5 px-5 py-3">
                    <p className="text-xs text-text-muted">
                      Mostrando <span className="font-medium text-white">{filteredTickets.length}</span> de{' '}
                      <span className="font-medium text-white">{MOCK_TICKETS.length}</span> resultados
                    </p>
                    <p className="text-[10px] italic text-text-muted">Dados demonstrativos</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section: Comprovantes ── */}
            {activeSection === 'comprovantes' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white">Comprovantes</h2>
                  <p className="mt-0.5 text-sm text-text-muted">
                    Gerencie seus recibos e visualize o status das suas compras.
                  </p>
                </div>

                {/* Filters + Search */}
                <div className="flex flex-col gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
                    </div>
                    <input
                      value={receiptSearch}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      className="block w-full rounded-lg border border-luxury-border bg-luxury-bg py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                      placeholder="Buscar pelo ID do pedido (PED-0042)..."
                      type="text"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {RECEIPT_FILTERS.map((filter) => {
                      const dot =
                        filter === 'Aprovados' ? 'bg-emerald-500'
                        : filter === 'Pendentes' ? 'bg-amber-500'
                        : filter === 'Cancelados' ? 'bg-red-500'
                        : null
                      return (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setReceiptFilter(filter)}
                          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                            receiptFilter === filter
                              ? 'bg-gold text-black'
                              : 'border border-luxury-border bg-luxury-bg text-text-muted hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {dot && receiptFilter !== filter && (
                            <span className={`h-2 w-2 rounded-full ${dot}`} />
                          )}
                          {filter}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-luxury-border bg-luxury-card py-16 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-luxury-border bg-luxury-bg">
                      <span className="material-symbols-outlined text-4xl text-text-muted">receipt_long</span>
                    </div>
                    <p className="font-bold text-white">Nenhum comprovante encontrado</p>
                    <p className="mt-1 max-w-xs text-sm text-text-muted">
                      Tente ajustar os filtros ou faça sua primeira compra.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredOrders.map((order) => (
                      <ReceiptCard key={order.id} order={order} />
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-luxury-border pt-4">
                  <p className="text-sm text-text-muted">
                    Mostrando <span className="font-bold text-white">{filteredOrders.length}</span> de{' '}
                    <span className="font-bold text-white">{MOCK_ORDERS.length}</span> resultados
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-luxury-border text-text-muted transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-luxury-border text-text-muted transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
