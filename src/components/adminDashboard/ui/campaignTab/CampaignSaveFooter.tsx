import type { CampaignSaveFooterProps } from './types'

export default function CampaignSaveFooter({
  hasCampaignChanges,
  isLoading,
  isSaving,
  saveButtonLabel,
  onSaveCampaignSettings,
}: CampaignSaveFooterProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/70 backdrop-blur-md">
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.13em] ${
          hasCampaignChanges ? 'text-amber-200' : 'text-emerald-200'
        }`}>
          {hasCampaignChanges ? 'Alteracoes pendentes para salvar.' : 'Nenhuma alteracao pendente.'}
        </p>
        <button
          className="inline-flex h-11 items-center rounded-lg bg-neon-pink px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
          type="button"
          disabled={isLoading || isSaving || !hasCampaignChanges}
          onClick={() => {
            void onSaveCampaignSettings()
          }}
          data-testid="campaign-save-button"
        >
          {saveButtonLabel}
        </button>
      </div>
    </div>
  )
}
