const NAV_ITEMS = [
  { label: 'Início', href: '#', isActive: true },
  { label: 'Como Funciona', href: '#como-funciona', isActive: false },
  { label: 'Ganhadores', href: '#ganhadores', isActive: false },
  { label: 'FAQ', href: '#faq', isActive: false },
  { label: 'Regulamento', href: '#', isActive: false },
  { label: 'Minha Conta', href: '#', isActive: false },
]

export default function Header() {
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

          <div className="flex items-center gap-4">
            <button className="hidden md:flex h-10 items-center justify-center rounded bg-gold hover:bg-gold-hover px-6 text-xs font-black text-black transition-all uppercase tracking-widest shadow-glow-gold">
              Comprar Números
            </button>
            <button className="lg:hidden text-white" type="button" aria-label="Abrir menu">
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
