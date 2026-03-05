import {
  DEFAULT_BONUS_PRIZE,
  DEFAULT_BONUS_PRIZE_QUANTITY,
  DEFAULT_CAMPAIGN_TITLE,
  DEFAULT_MAIN_PRIZE,
  DEFAULT_SECOND_PRIZE,
  DEFAULT_TOTAL_NUMBERS,
} from '../../../../const/campaign'
import { formatPrizeLabelWithQuantity } from '../../../../utils/campaignPrizes'
import type { CampaignPreviewCardProps } from './types'

export default function CampaignPreviewCard({
  title,
  totalNumbersInput,
  mainPrize,
  secondPrize,
  bonusPrize,
  bonusPrizeQuantityInput,
  additionalPrizes,
}: CampaignPreviewCardProps) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-luxury-card p-5 xl:flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,0,204,0.16),transparent_48%)]" />
      <div className="relative z-10 xl:flex xl:h-full xl:flex-col">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-pink">Preview ao vivo</p>
        <h4 className="mt-3 font-display text-2xl font-bold text-white">{title.trim() || DEFAULT_CAMPAIGN_TITLE}</h4>
        <p className="mt-2 text-sm text-gray-300">
          Visual de como a comunicação principal da campanha fica após o salvamento.
        </p>
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-amber-200">Total de numeros</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {(Number(totalNumbersInput.replace(/[^0-9]/g, '')) || DEFAULT_TOTAL_NUMBERS).toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="rounded-xl border border-neon-pink/25 bg-black/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-neon-pink">1º prêmio</p>
            <p className="mt-1 text-sm font-semibold text-white">{mainPrize.trim() || DEFAULT_MAIN_PRIZE}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400">2º prêmio</p>
            <p className="mt-1 text-sm font-semibold text-white">{secondPrize.trim() || DEFAULT_SECOND_PRIZE}</p>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-300">Prêmio extra</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatPrizeLabelWithQuantity(
                bonusPrize.trim() || DEFAULT_BONUS_PRIZE,
                Number(bonusPrizeQuantityInput) || DEFAULT_BONUS_PRIZE_QUANTITY,
              )}
            </p>
          </div>
          {additionalPrizes.map((prize, index) => (
            <div key={index} className="rounded-xl border border-purple-400/20 bg-purple-500/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-purple-300">Prêmio adicional {index + 1}</p>
              <p className="mt-1 text-sm font-semibold text-white">{formatPrizeLabelWithQuantity(prize.label, prize.quantity)}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
