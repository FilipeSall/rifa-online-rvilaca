import type { User } from 'firebase/auth'
import type { ChangeEventHandler, MutableRefObject } from 'react'
import { Link } from 'react-router-dom'
import { formatCpf } from '../../utils/cpf'

type ProfileCardProps = {
  user: User
  displayName: string
  initials: string
  firestorePhone: string | null
  firestoreCpf: string | null
  isUploadingPhoto: boolean
  photoInputRef: MutableRefObject<HTMLInputElement | null>
  onPhotoChange: ChangeEventHandler<HTMLInputElement>
  onOpenEdit: () => void
  onSignOut: () => void
}

export default function ProfileCard({
  user,
  displayName,
  initials,
  firestorePhone,
  firestoreCpf,
  isUploadingPhoto,
  photoInputRef,
  onPhotoChange,
  onOpenEdit,
  onSignOut,
}: ProfileCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-luxury-border bg-luxury-card p-6 md:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/5 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-center gap-5 text-center md:flex-row md:items-start md:text-left">
          <div className="relative flex-shrink-0">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPhotoChange}
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
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  edit
                </span>
              )}
            </button>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-white">{displayName}</h1>
            <div className="flex flex-col gap-1 text-sm text-text-muted">
              {user.email && (
                <div className="flex items-center justify-center gap-2 md:justify-start">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    mail
                  </span>
                  <span>{user.email}</span>
                </div>
              )}

              {firestorePhone && (
                <div className="flex items-center justify-center gap-2 md:justify-start">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    call
                  </span>
                  <span>{firestorePhone}</span>
                </div>
              )}

              {firestoreCpf && (
                <div className="flex items-center justify-center gap-2 md:justify-start">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    badge
                  </span>
                  <span>CPF: {formatCpf(firestoreCpf)}</span>
                </div>
              )}
            </div>

            {!firestoreCpf && (
              <div className="mt-3 max-w-[260px] rounded-lg border border-gold/20 bg-gold/10 px-3 py-2 text-[11px] text-gold/90 md:max-w-[320px]">
                Para melhor rastreamento de premio e seguranca, informe seu CPF em editar dados.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row md:self-start">
          <button
            type="button"
            onClick={onOpenEdit}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-luxury-border px-5 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:border-gold/40 hover:text-gold"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              edit
            </span>
            Editar dados
          </button>

          <Link
            to="/#comprar-numeros"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-gold-hover"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              add
            </span>
            Comprar Numeros
          </Link>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-luxury-border px-5 py-2.5 text-sm font-medium text-text-muted transition-colors hover:border-red-500/50 hover:text-red-400 lg:hidden"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              logout
            </span>
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
