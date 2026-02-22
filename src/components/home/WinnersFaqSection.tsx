import { useState } from 'react'
import { FAQ_ITEMS, RANKING } from '../../const/home'

function RankingSection() {
  return (
    <section className="py-20 bg-luxury-bg relative overflow-hidden" id="ganhadores">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold/5 via-luxury-bg to-luxury-bg pointer-events-none"></div>
      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="text-center mb-16">
          <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Top Compradores</span>
          <div className="flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-gold text-4xl">trophy</span>
            <h2 className="text-3xl lg:text-4xl font-luxury font-bold text-white">Ranking dos Campeões</h2>
          </div>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
            Os maiores compradores garantem prêmios exclusivos e aumentam suas chances de vitória.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-luxury-card border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative">
            <div className="grid grid-cols-12 gap-4 p-6 bg-white/5 border-b border-white/5 text-xs font-bold text-gray-400 uppercase tracking-widest">
              <div className="col-span-2 text-center">Posição</div>
              <div className="col-span-6 md:col-span-7">Participante</div>
              <div className="col-span-4 md:col-span-3 text-right">Cotas</div>
            </div>

            <div className="divide-y divide-white/5">
              {RANKING.map(({ pos, name, cotas, isGold }) => {
                if (pos === 1) {
                  return (
                    <div key={pos} className="grid grid-cols-12 gap-4 p-6 items-center bg-gradient-to-r from-gold/10 to-transparent hover:bg-white/5 transition-colors group">
                      <div className="col-span-2 flex justify-center">
                        <div className="w-12 h-12 rounded-full bg-medal-gold flex items-center justify-center shadow-lg shadow-gold/20 ring-2 ring-gold/50 group-hover:scale-110 transition-transform">
                          <span className="text-xl font-black text-black">1º</span>
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-7 flex flex-col justify-center">
                        <span className="text-lg font-bold text-white group-hover:text-gold transition-colors">{name}</span>
                        <span className="text-xs text-gold font-medium uppercase tracking-wider mt-1">Líder do Ranking</span>
                      </div>
                      <div className="col-span-4 md:col-span-3 text-right">
                        <span className="text-xl font-black text-gold">{cotas}</span>
                        <span className="text-[10px] text-gray-500 block uppercase">Bilhetes</span>
                      </div>
                    </div>
                  )
                }

                if (pos === 2) {
                  return (
                    <div key={pos} className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-white/5 transition-colors group">
                      <div className="col-span-2 flex justify-center">
                        <div className="w-10 h-10 rounded-full bg-medal-silver flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <span className="text-base font-black text-black">2º</span>
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-7 flex flex-col justify-center">
                        <span className="text-base font-bold text-white">{name}</span>
                      </div>
                      <div className="col-span-4 md:col-span-3 text-right">
                        <span className="text-lg font-bold text-white">{cotas}</span>
                        <span className="text-[10px] text-gray-500 block uppercase">Bilhetes</span>
                      </div>
                    </div>
                  )
                }

                if (pos === 3) {
                  return (
                    <div key={pos} className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-white/5 transition-colors group">
                      <div className="col-span-2 flex justify-center">
                        <div className="w-10 h-10 rounded-full bg-medal-bronze flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <span className="text-base font-black text-black">3º</span>
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-7 flex flex-col justify-center">
                        <span className="text-base font-bold text-white">{name}</span>
                      </div>
                      <div className="col-span-4 md:col-span-3 text-right">
                        <span className="text-lg font-bold text-white">{cotas}</span>
                        <span className="text-[10px] text-gray-500 block uppercase">Bilhetes</span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={pos} className="grid grid-cols-12 gap-4 p-5 items-center hover:bg-white/5 transition-colors">
                    <div className="col-span-2 flex justify-center">
                      <div className="w-8 h-8 rounded-full bg-luxury-border flex items-center justify-center text-gray-400 font-bold border border-white/10">
                        {pos}º
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-7 flex flex-col justify-center">
                      <span className="text-sm font-medium text-gray-300">{name}</span>
                    </div>
                    <div className="col-span-4 md:col-span-3 text-right">
                      <span className={`text-base font-bold ${isGold ? 'text-gold' : 'text-gray-300'}`}>{cotas}</span>
                      <span className="text-[10px] text-gray-600 block uppercase">Bilhetes</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-6 bg-white/5 border-t border-white/5 text-center">
              <p className="text-sm text-gray-400">
                O maior comprador da edição ganha <span className="text-gold font-bold">R$ 5.000</span> extras no PIX!
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="py-20 bg-luxury-card border-t border-white/5" id="faq">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Dúvidas?</span>
          <div className="flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-gold text-4xl">help</span>
            <h2 className="text-3xl lg:text-4xl font-luxury font-bold text-white">Perguntas Frequentes</h2>
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {FAQ_ITEMS.map(({ q, a }, index) => {
            const isOpen = openIndex === index
            return (
              <article
                key={q}
                className={`group overflow-hidden rounded-xl border bg-luxury-bg transition-all duration-300 hover:border-gold/30 ${
                  isOpen ? 'border-gold shadow-glow-gold' : 'border-white/5'
                }`}
              >
                <button
                  className="flex w-full cursor-pointer items-center justify-between p-6 text-left select-none"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                >
                  <span className="text-lg font-medium text-white group-hover:text-gold transition-colors">{q}</span>
                  <span
                    className={`material-symbols-outlined transition-transform duration-300 ${
                      isOpen ? 'rotate-180 text-gold' : 'text-gray-500'
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className={`px-6 pb-6 text-sm leading-relaxed text-gray-400 border-t border-white/5 pt-4`}>{a}</div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default function WinnersFaqSection() {
  return (
    <>
      <RankingSection />
      <FaqSection />
    </>
  )
}
