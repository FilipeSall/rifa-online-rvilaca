type WinnersFloatingButtonProps = {
  onClick: () => void
}

export default function WinnersFloatingButton({ onClick }: WinnersFloatingButtonProps) {
  return (
    <div className="winners-fab-appear relative">
      <div className="relative">
        <span className="winners-badge-attention pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/60 bg-gold px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-black shadow-[0_10px_25px_rgba(0,0,0,0.35)]">
          Novos ganhadores
        </span>

        <button
          type="button"
          onClick={onClick}
          aria-label="Abrir lista de novos ganhadores"
          className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-gold/70 bg-[radial-gradient(circle_at_35%_30%,#ffd568,#f5a800_56%,#b87900_100%)] text-black shadow-[0_14px_35px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-gold/75"
        >
          <span className="absolute inset-0 rounded-full border border-white/35 opacity-75" />
          <span className="material-symbols-outlined relative z-10 text-[34px]">emoji_events</span>
        </button>
      </div>
    </div>
  )
}
