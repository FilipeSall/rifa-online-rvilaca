import { useMemo } from 'react'
import Footer from '../components/home/Footer'
import Header from '../components/home/Header'
import { TOP_BUYERS_SCHEDULE_TIMEZONE, TOP_BUYERS_WEEKDAY_OPTIONS } from '../const/campaign'
import { useCampaignSettings } from '../hooks/useCampaignSettings'
import { normalizeTopBuyersWeeklySchedule, resolveFreezeAtMs, resolveNextDrawAtMs } from '../utils/topBuyersSchedule'

const validationChecklist = [
  'Confira a data do sorteio publicada no resultado oficial.',
  'Valide as extrações da Loteria Federal correspondentes ao concurso.',
  'Compare o cálculo divulgado com a regra descrita neste regulamento.',
]

function formatBrazilDateTime(valueMs: number) {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: TOP_BUYERS_SCHEDULE_TIMEZONE,
  }).format(new Date(valueMs))
}

export default function RegulationPage() {
  const { campaign } = useCampaignSettings()
  const topBuyersSchedule = useMemo(
    () => normalizeTopBuyersWeeklySchedule(campaign.topBuyersWeeklySchedule),
    [campaign.topBuyersWeeklySchedule],
  )
  const topBuyersNextDrawAtMs = useMemo(
    () => resolveNextDrawAtMs(topBuyersSchedule),
    [topBuyersSchedule],
  )
  const topBuyersNextFreezeAtMs = useMemo(
    () => resolveFreezeAtMs(topBuyersNextDrawAtMs),
    [topBuyersNextDrawAtMs],
  )
  const topBuyersWeekdayLabel = useMemo(
    () => TOP_BUYERS_WEEKDAY_OPTIONS.find((item) => item.value === topBuyersSchedule.dayOfWeek)?.label || 'Sexta-feira',
    [topBuyersSchedule.dayOfWeek],
  )
  const weeklyRankingText = useMemo(
    () => `Regra V2 ativa: a apuração usa comparação por sufixo (últimas casas) em ciclos 6→5→4→3.
Em cada ciclo, as extrações informadas são avaliadas na ordem e cada extração percorre o ranking do 1º ao último elegível.
No Sorteio TOP, a base é o ranking semanal; no Sorteio Geral, a base é o ranking acumulado da campanha.
Sem ganhador após o ciclo de 3 dígitos, aplica-se fallback por proximidade numérica (abaixo/acima) até encontrar bilhete elegível.
O ranking semanal TOP é encerrado no horário configurado (${topBuyersWeekdayLabel} às ${topBuyersSchedule.drawTime}, ${TOP_BUYERS_SCHEDULE_TIMEZONE}).`,
    [topBuyersSchedule.drawTime, topBuyersWeekdayLabel],
  )
  const ruleBlocks = useMemo(
    () => [
      {
        title: 'Ranking e elegibilidade',
        items: [
          `A janela semanal é definida por ciclos de congelamento: do congelamento anterior até o congelamento atual (no horário do sorteio).`,
          `Somente compras com status pago dentro da janela entram no ranking semanal.`,
          'No Sorteio TOP, o ranking considera os maiores compradores do ciclo semanal (até o limite configurado).',
          'No Sorteio Geral, o ranking considera todos os participantes elegíveis da campanha.',
          'Empates são resolvidos por ordem de primeira compra paga mais antiga na semana.',
        ],
      },
      {
        title: 'Ordem da apuração V2',
        items: [
          'A apuração usa as extrações da Loteria Federal informadas para a rodada (1 a 5).',
          'Cada extração é normalizada em 6 dígitos e comparada pelos dígitos finais com os bilhetes dos participantes.',
          'Os ciclos seguem a ordem fixa: 6 dígitos, depois 5, depois 4, depois 3.',
          'Em cada extração, a varredura sempre começa do 1º lugar do ranking.',
        ],
      },
      {
        title: 'Fallback e garantia de ganhador',
        items: [
          'Se o ciclo de 3 dígitos terminar sem match, entra fallback por proximidade numérica do código de 3 dígitos.',
          'A busca de proximidade respeita ordem do ranking e direção abaixo/acima.',
          'Persistindo ausência de match elegível, o sistema aplica contingência final para garantir ganhador.',
          'Cada resultado registra trilha de tentativas, fase aplicada e bilhete vencedor para auditoria.',
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
    ],
    [],
  )
  const regulationHighlights = useMemo(
    () => [
      {
        label: 'Próximo sorteio Top',
        value: formatBrazilDateTime(topBuyersNextDrawAtMs),
        note: `Agenda semanal: ${topBuyersWeekdayLabel} às ${topBuyersSchedule.drawTime}`,
      },
      {
        label: 'Próximo congelamento',
        value: formatBrazilDateTime(topBuyersNextFreezeAtMs),
        note: 'Congelamento no horário do sorteio',
      },
      {
        label: 'Fuso oficial',
        value: TOP_BUYERS_SCHEDULE_TIMEZONE,
        note: 'Configuração única para ranking e sorteio Top',
      },
    ],
    [topBuyersNextDrawAtMs, topBuyersNextFreezeAtMs, topBuyersSchedule.drawTime, topBuyersWeekdayLabel],
  )

  return (
    <div className="min-h-screen overflow-x-hidden bg-luxury-bg font-display text-white selection:bg-neon-pink selection:text-black">
      <Header />

      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_15%_20%,rgba(245,158,11,0.22),transparent_40%),radial-gradient(circle_at_85%_10%,rgba(20,184,166,0.2),transparent_36%),linear-gradient(180deg,#0a0f15_0%,#111922_100%)] py-14 lg:py-20">
          <div className="pointer-events-none absolute -left-10 top-10 h-52 w-52 rounded-full border border-white/10 opacity-40" />
          <div className="pointer-events-none absolute -right-16 bottom-[-72px] h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="container relative z-10 mx-auto px-4 lg:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Documento oficial</p>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-black leading-[1.1] text-white lg:text-6xl">
              Regulamento do Sorteio e do Ranking Semanal
            </h1>
            <p className="mt-4 max-w-3xl text-sm text-gray-200 lg:text-base">
              Critérios de participação, janela de apuração, regra de redundância e publicação do resultado oficial.
            </p>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {regulationHighlights.map((highlight) => (
                <article key={highlight.label} className="rounded-xl border border-white/10 bg-black/30 px-4 py-4 backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">{highlight.label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{highlight.value}</p>
                  <p className="mt-1 text-xs text-gray-300">{highlight.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="container mx-auto space-y-6 px-4 lg:px-8">
            <article className="rounded-2xl border border-amber-300/20 bg-[linear-gradient(145deg,rgba(245,158,11,0.14),rgba(17,24,39,0.72))] p-6 lg:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Texto oficial informado pela campanha</p>
              <p className="mt-4 whitespace-pre-line text-base leading-8 text-amber-50/95">
                {weeklyRankingText}
              </p>
            </article>

            <article className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-5 lg:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Como validar um resultado</p>
              <ol className="mt-4 grid gap-3 md:grid-cols-3">
                {validationChecklist.map((item, index) => (
                  <li key={item} className="rounded-xl border border-cyan-100/20 bg-black/25 px-4 py-3 text-sm text-cyan-50">
                    <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-300/20 text-xs font-black text-cyan-100">
                      {index + 1}
                    </span>
                    <p>{item}</p>
                  </li>
                ))}
              </ol>
            </article>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {ruleBlocks.map((block) => (
                <article key={block.title} className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(29,36,57,0.9),rgba(10,14,22,0.92))] p-5 lg:p-6">
                  <h2 className="font-display text-2xl font-bold leading-tight text-white">{block.title}</h2>
                  <ul className="mt-4 space-y-2 text-sm text-gray-200">
                    {block.items.map((item, index) => (
                      <li key={item} className="flex gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                        <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neon-pink/20 text-[10px] font-black text-neon-pink">
                          {index + 1}
                        </span>
                        <p className="leading-relaxed text-gray-100">{item}</p>
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
