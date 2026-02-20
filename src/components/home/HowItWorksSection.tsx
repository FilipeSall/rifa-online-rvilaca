import { HOW_IT_WORKS_STEPS } from '../../const/home'

export default function HowItWorksSection() {
  return (
    <section className="py-20 bg-luxury-bg relative overflow-hidden scroll-mt-24" id="como-funciona">
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Passo a Passo</span>
          <h2 className="text-3xl font-luxury font-bold text-white">Como Participar</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          <div className="hidden md:block absolute top-8 left-[16%] right-[16%] h-[1px] bg-gradient-to-r from-transparent via-gold/30 to-transparent z-0" />
          {HOW_IT_WORKS_STEPS.map(({ num, title, desc }) => (
            <div key={num} className="relative z-10 flex flex-col items-center text-center group">
              <div className="w-16 h-16 rounded-full bg-luxury-card border border-gold/30 flex items-center justify-center mb-6 group-hover:border-gold group-hover:shadow-glow-gold transition-all duration-300">
                <span className="text-xl font-black text-white">{num}</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-3 uppercase tracking-wide">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed px-4">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
