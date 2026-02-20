const RANKING = [
  { pos: 1, name: 'Rafael M.', cotas: 520, isGold: true },
  { pos: 2, name: 'Ana Paula S.', cotas: 415, isGold: false },
  { pos: 3, name: 'Carlos E.', cotas: 380, isGold: false },
  { pos: 4, name: 'Julia R.', cotas: 250, isGold: false },
  { pos: 5, name: 'Marcos V.', cotas: 210, isGold: false },
]

const FAQ_ITEMS = [
  {
    q: 'Como recebo meu prêmio?',
    a: 'Após a apuração do resultado, nossa equipe entrará em contato via WhatsApp e telefone para alinhar a entrega do prêmio. Para prêmios físicos como a moto, cobrimos todos os custos de envio.',
  },
  {
    q: 'O sorteio é confiável?',
    a: 'Sim! Utilizamos os números da Loteria Federal para definir os ganhadores, garantindo 100% de imparcialidade e transparência. Você pode conferir o resultado diretamente no site da Caixa.',
  },
  {
    q: 'Posso pagar com cartão de crédito?',
    a: 'Atualmente aceitamos exclusivamente PIX, pois permite a baixa automática e instantânea dos seus números, garantindo sua participação imediata no sorteio.',
  },
]

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
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                    pos === 1
                      ? 'bg-gold text-black'
                      : pos === 2
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-900 text-gray-400'
                  }`}
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
  return (
    <div id="faq">
      <div className="flex items-center gap-3 mb-8">
        <span className="material-symbols-outlined text-gold">help</span>
        <h3 className="text-xl font-luxury font-bold text-white uppercase tracking-wider">Perguntas Frequentes</h3>
      </div>
      <div className="space-y-4">
        {FAQ_ITEMS.map(({ q, a }) => (
          <details
            key={q}
            className="group bg-luxury-card border border-white/5 rounded-lg open:border-gold/30 transition-all"
          >
            <summary className="flex cursor-pointer items-center justify-between p-4 font-medium text-white group-hover:text-gold transition-colors">
              {q}
              <span className="material-symbols-outlined transition-transform group-open:rotate-180">
                expand_more
              </span>
            </summary>
            <div className="px-4 pb-4 text-sm text-gray-400 leading-relaxed">{a}</div>
          </details>
        ))}
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
