import { useEffect, useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { HiOutlineArrowRight } from 'react-icons/hi2'
import { Link, useLocation } from 'react-router-dom'
import { HEADER_NAV_ITEMS } from '../../const/home'
import { useHeaderAuth } from '../../hooks/useHeaderAuth'
import { formatCpfInput } from '../../utils/cpf'

export default function Header() {
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const {
    isLoggedIn,
    userRole,
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
  } = useHeaderAuth()
  const isHomePage = location.pathname === '/'

  const formatPhone = (value: string) => {
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

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname, location.hash])

  const getNavTarget = (href: string) => (href === '#' ? '/' : `/${href}`)

  const isNavItemActive = (href: string) => {
    if (!isHomePage) {
      return false
    }

    if (href === '#') {
      return location.hash === '' || location.hash === '#'
    }

    return location.hash === href
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
            {HEADER_NAV_ITEMS.map(({ label, href }) => (
              <Link
                key={label}
                className={`text-xs font-bold hover:text-gold transition-colors uppercase tracking-widest ${
                  isNavItemActive(href) ? 'text-white' : 'text-gray-400'
                }`}
                to={getNavTarget(href)}
              >
                {label}
              </Link>
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
              {isLoggedIn ? (userRole === 'admin' ? 'Dashboard' : 'Minha conta') : 'Entrar'}
            </button>
            {!isLoggedIn && isAuthModalOpen ? (
              <div className="absolute right-4 top-[calc(100%-0.35rem)] w-[310px] overflow-hidden rounded-xl border border-gold/30 bg-luxury-card/95 p-3 shadow-2xl backdrop-blur-md md:right-8 lg:right-8">
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
                {googleAuthError ? <p className="mt-2 px-1 text-[11px] text-red-300">{googleAuthError}</p> : null}
                <div className="my-3 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30">
                  <span className="h-px flex-1 bg-white/10" />
                  ou
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <div className="space-y-2">
                  <button
                    className="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-left text-sm font-semibold text-white transition-all hover:border-gold/50 hover:bg-black/60"
                    type="button"
                    onClick={handleEmailOptionClick}
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
                      <span className="material-symbols-outlined text-lg text-gold">alternate_email</span>
                    </span>
                    <span className="flex-1">Entrar com email</span>
                    <HiOutlineArrowRight className="text-base text-gold/80 transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <button
                    className="w-full px-1 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/80 transition-colors hover:text-gold"
                    type="button"
                    onClick={handleCreateAccountClick}
                  >
                    {isCreatingAccount ? 'Já tenho conta' : 'Criar conta'}
                  </button>
                </div>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    isEmailFormOpen ? 'mt-3 max-h-[460px] opacity-100 translate-y-0' : 'mt-0 max-h-0 opacity-0 -translate-y-2 pointer-events-none'
                  }`}
                  aria-hidden={!isEmailFormOpen}
                >
                  <form className="space-y-3" onSubmit={handleEmailAuthSubmit}>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Email</label>
                      <input
                        className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/30"
                        type="email"
                        placeholder="Digite seu email"
                        value={emailValue}
                        onChange={(event) => setEmailValue(event.target.value)}
                        autoComplete="email"
                        disabled={!isEmailFormOpen || isEmailSubmitting}
                        required={isEmailFormOpen}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Senha</label>
                      <input
                        className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/30"
                        type="password"
                        placeholder="Digite sua senha"
                        value={passwordValue}
                        onChange={(event) => setPasswordValue(event.target.value)}
                        autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                        disabled={!isEmailFormOpen || isEmailSubmitting}
                        required={isEmailFormOpen}
                      />
                    </div>
                    {isCreatingAccount ? (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">Telefone</label>
                        <input
                          className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/30"
                          type="tel"
                          inputMode="tel"
                          placeholder="(00) 00000-0000"
                          value={formatPhone(phoneValue)}
                          onChange={(event) => setPhoneValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
                          disabled={!isEmailFormOpen || isEmailSubmitting}
                          required={isEmailFormOpen && isCreatingAccount}
                        />
                      </div>
                    ) : null}
                    {isCreatingAccount ? (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">CPF</label>
                        <input
                          className="w-full rounded-lg border border-white/10 bg-luxury-bg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none focus:ring-1 focus:ring-gold/30"
                          type="text"
                          inputMode="numeric"
                          placeholder="000.000.000-00"
                          value={formatCpfInput(cpfValue)}
                          onChange={(event) => setCpfValue(event.target.value.replace(/\D/g, '').slice(0, 11))}
                          disabled={!isEmailFormOpen || isEmailSubmitting}
                          required={isEmailFormOpen && isCreatingAccount}
                        />
                      </div>
                    ) : null}
                    <button
                      className="flex h-10 w-full items-center justify-center rounded bg-gold px-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-70"
                      type="submit"
                      disabled={!isEmailFormOpen || isEmailSubmitting}
                    >
                      {isEmailSubmitting ? 'Enviando...' : isCreatingAccount ? 'Criar conta' : 'Entrar'}
                    </button>
                    {emailAuthError ? <p className="px-1 text-[11px] text-red-300">{emailAuthError}</p> : null}
                  </form>
                </div>
              </div>
            ) : null}
            <button
              className="lg:hidden text-white"
              type="button"
              aria-label="Abrir menu"
              onClick={() => setIsMobileMenuOpen((currentState) => !currentState)}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>

        {isMobileMenuOpen ? (
          <div className="lg:hidden border-t border-white/10 py-4 space-y-3">
            <nav className="space-y-2">
              {HEADER_NAV_ITEMS.map(({ label, href }) => (
                <Link
                  key={label}
                  className={`block rounded px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                    isNavItemActive(href) ? 'bg-white/5 text-white' : 'text-gray-400 hover:text-gold'
                  }`}
                  to={getNavTarget(href)}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <button
              className="h-10 w-full rounded bg-gold px-4 text-xs font-black uppercase tracking-widest text-black"
              type="button"
              onClick={handleAuthButtonClick}
            >
              {isLoggedIn ? (userRole === 'admin' ? 'Dashboard' : 'Minha conta') : 'Entrar'}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
