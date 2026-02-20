import { PACK_OPTIONS } from '../../const/home'

export default function BuySection() {
  return (
    <section className="py-20 bg-luxury-card border-y border-white/5" id="comprar">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="max-w-4xl mx-auto bg-luxury-bg border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
          <div className="text-center mb-8">
            <h2 className="text-2xl font-luxury font-bold text-white mb-2">Garanta sua participação</h2>
            <p className="text-gray-400 text-sm">
              Por apenas <span className="text-gold font-bold">R$ 0,99</span> cada número.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {PACK_OPTIONS.map(({ amount, popular }) => (
              <button
                key={amount}
                className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all group relative ${
                  popular
                    ? 'bg-luxury-card border border-gold/30 hover:border-gold hover:bg-gold/5 shadow-glow-gold'
                    : 'bg-luxury-card border border-white/10 hover:border-gold/50 hover:bg-white/5'
                }`}
                type="button"
              >
                {popular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gold text-black text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">
                    Popular
                  </div>
                )}
                <span className="text-lg font-black text-white group-hover:text-gold">{amount}</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Números</span>
              </button>
            ))}
          </div>
          <div className="bg-luxury-card rounded-lg p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Total a pagar</p>
              <p className="text-3xl font-black text-white">R$ 49,50</p>
            </div>
            <button className="w-full md:w-auto px-10 py-4 bg-gold hover:bg-gold-hover text-black font-black uppercase tracking-widest rounded transition-all shadow-glow-gold flex items-center justify-center gap-2" type="button">
              Participar Agora <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
