import type { WinnerFeedItem } from '../../services/winners/winnersService'

type WinnerCardProps = {
  winner: WinnerFeedItem
}

function getInitials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean)

  if (!tokens.length) {
    return 'GP'
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase()
  }

  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase()
}

function formatDrawDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || '-'
  }

  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

export default function WinnerCard({ winner }: WinnerCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(0,0,0,0.35))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.35)]">
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-neon-pink/50 bg-black/40">
          {winner.winnerPhotoUrl ? (
            <img
              src={winner.winnerPhotoUrl}
              alt={`Foto de ${winner.winnerName}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500/80 to-yellow-300/90 text-sm font-black text-black">
              {getInitials(winner.winnerName)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-white break-words">{winner.winnerName}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-gray-400">
            {winner.drawType === 'main_raffle' ? 'Sorteio principal' : 'Top compradores'} | {formatDrawDate(winner.drawDate)}
          </p>

          <div className="mt-3 grid gap-2 text-xs text-gray-200 sm:grid-cols-2">
            <p>
              Número premiado:{' '}
              <span className="font-semibold text-neon-pink">{winner.winningNumber}</span>
            </p>
            <p>
              Número da lotérica:{' '}
              <span className="font-semibold text-neon-pink">{winner.lotteryNumber}</span>
            </p>
            <p className="sm:col-span-2">
              Prêmio:{' '}
              <span className="font-semibold text-amber-100">{winner.prizeLabel}</span>
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
