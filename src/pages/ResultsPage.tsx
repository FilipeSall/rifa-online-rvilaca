import Header from '../components/home/Header'
import Footer from '../components/home/Footer'
import PrizeWinnersShowcase from '../components/winners/PrizeWinnersShowcase'
import PublicNumberLookupSection from '../components/winners/PublicNumberLookupSection'
import resultsHeroImage from '../assets/IMG_9401.webp'

const federalRules = [
  {
    title: 'Fonte oficial',
    description: 'Apuração vinculada às extrações da Loteria Federal.',
  },
  {
    title: 'Data de referência',
    description: 'Sorteios oficiais considerados nas datas definidas em regulamento.',
  },
  {
    title: 'Garantia de rodada',
    description: 'Regra de redundância aplicada para garantir ganhador em toda rodada.',
  },
]

export default function ResultsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-neon-pink selection:text-black">
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-white/10 py-14 lg:py-20">
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-no-repeat"
            style={{ backgroundImage: `url(${resultsHeroImage})`, backgroundPosition: '74% 32%' }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,11,16,0.88)_0%,rgba(7,11,16,0.62)_42%,rgba(7,11,16,0.18)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.2),transparent_48%),radial-gradient(circle_at_90%_15%,rgba(16,185,129,0.2),transparent_38%),linear-gradient(180deg,rgba(7,11,16,0.68)_0%,rgba(7,11,16,0.88)_100%)]" />
          <div className="pointer-events-none absolute -left-12 top-8 h-56 w-56 rounded-full border border-white/10 opacity-30" />
          <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="container relative z-10 mx-auto px-4 lg:px-8">
            <div className="max-w-4xl rounded-2xl border border-white/15 bg-black/35 p-5 backdrop-blur-sm lg:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Auditoria pública</p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-[1.1] text-white lg:text-6xl">
                Premiação e Ganhadores
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-gray-100 lg:text-base">
                Aqui você acompanha os resultados publicados, regras de validação e histórico da apuração oficial.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {federalRules.map((rule) => (
                  <article
                    key={rule.title}
                    className="rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-xs text-gray-100 backdrop-blur"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">{rule.title}</p>
                    <p className="mt-2 font-medium leading-relaxed text-gray-100">{rule.description}</p>
                  </article>
                ))}
              </div>
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
