import { memo } from 'react'
import type { MediaSectionProps } from './types'

function MediaSectionComponent({ controller }: MediaSectionProps) {
  return (
    <article className="rounded-3xl border border-emerald-300/20 bg-emerald-500/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-200">4. Midias</p>
          <p className="mt-1 text-xs text-emerald-100/80">
            Gerencie imagens do carrossel (maximo 12) e 1 video em destaque para o botao flutuante.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-emerald-300/25 bg-black/25 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-200">Slides ativos</p>
            <p className="mt-1 text-sm font-black text-white">{controller.activeHeroSlides}</p>
          </div>
          <div className="rounded-lg border border-cyan-300/25 bg-black/25 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-200">Video destaque</p>
            <p className="mt-1 text-sm font-black text-white">{controller.featuredVideo?.active ? 'Ativo' : 'Inativo'}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-300/20 bg-black/25 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-cyan-100">Video de destaque</p>
            <p className="mt-1 text-xs text-cyan-100/70">Apenas 1 video ativo por vez.</p>
          </div>
          {controller.featuredVideo ? (
            <span className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
              Publicado
            </span>
          ) : (
            <span className="rounded-full border border-gray-400/30 bg-gray-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-300">
              Sem video
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-cyan-100" htmlFor="campaign-featured-video-file">
              Arquivo de video
            </label>
            <input
              id="campaign-featured-video-file"
              accept="video/*"
              className="mt-2 block h-11 w-full cursor-pointer rounded-md border border-cyan-200/30 bg-black/40 px-3 py-2 text-xs text-cyan-50 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-cyan-300/25 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-cyan-100"
              type="file"
              onChange={(event) => controller.setSelectedFeaturedVideoFile(event.target.files?.[0] ?? null)}
              data-testid="campaign-featured-video-file-input"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              className="inline-flex h-11 items-center rounded-lg bg-cyan-300 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void controller.handleUploadFeaturedVideo()
              }}
              disabled={controller.isFeaturedVideoBusy || !controller.selectedFeaturedVideoFile}
              data-testid="campaign-featured-video-upload-button"
            >
              {controller.isUploadingFeaturedVideo ? 'Enviando...' : controller.featuredVideo ? 'Substituir video' : 'Publicar video'}
            </button>
            <button
              className="inline-flex h-11 items-center rounded-lg border border-red-400/35 bg-red-500/10 px-5 text-xs font-black uppercase tracking-[0.14em] text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void controller.handleRemoveFeaturedVideo()
              }}
              disabled={controller.isFeaturedVideoBusy || !controller.featuredVideo}
            >
              {controller.isRemovingFeaturedVideo ? 'Removendo...' : 'Remover'}
            </button>
          </div>
        </div>

        {controller.selectedFeaturedVideoFile ? (
          <p className="mt-2 text-[11px] text-cyan-100/80">
            Arquivo selecionado: <span className="font-semibold text-cyan-50">{controller.selectedFeaturedVideoFile.name}</span>
          </p>
        ) : null}

        {controller.featuredVideo ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center">
              <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/70">
                <video
                  className="h-full w-full object-cover"
                  controls
                  preload="metadata"
                  src={controller.featuredVideo.url}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Video atual exibido no botao flutuante</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  Criado em {new Date(controller.featuredVideo.createdAt).toLocaleString('pt-BR')}
                </p>
                <p className="mt-2 truncate text-[11px] text-gray-500" title={controller.featuredVideo.url}>
                  {controller.featuredVideo.url}
                </p>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                <button
                  type="button"
                  className="inline-flex h-8 items-center rounded-md border border-white/15 bg-black/40 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-200 transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-55"
                  onClick={() => {
                    void controller.handleCopyFeaturedVideoUrl(controller.featuredVideo!.url, controller.featuredVideo!.id)
                  }}
                  disabled={controller.isFeaturedVideoBusy}
                >
                  Copiar link
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-emerald-300/20 bg-black/25 p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr_auto]">
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-emerald-100" htmlFor="campaign-hero-file">
              Arquivo de imagem
            </label>
            <input
              id="campaign-hero-file"
              accept="image/*"
              className="mt-2 block h-11 w-full cursor-pointer rounded-md border border-emerald-200/30 bg-black/40 px-3 py-2 text-xs text-emerald-50 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-emerald-300/25 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-emerald-100"
              type="file"
              onChange={(event) => controller.setSelectedHeroFile(event.target.files?.[0] ?? null)}
              data-testid="campaign-hero-file-input"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.15em] text-emerald-100" htmlFor="campaign-hero-alt">
              Texto alternativo (opcional)
            </label>
            <input
              id="campaign-hero-alt"
              className="mt-2 h-11 w-full rounded-md border border-emerald-200/30 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition-colors focus:border-emerald-200/75"
              type="text"
              value={controller.heroAltInput}
              onChange={(event) => controller.setHeroAltInput(event.target.value)}
              placeholder="Ex: BMW R1200 GS em destaque"
            />
          </div>
          <div className="flex items-end">
            <button
              className="inline-flex h-11 items-center rounded-lg bg-emerald-300 px-5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void controller.handleUploadHeroMedia()
              }}
              disabled={
                controller.isUploadingHeroMedia
                || controller.isHeroAtLimit
                || !controller.selectedHeroFile
                || controller.heroMediaActionId !== null
              }
              data-testid="campaign-hero-upload-button"
            >
              {controller.isUploadingHeroMedia ? 'Enviando...' : 'Adicionar slide'}
            </button>
          </div>
        </div>

        {controller.selectedHeroFile ? (
          <p className="mt-2 text-[11px] text-emerald-100/80">
            Arquivo selecionado: <span className="font-semibold text-emerald-50">{controller.selectedHeroFile.name}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        {controller.heroCarouselItems.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-gray-300">
            Nenhuma imagem cadastrada. A home continua usando as imagens padrao ate voce adicionar slides.
          </p>
        ) : null}

        {controller.heroCarouselItems.map((media, index) => {
          const isProcessing = controller.heroMediaActionId === media.id || controller.isUploadingHeroMedia

          return (
            <div key={media.id} className="rounded-xl border border-white/10 bg-black/30 p-3" data-testid={`campaign-hero-item-${media.id}`}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
                <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/60">
                  <img
                    alt={media.alt || `Slide ${index + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={media.url}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300">
                      Ordem {index + 1}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                        media.active
                          ? 'border border-emerald-300/35 bg-emerald-500/15 text-emerald-200'
                          : 'border border-gray-500/40 bg-gray-500/10 text-gray-300'
                      }`}
                    >
                      {media.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-300">
                    Alt:{' '}
                    <span
                      className="inline-block max-w-full truncate align-bottom font-semibold text-white"
                      title={media.alt || 'Sem descricao'}
                    >
                      {media.alt || 'Sem descricao'}
                    </span>
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[11px] text-gray-500" title={media.url}>
                      {media.url}
                    </p>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-md border border-white/15 bg-black/40 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-200 transition hover:bg-black/60"
                      onClick={() => {
                        void controller.handleCopyMediaUrl(media.url, media.id)
                      }}
                      disabled={isProcessing}
                    >
                      Copiar link
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-200 disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => {
                      void controller.handleMoveHeroMedia(media.id, -1)
                    }}
                    disabled={isProcessing || index === 0}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-white/15 bg-black/40 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-200 disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => {
                      void controller.handleMoveHeroMedia(media.id, 1)
                    }}
                    disabled={isProcessing || index === controller.heroCarouselItems.length - 1}
                  >
                    Descer
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-amber-300/30 bg-amber-500/10 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100 disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => {
                      void controller.handleEditHeroMediaAlt(media)
                    }}
                    disabled={isProcessing}
                  >
                    Editar alt
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => {
                      void controller.handleToggleHeroMedia(media.id)
                    }}
                    disabled={isProcessing}
                  >
                    {media.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-red-400/35 bg-red-500/10 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-red-200 disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={() => {
                      void controller.handleRemoveHeroMedia(media)
                    }}
                    disabled={isProcessing}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

const MediaSection = memo(MediaSectionComponent)

export default MediaSection
