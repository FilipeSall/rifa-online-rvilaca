import Header from '../components/home/Header'
import Footer from '../components/home/Footer'
import PrizeWinnersShowcase from '../components/winners/PrizeWinnersShowcase'
import PublicNumberLookupSection from '../components/winners/PublicNumberLookupSection'

const federalRules = [
  'Apuração vinculada às extrações da Loteria Federal.',
  'Sorteios oficiais considerados nas datas definidas em regulamento.',
  'Regra de redundância aplicada para garantir ganhador em toda rodada.',
]

export default function ResultsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-gold selection:text-black">
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.2),transparent_48%),radial-gradient(circle_at_90%_15%,rgba(16,185,129,0.18),transparent_38%),linear-gradient(180deg,#0b0f14_0%,#0f1720_100%)] py-14 lg:py-20">
          <div className="pointer-events-none absolute -left-12 top-8 h-56 w-56 rounded-full border border-white/10 opacity-30" />
          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="container relative z-10 mx-auto px-4 lg:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Auditoria pública</p>
            <h1 className="mt-3 max-w-3xl font-luxury text-4xl font-black leading-[1.1] text-white lg:text-6xl">
              Premiação e Ganhadores
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-gray-200 lg:text-base">
              Aqui você acompanha os resultados publicados, regras de validação e histórico da apuração oficial.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {federalRules.map((rule) => (
                <article
                  key={rule}
                  className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-medium text-gray-100 backdrop-blur"
                >
                  {rule}
                </article>
              ))}
            </div>
          </div>
        </section>

        <PublicNumberLookupSection />

        <PrizeWinnersShowcase mode="public" />
      </main>

      <Footer />
    </div>
  )
}
