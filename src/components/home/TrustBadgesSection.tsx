const BADGES = [
  { icon: 'lock', label: 'Ambiente Seguro', iconClassName: 'text-green-500' },
  { icon: 'verified_user', label: 'Sorteio Verificado', iconClassName: 'text-blue-500' },
  { icon: 'workspace_premium', label: 'Garantia de Entrega', iconClassName: 'text-yellow-500' },
]

export default function TrustBadgesSection() {
  return (
    <section className="py-10 bg-black border-t border-white/5">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
          {BADGES.map(({ icon, label, iconClassName }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-3xl ${iconClassName}`}>{icon}</span>
              <span className="text-sm font-bold text-white">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
