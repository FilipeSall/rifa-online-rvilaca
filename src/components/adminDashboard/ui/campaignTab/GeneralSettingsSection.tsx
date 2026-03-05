import { DEFAULT_TOP_BUYERS_RANKING_LIMIT, TOP_BUYERS_SCHEDULE_TIMEZONE } from '../../../../const/campaign'
import { useScheduleHighlight } from '../../hooks/useScheduleHighlight'
import { CustomSelect } from '../../../ui/CustomSelect'
import { formatBrazilDate, formatBrazilDateTime } from './utils/dateFormatters'
import type { GeneralSettingsSectionProps } from './types'

export default function GeneralSettingsSection({ controller }: GeneralSettingsSectionProps) {
  const { scheduleInputClassName } = useScheduleHighlight()

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-neon-pink">1. Informacoes gerais</p>
      <div className="mt-3 grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-title">
            Nome da campanha
          </label>
          <input
            id="campaign-title"
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
            type="text"
            value={controller.title}
            onChange={(event) => controller.setTitle(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={scheduleInputClassName}>
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at">
              Data de inicio
            </label>
            <input
              id="campaign-starts-at"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
              type="date"
              max={controller.endsAt || undefined}
              value={controller.startsAt}
              onChange={(event) => {
                const nextValue = event.target.value
                controller.setStartsAt(nextValue)
                if (!nextValue) {
                  controller.setStartsAtTime('')
                  return
                }

                if (!controller.startsAtTime) {
                  controller.setStartsAtTime('00:00')
                }
              }}
            />
          </div>
          <div className={scheduleInputClassName}>
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-starts-at-time">
              Hora de inicio
            </label>
            <input
              id="campaign-starts-at-time"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!controller.startsAt}
              step={60}
              type="time"
              value={controller.startsAtTime}
              onChange={(event) => {
                const nextValue = event.target.value
                controller.setStartsAtTime(nextValue)
                if (
                  nextValue
                  && controller.isEndOnSameDayAsStart
                  && controller.endsAtTime
                  && controller.endsAtTime < nextValue
                ) {
                  controller.setEndsAtTime(nextValue)
                }
              }}
            />
          </div>
          <div className={scheduleInputClassName}>
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at">
              Data de fim
            </label>
            <input
              id="campaign-ends-at"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60"
              type="date"
              min={controller.startsAt || undefined}
              value={controller.endsAt}
              onChange={(event) => {
                const nextValue = event.target.value
                controller.setEndsAt(nextValue)
                if (!nextValue) {
                  controller.setEndsAtTime('')
                  return
                }

                if (!controller.endsAtTime) {
                  controller.setEndsAtTime('23:59')
                }

                if (
                  nextValue
                  && controller.startsAt
                  && nextValue === controller.startsAt
                  && controller.startsAtTime
                  && controller.endsAtTime
                  && controller.endsAtTime < controller.startsAtTime
                ) {
                  controller.setEndsAtTime(controller.startsAtTime)
                }
              }}
            />
          </div>
          <div className={scheduleInputClassName}>
            <label className="text-[10px] uppercase tracking-[0.16em] text-gray-500" htmlFor="campaign-ends-at-time">
              Hora de fim
            </label>
            <input
              id="campaign-ends-at-time"
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-neon-pink/60 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!controller.endsAt}
              min={controller.minEndTime}
              step={60}
              type="time"
              value={controller.endsAtTime}
              onChange={(event) => controller.setEndsAtTime(event.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">
          O status e definido automaticamente pelo periodo configurado:
          antes do inicio = agendada, durante o periodo = ativa, apos o fim = encerrada.
        </p>

        <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100">Agendamento do Sorteio Top (Semanal)</p>
          <div className="mt-3 rounded-lg border border-cyan-200/30 bg-black/25 px-3 py-3">
            <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-top-buyers-ranking-limit">
              Limite do ranking Top Buyers
            </label>
            <input
              id="campaign-top-buyers-ranking-limit"
              className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
              inputMode="numeric"
              placeholder={String(DEFAULT_TOP_BUYERS_RANKING_LIMIT)}
              type="text"
              value={controller.topBuyersRankingLimitInput}
              onChange={(event) => controller.setTopBuyersRankingLimitInput(event.target.value.replace(/\D/g, ''))}
            />
            <p className="mt-2 text-[11px] text-cyan-100/75">
              Valor padrão: {DEFAULT_TOP_BUYERS_RANKING_LIMIT}. Este limite é usado no ranking público e no sorteio TOP.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-top-buyers-weekday">
                Dia da semana
              </label>
              <CustomSelect
                id="campaign-top-buyers-weekday"
                value={String(controller.topBuyersScheduleDraft.dayOfWeek)}
                options={controller.topBuyersWeekdaySelectOptions}
                onChange={(nextValue) => {
                  const parsed = Number(nextValue)
                  controller.setTopBuyersDrawDayOfWeek(Number.isInteger(parsed) ? parsed : 5)
                }}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-top-buyers-time">
                Hora do sorteio
              </label>
              <input
                id="campaign-top-buyers-time"
                className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
                step={60}
                type="time"
                value={controller.topBuyersScheduleDraft.drawTime}
                onChange={(event) => controller.setTopBuyersDrawTime(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-cyan-200/30 bg-black/30 px-3 py-3">
            <label className="flex items-start gap-3 text-xs text-cyan-50/90" htmlFor="campaign-top-buyers-skip-week">
              <input
                id="campaign-top-buyers-skip-week"
                className="mt-0.5 h-4 w-4 rounded border border-cyan-200/60 bg-black/40 text-neon-pink focus:ring-2 focus:ring-cyan-200/60"
                type="checkbox"
                checked={controller.isSkippingTopBuyersWeek}
                onChange={(event) => {
                  controller.setTopBuyersSkipWeekId(event.target.checked ? controller.topBuyersNextDrawWeekId : '')
                }}
              />
              <span>
                <span className="font-semibold text-cyan-50">Pular o sorteio desta semana</span>
                <span className="mt-1 block text-[11px] text-cyan-100/70">
                  Semana do sorteio: <span className="font-semibold">{formatBrazilDate(controller.topBuyersNextDrawWeekId)}</span>. O ranking continua sendo atualizado,
                  mas o sorteio semanal nao podera ser publicado.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-3 space-y-1 text-xs text-cyan-100/85">
            <p>Fuso oficial: <span className="font-semibold">{TOP_BUYERS_SCHEDULE_TIMEZONE}</span></p>
            <p>Próximo sorteio: <span className="font-semibold">{formatBrazilDateTime(controller.topBuyersNextDrawAtMs)}</span></p>
            <p>Congelamento do ranking: <span className="font-semibold">{formatBrazilDateTime(controller.topBuyersNextFreezeAtMs)}</span> (no horário do sorteio)</p>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
          <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-support-whatsapp">
            WhatsApp da equipe (suporte/premiacao)
          </label>
          <input
            id="campaign-support-whatsapp"
            className="mt-2 h-11 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
            type="text"
            value={controller.supportWhatsappNumber}
            onChange={(event) => controller.setSupportWhatsappNumber(controller.applyPhoneMask(event.target.value))}
            placeholder="+55(62)98507-4477"
          />
        </div>

        <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3">
          <label className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" htmlFor="campaign-whatsapp-contact-message">
            Mensagem automática WhatsApp (ao clicar no botão)
          </label>
          <textarea
            id="campaign-whatsapp-contact-message"
            className="mt-2 w-full rounded-md border border-cyan-200/30 bg-black/25 px-3 py-2 text-sm font-semibold text-cyan-50 outline-none transition-colors focus:border-cyan-200/80"
            value={controller.whatsappContactMessage}
            onChange={(event) => controller.setWhatsappContactMessage(event.target.value)}
            placeholder="Olá! Tenho interesse em comprar números da rifa..."
            rows={3}
          />
        </div>
      </div>
    </section>
  )
}
