import { useState } from 'react'
import { FAQ_ITEMS, RANKING } from '../../const/home'
import { getRankingPositionClass } from '../../utils/home'

function RankingTable() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <span className="material-symbols-outlined text-gold">trophy</span>
        <h3 className="text-xl font-luxury font-bold text-white uppercase tracking-wider">Ranking dos Campeões</h3>
      </div>
      <div className="bg-luxury-card border border-white/5 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
          <span className="text-xs font-bold text-gray-400 uppercase">Usuário</span>
          <span className="text-xs font-bold text-gray-400 uppercase">Cotas Compradas</span>
        </div>
        <div className="divide-y divide-white/5">
          {RANKING.map(({ pos, name, cotas, isGold }) => (
            <div key={pos} className="p-4 flex justify-between items-center hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${getRankingPositionClass(pos)}`}
                >
                  {pos}
                </div>
                <span className="text-sm font-medium text-white">{name}</span>
              </div>
              <span className={`text-sm font-bold ${isGold ? 'text-gold' : 'text-white'}`}>{cotas}</span>
            </div>
          ))}
        </div>
        <div className="p-4 bg-luxury-card border-t border-white/5">
          <p className="text-xs text-gray-500 text-center">
            O maior comprador ganha <span className="text-gold font-bold">R$ 5.000</span> extras!
          </p>
        </div>
      </div>
    </div>
  )
}

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div id="faq">
      <div className="flex items-center gap-3 mb-8">
        <span className="material-symbols-outlined text-gold">help</span>
        <h3 className="text-xl font-luxury font-bold text-white uppercase tracking-wider">Perguntas Frequentes</h3>
      </div>
      <div className="space-y-4">
        {FAQ_ITEMS.map(({ q, a }, index) => {
          const isOpen = openIndex === index

          return (
            <article
            key={q}
            className={`group overflow-hidden rounded-lg border bg-luxury-card transition-all duration-300 ${
              isOpen ? 'border-gold/30 shadow-[0_0_18px_rgba(245,168,0,0.08)]' : 'border-white/5'
            }`}
          >
            <button
              className="flex w-full cursor-pointer items-center justify-between p-4 text-left font-medium text-white transition-colors group-hover:text-gold"
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex((current) => (current === index ? null : index))}
            >
              {q}
              <span className={`material-symbols-outlined transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-4 text-sm leading-relaxed text-gray-400">{a}</div>
              </div>
            </div>
          </article>
          )
        })}
      </div>
    </div>
  )
}

export default function WinnersFaqSection() {
  return (
    <section className="py-20 bg-luxury-bg" id="ganhadores">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <RankingTable />
          <FaqAccordion />
        </div>
      </div>
    </section>
  )
}
