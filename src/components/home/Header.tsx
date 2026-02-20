import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type AuthError } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { HiOutlineArrowRight } from 'react-icons/hi2'
import { auth } from '../../lib/firebase'

const NAV_ITEMS = [
  { label: 'Início', href: '#', isActive: true },
  { label: 'Como Funciona', href: '#como-funciona', isActive: false },
  { label: 'Ganhadores', href: '#ganhadores', isActive: false },
  { label: 'FAQ', href: '#faq', isActive: false },
  { label: 'Regulamento', href: '#', isActive: false },
]

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export default function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(auth.currentUser))
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const authMenuRef = useRef<HTMLDivElement>(null)

  const closeAuthModal = () => {
    setIsAuthModalOpen(false)
    setIsSigningIn(false)
    setAuthError(null)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(Boolean(user))
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      closeAuthModal()
    }
  }, [isLoggedIn])

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
  }, [isAuthModalOpen])

  const handleAuthButtonClick = () => {
    if (isLoggedIn) {
      return
    }

    setAuthError(null)
    setIsSigningIn(false)
    setIsAuthModalOpen((currentValue) => !currentValue)
  }

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true)
    setAuthError(null)

    try {
      await signInWithPopup(auth, googleProvider)
      closeAuthModal()
    } catch (error) {
      const authError = error as AuthError

      if (authError.code === 'auth/popup-closed-by-user') {
        setAuthError(null)
      } else {
        setAuthError('Não foi possível entrar com Google agora. Tente novamente.')
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-luxury-bg/90 backdrop-blur-md">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-gold text-black">
              <span className="material-symbols-outlined text-2xl">diamond</span>
            </div>
            <h1 className="text-xl lg:text-2xl font-luxury font-bold text-white tracking-widest uppercase">
              Premium<span className="text-gold">Rifas</span>
            </h1>
          </div>

          <nav className="hidden lg:flex items-center gap-8">
            {NAV_ITEMS.map(({ label, href, isActive }) => (
              <a
                key={label}
                className={`text-xs font-bold hover:text-gold transition-colors uppercase tracking-widest ${
                  isActive ? 'text-white' : 'text-gray-400'
                }`}
                href={href}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4" ref={authMenuRef}>
            <button
              className="hidden md:flex h-10 items-center justify-center rounded bg-gold hover:bg-gold-hover px-6 text-xs font-black text-black transition-all uppercase tracking-widest shadow-glow-gold"
              type="button"
              onClick={handleAuthButtonClick}
              aria-expanded={isAuthModalOpen}
              aria-haspopup={!isLoggedIn}
            >
              {isLoggedIn ? 'Minha conta' : 'Entrar'}
            </button>
            {!isLoggedIn && isAuthModalOpen ? (
              <div className="absolute right-4 top-[calc(100%-0.35rem)] w-[290px] overflow-hidden rounded-xl border border-gold/30 bg-luxury-card/95 p-3 shadow-2xl backdrop-blur-md md:right-8 lg:right-8">
                <div className="mb-2 px-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Acesso rápido</p>
                </div>
                <button
                  className="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-luxury-bg px-3 py-3 text-left text-sm font-semibold text-white transition-all hover:border-gold/50 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
                    <FcGoogle className="text-lg" />
                  </span>
                  <span className="flex-1">{isSigningIn ? 'Conectando...' : 'Entrar com Google'}</span>
                  <HiOutlineArrowRight className="text-base text-gold/80 transition-transform group-hover:translate-x-0.5" />
                </button>
                {authError ? <p className="mt-2 px-1 text-[11px] text-red-300">{authError}</p> : null}
              </div>
            ) : null}
            <button className="lg:hidden text-white" type="button" aria-label="Abrir menu">
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
