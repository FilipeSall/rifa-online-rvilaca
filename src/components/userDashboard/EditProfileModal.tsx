import { useEditProfileModal } from '../../hooks/useEditProfileModal'

type EditProfileModalProps = {
  userId: string
  currentName: string
  currentEmail: string | null
  onClose: () => void
  onSaved: (newName: string, newPhone: string) => void
  loadPhone: () => Promise<string | null>
}

export default function EditProfileModal({
  userId,
  currentName,
  currentEmail,
  onClose,
  onSaved,
  loadPhone,
}: EditProfileModalProps) {
  const {
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
  } = useEditProfileModal({
    userId,
    currentName,
    onClose,
    onSaved,
    loadPhone,
  })

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-luxury-border bg-luxury-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-luxury-border px-6 py-4">
          <div>
            <h2 className="font-bold text-white">Editar dados</h2>
            <p className="mt-0.5 text-xs text-text-muted">Atualize suas informacoes pessoais</p>
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-name" className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Nome completo
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg border border-luxury-border bg-luxury-bg px-4 py-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-phone" className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Telefone / WhatsApp
              </label>
              <input
                id="edit-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="rounded-lg border border-luxury-border bg-luxury-bg px-4 py-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
                placeholder="(11) 99999-9999"
                autoComplete="tel"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                E-mail
                <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] normal-case tracking-normal text-text-muted">
                  Gerenciado pelo Google
                </span>
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-luxury-border bg-white/5 px-4 py-3 text-sm text-text-muted">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                {currentEmail ?? '-'}
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {error}
              </p>
            )}

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
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
