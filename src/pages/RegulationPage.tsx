import Footer from '../components/home/Footer'
import Header from '../components/home/Header'

const weeklyRankingText = `A cada semana da campanha será apurado o ranking dos 50 participantes que adquirirem a maior quantidade de números no período semanal definido.
Estes participantes concorrerão a um sorteio exclusivo realizado com base na extração da Loteria Federal do sábado correspondente.
O número do prêmio da Loteria Federal será convertido matematicamente em posição do ranking, determinando o ganhador.
O ranking semanal será encerrado e congelado às 23:59 da sexta-feira anterior ao sorteio.`

const ruleBlocks = [
  {
    title: 'Janela semanal e elegibilidade',
    items: [
      'A janela semanal considerada no sistema é de domingo 00:00 até sexta-feira 23:59 (America/Sao_Paulo).',
      'Somente compras com status pago dentro da janela entram no ranking semanal.',
      'O ranking semanal considera os 50 maiores compradores do período.',
      'Empates são resolvidos por ordem de primeira compra paga mais antiga na semana.',
    ],
  },
  {
    title: 'Apuração pela Loteria Federal',
    items: [
      'A apuração usa a extração oficial da Loteria Federal na data prevista no calendário da campanha.',
      'São consideradas as 5 extrações oficiais do concurso para a etapa de validação.',
      'A conversão do número sorteado em posição do ranking segue a regra matemática configurada no sistema.',
    ],
  },
  {
    title: 'Regra de redundância e garantia de ganhador',
    items: [
      'Se não houver correspondência na primeira tentativa, a apuração avança pelas extrações subsequentes.',
      'Se necessário, é aplicado o critério de fallback previsto em regulamento para garantir ganhador na rodada.',
      'Cada resultado publicado registra trilha de tentativas, posição vencedora, código vencedor e participante contemplado.',
    ],
  },
  {
    title: 'Publicação e conferência',
    items: [
      'O resultado oficial é publicado no painel administrativo e na área pública de ganhadores.',
      'A identificação do contemplado é vinculada ao cadastro e aos pedidos pagos do participante.',
      'O participante pode conferir o concurso da data correspondente nos canais oficiais da Loteria Federal.',
    ],
  },
]

export default function RegulationPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-gold selection:text-black">
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_15%_20%,rgba(245,158,11,0.22),transparent_40%),radial-gradient(circle_at_85%_10%,rgba(20,184,166,0.2),transparent_36%),linear-gradient(180deg,#0a0f15_0%,#111922_100%)] py-14 lg:py-20">
          <div className="pointer-events-none absolute -left-10 top-10 h-52 w-52 rounded-full border border-white/10 opacity-40" />
          <div className="pointer-events-none absolute -right-16 bottom-[-72px] h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="container relative z-10 mx-auto px-4 lg:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Documento oficial</p>
            <h1 className="mt-3 max-w-4xl font-luxury text-4xl font-black leading-[1.1] text-white lg:text-6xl">
              Regulamento do Sorteio e do Ranking Semanal
            </h1>
            <p className="mt-4 max-w-3xl text-sm text-gray-200 lg:text-base">
              Critérios de participação, janela de apuração, regra de redundância e publicação do resultado oficial.
            </p>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="container mx-auto space-y-6 px-4 lg:px-8">
            <article className="rounded-2xl border border-amber-300/20 bg-amber-500/5 p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Texto oficial informado pela campanha</p>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-amber-100/90">
                {weeklyRankingText}
              </p>
            </article>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {ruleBlocks.map((block) => (
                <article key={block.title} className="rounded-2xl border border-white/10 bg-luxury-card/90 p-5">
                  <h2 className="font-luxury text-2xl font-bold text-white">{block.title}</h2>
                  <ul className="mt-4 space-y-2 text-sm text-gray-200">
                    {block.items.map((item) => (
                      <li key={item} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
