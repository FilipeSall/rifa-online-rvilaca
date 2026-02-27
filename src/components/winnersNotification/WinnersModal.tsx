import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { WinnerFeedItem } from '../../services/winners/winnersService'
import WinnerCard from './WinnerCard'

type WinnersModalProps = {
  isOpen: boolean
  winners: WinnerFeedItem[]
  isLoading: boolean
  errorMessage: string | null
  onClose: () => void
  onRetry: () => void
}

export default function WinnersModal({
  isOpen,
  winners,
  isLoading,
  errorMessage,
  onClose,
  onRetry,
}: WinnersModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 20)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
      previousFocusedElement?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      className="winners-modal-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="winners-modal-title"
      onClick={(event) => {
        if (event.target === overlayRef.current) {
          onClose()
        }
      }}
    >
      <div className="winners-modal-panel flex h-[86vh] w-[94vw] max-h-[86vh] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(160deg,rgba(16,24,39,0.98),rgba(6,9,14,0.97))] shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:h-[70vh] sm:w-[70vw] sm:max-h-[70vh] sm:max-w-[70vw] lg:h-[70vmin] lg:w-[70vmin]">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Premiacao</p>
            <h2 id="winners-modal-title" className="mt-1 font-luxury text-2xl font-black text-white sm:text-3xl">
              Novos ganhadores
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar modal de ganhadores"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white transition-colors hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-neon-pink/70"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
          {isLoading ? (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-28 animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">
              <p>{errorMessage}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-lg border border-red-300/50 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors hover:bg-red-500/20"
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!isLoading && !errorMessage && winners.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-gray-300">
              Ainda nao ha sorteios publicados.
            </div>
          ) : null}

          {!isLoading && !errorMessage && winners.length > 0 ? (
            <div className="space-y-3">
              {winners.map((winner) => (
                <WinnerCard key={winner.id} winner={winner} />
              ))}

              <section className="mt-4 rounded-2xl border border-neon-pink/35 bg-[linear-gradient(140deg,rgba(255,0,204,0.22),rgba(15,23,42,0.95))] p-5 text-center">
                <p className="font-luxury text-2xl font-black text-amber-100">O próximo pode ser você!</p>
                <p className="mt-2 text-sm text-amber-50/90">Garanta seus números e participe dos próximos sorteios.</p>
                <Link
                  to="/comprar"
                  onClick={onClose}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-neon-pink px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-primary-hover"
                >
                  Comprar números agora
                </Link>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
