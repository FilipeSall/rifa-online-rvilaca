import { Link, Route, Routes } from 'react-router-dom'

function HomePage() {
  return (
    <div className="bg-casino-bg font-display text-text-main overflow-x-hidden">
      {/* Jackpot Banner */}
      <div className="bg-gradient-to-r from-neon-pink via-purple-800 to-neon-blue text-white text-center py-2 px-4 font-casino font-bold text-sm md:text-base sticky top-0 z-[60] shadow-glow-pink animate-pulse">
        🎰 JACKPOT ACUMULADO: R$ 542.890,00 - JOGUE AGORA! 🎰
      </div>

      <div className="flex min-h-screen flex-col relative">
        {/* Winner Toast */}
        <div className="fixed bottom-4 left-4 z-[70] max-w-xs w-full toast-animate bg-gray-900 border border-gold shadow-[0_0_20px_rgba(255,215,0,0.3)] rounded-r-lg p-4 flex items-center gap-3">
          <div className="bg-gold p-2 rounded-full text-black animate-pulse-fast">
            <span className="material-symbols-outlined">emoji_events</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gold">NOVO GANHADOR!</p>
            <p className="text-xs text-white">
              Carlos M. <span className="text-neon-cyan font-bold">ganhou R$ 500</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-1">no Slot da Sorte</p>
          </div>
        </div>

        {/* Header */}
        <header className="sticky top-[38px] md:top-[40px] z-50 w-full border-b border-white/10 bg-casino-bg/95 backdrop-blur-md shadow-lg shadow-purple-900/20">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex h-16 md:h-20 items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gold to-yellow-600 text-black shadow-glow-gold animate-spin-slow"
                  style={{ animationDuration: '10s' }}
                >
                  <span className="material-symbols-outlined text-2xl">casino</span>
                </div>
                <h1 className="text-2xl font-casino font-black tracking-widest text-white hidden sm:block uppercase">
                  Cassino<span className="text-neon-pink drop-shadow-[0_0_5px_rgba(255,0,204,0.8)]">Rifas</span>
                </h1>
              </div>

              <nav className="hidden md:flex items-center gap-8">
                <a
                  className="text-sm font-bold text-gray-300 hover:text-neon-cyan transition-all uppercase tracking-wide flex items-center gap-1"
                  href="#"
                >
                  <span className="material-symbols-outlined text-sm">home</span> Lobby
                </a>
                <a
                  className="text-sm font-bold text-gray-300 hover:text-gold transition-all uppercase tracking-wide flex items-center gap-1"
                  href="#"
                >
                  <span className="material-symbols-outlined text-sm">star</span> VIP
                </a>
                <a
                  className="text-sm font-bold text-gray-300 hover:text-neon-pink transition-all uppercase tracking-wide flex items-center gap-1"
                  href="#"
                >
                  <span className="material-symbols-outlined text-sm">receipt_long</span> Meus Jogos
                </a>
              </nav>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end mr-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">Saldo</span>
                  <span className="text-gold font-mono font-bold text-lg">R$ 0,00</span>
                </div>
                <button className="bling-border relative flex h-10 items-center justify-center rounded-lg bg-gray-900 px-6 text-sm font-black text-white transition-all hover:brightness-110 uppercase tracking-wide overflow-hidden group">
                  <span className="relative z-10 flex items-center gap-2">
                    DEPOSITAR <span className="material-symbols-outlined text-sm">add_circle</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-grow">
          {/* Hero Section */}
          <section className="relative pt-10 pb-20 lg:pt-16 lg:pb-24 overflow-hidden hero-bg-pattern">
            <div className="absolute top-10 left-10 text-white/5 text-9xl font-casino select-none pointer-events-none rotate-12">
              777
            </div>
            <div className="absolute bottom-10 right-10 text-white/5 text-9xl font-casino select-none pointer-events-none -rotate-12">
              JACKPOT
            </div>
            <div className="coin-particle top-[20%] left-[10%]"></div>
            <div className="coin-particle top-[30%] right-[15%]" style={{ animationDelay: '1s' }}></div>
            <div className="coin-particle bottom-[40%] left-[20%]" style={{ animationDelay: '2s' }}></div>
            <div className="coin-particle top-[15%] right-[30%]" style={{ animationDelay: '0.5s' }}></div>

            <div className="container relative z-10 mx-auto px-4 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                {/* Left column */}
                <div className="lg:col-span-7 flex flex-col gap-6 order-2 lg:order-1">
                  <div className="flex flex-wrap gap-3">
                    <span className="inline-flex items-center rounded bg-black/50 border border-neon-pink px-3 py-1 text-xs font-black text-neon-pink uppercase tracking-widest shadow-glow-pink animate-pulse">
                      <span className="material-symbols-outlined text-sm mr-1">bolt</span> Ao vivo
                    </span>
                    <span className="inline-flex items-center rounded bg-gold/20 border border-gold px-3 py-1 text-xs font-bold text-gold uppercase tracking-widest shadow-glow-gold">
                      <span className="material-symbols-outlined text-sm mr-1">crown</span> Premium
                    </span>
                  </div>

                  <h1 className="text-5xl lg:text-7xl font-casino font-black leading-[0.9] tracking-tighter text-white drop-shadow-2xl">
                    <span className="text-neon-glow block mb-2">SORTEIO</span>
                    <span className="bg-gradient-to-r from-neon-blue via-white to-neon-blue bg-clip-text text-transparent">
                      BMW R1200 GS
                    </span>
                  </h1>

                  <div className="bg-black/40 backdrop-blur-sm border-l-4 border-gold p-4 rounded-r-lg max-w-xl">
                    <p className="text-xl text-gray-200 font-medium leading-relaxed">
                      <span className="text-gold font-bold">🏆 PRÊMIO DE LUXO:</span> Além da moto, leve{' '}
                      <strong className="text-neon-cyan">R$ 20.000 em fichas</strong>. A sorte está lançada!
                    </p>
                  </div>

                  {/* Progress card */}
                  <div className="space-y-3 max-w-lg bg-gray-900 p-5 rounded-xl border-2 border-neon-blue shadow-[0_0_20px_rgba(51,51,255,0.4)] relative overflow-hidden group hover:shadow-[0_0_40px_rgba(51,51,255,0.6)] transition-all">
                    <div className="absolute top-0 right-0 bg-neon-pink text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg animate-flash shadow-glow-pink">
                      HOT SLOT!
                    </div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-bold text-neon-cyan flex items-center gap-1 font-casino tracking-wider">
                        <span className="material-symbols-outlined text-base animate-spin-slow">settings</span>
                        PROGRESSO DO SORTEIO
                      </span>
                      <span className="text-xl font-black text-white font-mono drop-shadow-md">
                        65% <span className="text-xs text-gray-400">VENDIDO</span>
                      </span>
                    </div>
                    <div className="h-6 w-full rounded bg-gray-800 overflow-hidden border border-gray-700 relative">
                      <div
                        className="absolute inset-0 opacity-50 z-0"
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjMjIyIi8+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMzMzIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+\")",
                        }}
                      ></div>
                      <div
                        className="h-full bg-gradient-to-r from-neon-blue via-purple-500 to-neon-pink relative z-10 shadow-[0_0_15px_rgba(255,0,204,0.8)]"
                        style={{ width: '65%' }}
                      >
                        <div
                          className="absolute inset-0 bg-white/20 animate-shimmer"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
                          }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex gap-1">
                        <span className="material-symbols-outlined text-gold text-xs">star</span>
                        <span className="material-symbols-outlined text-gold text-xs">star</span>
                        <span className="material-symbols-outlined text-gold text-xs">star</span>
                      </div>
                      <p className="text-xs font-bold text-neon-pink animate-pulse uppercase tracking-wide">
                        ⚠️ Últimas chances de girar!
                      </p>
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-lg mt-2 font-mono">
                    {[
                      { value: '02', label: 'Dias' },
                      { value: '14', label: 'Hrs' },
                      { value: '45', label: 'Min' },
                      { value: '30', label: 'Seg' },
                    ].map(({ value, label }) => (
                      <div
                        key={label}
                        className="flex flex-col items-center justify-center rounded border border-white/20 bg-black/60 backdrop-blur-md text-white p-2"
                      >
                        <span className="text-2xl sm:text-3xl font-black text-neon-cyan drop-shadow-[0_0_5px_rgba(0,242,255,0.8)]">
                          {value}
                        </span>
                        <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="mt-4">
                    <button className="group relative w-full sm:w-auto flex items-center justify-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-neon-pink to-purple-600 px-10 py-5 text-xl font-black text-white shadow-glow-pink transition-all hover:scale-[1.05] hover:shadow-[0_0_60px_rgba(255,0,204,0.8)] border-2 border-white/20">
                      <span className="absolute inset-0 bg-white/40 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></span>
                      <span className="material-symbols-outlined relative z-10 text-3xl animate-bounce">casino</span>
                      <span className="relative z-10 drop-shadow-md font-casino tracking-wider">JOGAR AGORA</span>
                    </button>
                    <p className="mt-4 text-sm text-gray-400 flex items-center gap-2 font-medium justify-center sm:justify-start">
                      <span className="material-symbols-outlined text-green-500 text-lg">verified_user</span>
                      <span>
                        Sorteio verificado e auditado.{' '}
                        <span className="text-gold font-bold">100% JUSTO</span>
                      </span>
                    </p>
                  </div>
                </div>

                {/* Right column – image */}
                <div className="lg:col-span-5 relative order-1 lg:order-2">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-neon-blue to-neon-pink rounded-full opacity-30 blur-3xl animate-pulse"></div>
                  <div className="relative z-10 aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border-4 border-white/10 group transform hover:scale-[1.02] transition-transform duration-500 bg-gray-900">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none z-20 mix-blend-overlay"></div>
                    <img
                      alt="Black BMW R1200 GS motorcycle"
                      className="h-full w-full object-cover opacity-90 hover:opacity-100 transition-opacity duration-500"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDaQF11hNB5K8OrSxcTvxNOx5hgNg1ADcoHxYzDLBIsbbeH_5iAWjd-AboztLottNaaNPlPIG8UHvAY3crWR6zGTWK4JgzYQlU1JEadKFDe4wimQeFcTl4nboPuYNSoQTsiCiz7CpWKyN_0iqn0DGk3AZdWYkzXlhPtcL7sV1mbKzzCTpG52RRuJq1dIaFlCWEsVWKWA2g1tkKXaBW_yIdfhx3OzWszMoNNcpteERd6bjDmzkNMWQKl5nsaiOmrgyfxwyWII69GMJ6g"
                    />
                    <div className="absolute bottom-0 left-0 w-full p-6 z-20 bg-gradient-to-t from-black via-black/80 to-transparent">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block px-2 py-0.5 rounded bg-gold text-black text-[10px] font-black uppercase">
                          Grand Prize
                        </span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span key={i} className="material-symbols-outlined text-gold text-[14px]">
                              star
                            </span>
                          ))}
                        </div>
                      </div>
                      <h3 className="text-3xl font-casino font-bold text-white tracking-wide">BMW R1200 GS</h3>
                    </div>
                  </div>

                  {/* Bonus card */}
                  <div className="absolute -bottom-12 -left-4 sm:-left-12 z-20 w-48 rounded-xl bg-gray-900 p-1 shadow-card-pop border border-neon-cyan hidden md:block transform rotate-[-6deg] hover:rotate-0 transition-transform duration-300 group">
                    <div className="bg-black/50 p-2 rounded-lg">
                      <div className="relative aspect-video w-full overflow-hidden rounded mb-2 bg-gray-800 border border-gray-700">
                        <img
                          alt="Motorcycle rider on a Honda CG 160"
                          className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9vPUnNi9GeVGuP8cEk_bTws-UD92OhX5CitQJ9GO5u3efdLU1VLwR1o2Qa8Kl4BxvKw6RcuQI3Mj2YmsnNd_soxwmzryanwI14UB0BMaFaDaYh0kZriOw8gfFK-ORFT4P2qCKIWDJxxo34SUo8cohk2QGBT3ewqAl98N7WgZYuKWhykkiyvKwPwMrM5piDUBiwiYvDssRbWKK8x24li1gZ2tbopzr0txQJYHFAqktbdEut_4XEtZuTFJgMHGUmeb-QfE4npTZUpjj"
                        />
                        <div className="absolute top-1 right-1 bg-neon-cyan text-black text-[8px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                          BONUS
                        </div>
                      </div>
                      <p className="text-xs font-bold text-gray-300 text-center">RODADA EXTRA</p>
                      <p className="text-sm font-black text-neon-cyan text-center font-casino">HONDA CG 160</p>
                    </div>
                  </div>

                  {/* Jackpot badge */}
                  <div className="absolute -top-8 -right-8 z-30 transform rotate-12 animate-bounce-slow hidden sm:block">
                    <div className="bg-gradient-to-br from-gold to-yellow-700 p-1 rounded-full shadow-glow-gold">
                      <div className="bg-black rounded-full p-4 border-2 border-dashed border-gold w-32 h-32 flex flex-col items-center justify-center text-center">
                        <span className="text-gold text-xs font-bold uppercase">Mega</span>
                        <span className="text-white text-xl font-black font-casino leading-none">JACKPOT</span>
                        <span className="text-neon-cyan text-xs font-bold mt-1">ACUMULADO</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Games Section */}
          <section className="bg-casino-bg-light py-20 border-t border-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-pink via-neon-cyan to-neon-blue"></div>
            <span className="material-symbols-outlined absolute top-10 left-10 text-white/5 text-9xl rotate-45 pointer-events-none">
              poker_chip
            </span>
            <span className="material-symbols-outlined absolute bottom-10 right-10 text-white/5 text-9xl -rotate-12 pointer-events-none">
              playing_cards
            </span>

            <div className="container mx-auto px-4 lg:px-8 relative z-10">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Winners sidebar */}
                <div className="lg:col-span-1 hidden lg:block">
                  <div className="bg-black/40 backdrop-blur border border-white/10 rounded-2xl p-4 h-full">
                    <h3 className="text-gold font-casino font-bold mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined animate-spin-slow">monetization_on</span> Ganhadores
                    </h3>
                    <div className="space-y-4 overflow-hidden relative h-[400px]">
                      <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/80 to-transparent z-10"></div>
                      <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
                      <div className="space-y-3">
                        <div className="bg-gray-800/50 p-3 rounded-lg border-l-2 border-neon-cyan flex items-center gap-3">
                          <img
                            alt="Winner"
                            className="w-8 h-8 rounded-full"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDg1_AubBx-ITWDCnxztNGPLwL16MY9W2FSjJOkj_cXjkaoXFhZRu7Y9-eyOO21LIjTDxsNWE27EBxZAP9-pmXx3KQs6NWm3HKX6Ak6lshBDqNfh1BPT4bci4dKcf7xjcBMaDaq0WKwNRKTwYPdo_7bnBnOaG3GlyRuCS72Jw_Fo9A2ordOe33hLDbnH9tW45uVkQeCZXCDUdIa3MxpUW8lBgvwgkoavXrP7YR04evb_Peu9TEW8uSKedn45YiV92JuGmQpQrqvpU6Q"
                          />
                          <div>
                            <p className="text-xs text-gray-300 font-bold">Pedro S.</p>
                            <p className="text-[10px] text-neon-cyan">Ganhou R$ 1.500</p>
                          </div>
                        </div>
                        <div className="bg-gray-800/50 p-3 rounded-lg border-l-2 border-neon-pink flex items-center gap-3">
                          <img
                            alt="Winner"
                            className="w-8 h-8 rounded-full"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIfYYTOJJCm3RwoYOZyPWb6aJ2ifXc5Sj1OuIQXQACstmF9TPFnpeEfsiJKJhypmYBe_s3WxI6YqC40Yv54-GYVBMhEw-2VcdIarHhoen72L0WHIDHdE3IZ_QaipNlTKA3xDjo4oGWsQTot1gWhZ5gD1o0KucbZmhCn82oJJQsKyZVP_daRseYwyGnOjiJao13DroiXYjEO2FhijTgKvycr83IxeXIA3-TQ8JCkPb4npeZuZJVympnlX0T23bAsgIvK2sx-rhFaEbd"
                          />
                          <div>
                            <p className="text-xs text-gray-300 font-bold">Ana L.</p>
                            <p className="text-[10px] text-neon-pink">Ganhou Moto CG</p>
                          </div>
                        </div>
                        <div className="bg-gray-800/50 p-3 rounded-lg border-l-2 border-gold flex items-center gap-3">
                          <img
                            alt="Winner"
                            className="w-8 h-8 rounded-full"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCryucbq-p2kmfo3ly4O79Nine-IV0L4U3D2iRTKgK485xR_i_Z0RFZgK-BecYZTGcLt1dJcUUIwJGxTpG8gt5sOQMT8_bF5wt6w2ZjW7FTMGCmNLrUPN3W25XI_J2lEM6Xf8qKJl9qizz9eZPpj__zR1suV-bELg441Hc-2ZMBJafkmLbRdBFq-BUprNGeA8c6j_wdUIYTEhsVfZxTjup4yGevNhyOvw21by70Fth36g4nlifJRytqbf3HsWZimU7AtD1i6_91Xr6a"
                          />
                          <div>
                            <p className="text-xs text-gray-300 font-bold">Marcos V.</p>
                            <p className="text-[10px] text-gold">Ganhou R$ 500</p>
                          </div>
                        </div>
                        <div className="bg-gray-800/50 p-3 rounded-lg border-l-2 border-neon-cyan flex items-center gap-3">
                          <img
                            alt="Winner"
                            className="w-8 h-8 rounded-full"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuABfBJkmgV8Zh4Gvr_wTIoBonUDhkI5e0o3-qaFaYEwcNKuNc39khijd_wMjFlTAsXf2x8YPD1n141UT2RNOtWbFx1Yt0Pxn9B2XKnCVlEzVnFquUTD72cHJhd6Tg2OHYlqNBPlH6CoXxlFSp4ya1jhumUkvEELrIenqUBkZRKwkfBktL5PkMXO1S4nrNEvoUSKYLJHP_7sseJMT-npbHZg0gy7TwPt_JfkDeZ1nVs2PfZKCQQcrujcYLSW-_ek1_LF8jl6GEVjgVEK"
                          />
                          <div>
                            <p className="text-xs text-gray-300 font-bold">Julia R.</p>
                            <p className="text-[10px] text-neon-cyan">Ganhou R$ 100</p>
                          </div>
                        </div>
                        <div className="bg-gray-800/50 p-3 rounded-lg border-l-2 border-neon-pink flex items-center gap-3">
                          <img
                            alt="Winner"
                            className="w-8 h-8 rounded-full"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCmDXlLUvESRy5lz3wvyOl4DcynVTz6q1U7pMQiwtGyjQOstIzwx7XqntlEd16z20QXlyHUrNzsXDYDoDvlqS1hkci7BJTKQwgMIfAQVyTsWhuUYx7Y6yTY3p8ygPfPtH2F8vUVXVox7rmm_NKECMfKuaT4a6_SG3Z4-xZtf19Ka_pExtuktD3m2sKCGzOrcabe9FPkELs7FDE5RqKos35gO9SWQOFX6sdhnSbOvUBsttfHW2AW890UgoWENAjnxSjy6etVxT0Gq3-m"
                          />
                          <div>
                            <p className="text-xs text-gray-300 font-bold">Roberto K.</p>
                            <p className="text-[10px] text-neon-pink">Ganhou iPhone 15</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Games grid */}
                <div className="lg:col-span-3">
                  <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                    <div>
                      <span className="text-neon-cyan font-black uppercase tracking-widest text-sm mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm animate-pulse">local_fire_department</span>{' '}
                        Hot Games
                      </span>
                      <h2 className="text-3xl md:text-4xl font-casino font-black text-white text-neon-glow">
                        PRÊMIOS DA RODADA
                      </h2>
                    </div>
                    <a
                      className="text-sm font-bold text-black bg-gold hover:bg-white transition-colors px-6 py-3 rounded-full shadow-glow-gold uppercase tracking-wide flex items-center gap-2 group"
                      href="#"
                    >
                      Ver Todos{' '}
                      <span className="material-symbols-outlined text-sm font-bold group-hover:translate-x-1 transition-transform">
                        arrow_forward
                      </span>
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Card – Honda CG */}
                    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-gray-900 border border-gray-800 transition-all hover:border-neon-pink hover:shadow-glow-pink hover:-translate-y-2">
                      <div className="absolute top-3 right-3 z-10 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm border border-gray-700">
                        MODELO 2026
                      </div>
                      <div className="aspect-[16/10] overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent z-10"></div>
                        <img
                          alt="Close up of a modern red motorcycle engine"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCbdj0pueADVjKoJC1NtbrlsQ5D18NihMhVZyXXubu-_FMBS32xfXTPx3qIGzY2DegpdMsefKPlr8i1NGt0TAnMseKJ2nrPUOqH5SxnB5g2xxUKsvH3nvNEcUXDiqIQDruh5qonlnewr1orVIso6M66Hv4OAAAcTpyS6iXI7T4001wDU56QjduPZH6zcvI9RQWwFVEMKPzLLbn-d-SYb_p1FthUa6ENzpd1j_uUVf-P5UGRScP6qguURMJVUvSTiQJ9UzuiNmt3gbif"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-5 relative z-20 -mt-10">
                        <div className="mb-4">
                          <h3 className="text-xl font-casino font-bold text-white mb-1 group-hover:text-neon-pink transition-colors">
                            Honda CG Start
                          </h3>
                          <p className="text-xs font-medium text-gray-400">Zero km, emplacada e tanque cheio.</p>
                        </div>
                        <div className="mt-auto pt-4 border-t border-gray-800">
                          <button className="w-full rounded bg-gradient-to-r from-gray-800 to-gray-700 py-2 text-sm font-bold text-white transition-all hover:from-neon-pink hover:to-purple-600 uppercase tracking-wider">
                            Apostar Agora
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card – PIX instantâneo */}
                    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-gray-900 border border-gray-800 transition-all hover:border-neon-cyan hover:shadow-glow-cyan hover:-translate-y-2">
                      <div className="absolute top-3 right-3 z-10 rounded bg-neon-cyan px-2 py-1 text-[10px] font-bold text-black shadow-lg animate-pulse">
                        INSTANT WIN
                      </div>
                      <div className="aspect-[16/10] overflow-hidden bg-gray-800 flex items-center justify-center relative">
                        <div className="absolute inset-0 bg-neon-cyan/10"></div>
                        <span className="material-symbols-outlined text-6xl text-neon-cyan relative z-10 drop-shadow-[0_0_10px_rgba(0,242,255,0.8)] group-hover:scale-110 transition-transform">
                          payments
                        </span>
                        <img
                          alt="Abstract green financial background"
                          className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDHCVGmD9ehH0ZDZgckgYputJtDcYNg2PxN9KQnBqtT3aEbYHF4XyJuVH0WlIElKWva5p37O9TvnbTSW8iqgH_GNV_gSgQvTzvHnGSUBjNc8eEqgm_qijiBnoU0OEFxEaojZ5TnC1lXH_mlWUM_wL51fgkG7kbFr0rbId75Ru1xOn6FF9kZfQ09ZGoB0E1MJny_2PxHa18baMbrQQ6JYDuEEnXiHbpK32bkyu0keUv0Q3x9pCG5atTyCxnbuzqSSvY-AolhfO6xbogI"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-5 relative z-20">
                        <div className="mb-4">
                          <h3 className="text-xl font-casino font-bold text-white mb-1 group-hover:text-neon-cyan transition-colors">
                            20x R$ 1.000
                          </h3>
                          <p className="text-xs font-medium text-gray-400">Prêmios instantâneos no PIX.</p>
                        </div>
                        <div className="mt-auto pt-4 border-t border-gray-800">
                          <button className="w-full rounded bg-gradient-to-r from-gray-800 to-gray-700 py-2 text-sm font-bold text-white transition-all hover:from-neon-cyan hover:to-blue-600 uppercase tracking-wider">
                            Jogar Agora
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card – Top Comprador */}
                    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-gray-900 border border-gray-800 transition-all hover:border-gold hover:shadow-glow-gold hover:-translate-y-2">
                      <div className="absolute top-3 right-3 z-10 rounded bg-gold px-2 py-1 text-[10px] font-bold text-black shadow-lg">
                        RANKING
                      </div>
                      <div className="aspect-[16/10] overflow-hidden bg-gray-800 flex items-center justify-center relative">
                        <div className="absolute inset-0 bg-gold/10"></div>
                        <span className="material-symbols-outlined text-6xl text-gold relative z-10 drop-shadow-[0_0_10px_rgba(255,215,0,0.8)] group-hover:rotate-12 transition-transform">
                          trophy
                        </span>
                        <img
                          alt="Golden trophy"
                          className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay"
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5JlbYEsqjpOP37S0tSq0Fdf8LNR2Z52zOlysOUXzx9iW2iHBI_-jVfOL-84BiTwc7KBc7NZQebyWtrPTdqQzQQXaTabrBqDRP5aCPizhhcIW2AOtu_NsTCdCikfrr9lZlAwvyd3AZ5-Kmh3A-1dJdCKO9N84W-fH-UPYJbg3xXmxGIGvIIN9FjR_5MlaJU3rHFJ74kEBUXxaRrt4U_56ZKCyK7-M5aEQkyhS31tMRP24ccdW7vCw9h9hpdxO_BhaugwaujBU1A5I6"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-5 relative z-20">
                        <div className="mb-4">
                          <h3 className="text-xl font-casino font-bold text-white mb-1 group-hover:text-gold transition-colors">
                            Top Comprador
                          </h3>
                          <p className="text-xs font-medium text-gray-400">R$ 5.000 para o líder do ranking.</p>
                        </div>
                        <div className="mt-auto pt-4 border-t border-gray-800">
                          <button className="w-full rounded bg-gradient-to-r from-gray-800 to-gray-700 py-2 text-sm font-bold text-white transition-all hover:from-gold hover:to-yellow-700 hover:text-black uppercase tracking-wider">
                            Ver Placar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Trust badges */}
          <section className="py-12 bg-[#0a081c] border-t border-white/5">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="flex flex-wrap justify-center gap-8 md:gap-16">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-transparent hover:border-white/20">
                  <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(0,255,0,0.2)]">
                    <span className="material-symbols-outlined text-2xl text-green-400">lock</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Segurança</span>
                    <span className="text-sm font-bold text-white">SSL 256-bit Encrypted</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-transparent hover:border-white/20">
                  <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(50,100,255,0.2)]">
                    <span className="material-symbols-outlined text-2xl text-blue-400">policy</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Fair Play</span>
                    <span className="text-sm font-bold text-white">Auditado &amp; Verificado</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-transparent hover:border-white/20">
                  <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(200,50,255,0.2)]">
                    <span className="material-symbols-outlined text-2xl text-purple-400">verified</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pagamento</span>
                    <span className="text-sm font-bold text-white">PIX Automático</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-neon-blue/30 bg-black py-16 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent"></div>
          <div className="container mx-auto px-4 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black">
                    <span className="material-symbols-outlined">casino</span>
                  </div>
                  <h2 className="text-xl font-casino font-bold text-white">
                    Cassino<span className="text-neon-pink">Rifas</span>
                  </h2>
                </div>
                <p className="text-sm font-medium text-gray-400 mb-6 leading-relaxed">
                  A plataforma de sorteios mais eletrizante do Brasil. Prêmios reais, adrenalina pura e ganhadores
                  todos os dias.
                </p>
                <div className="flex gap-4">
                  <a
                    className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-neon-pink hover:text-white transition-all hover:shadow-glow-pink"
                    href="#"
                  >
                    <span className="material-symbols-outlined">public</span>
                  </a>
                  <a
                    className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-neon-cyan hover:text-black transition-all hover:shadow-glow-cyan"
                    href="#"
                  >
                    <span className="material-symbols-outlined">mail</span>
                  </a>
                  <a
                    className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:bg-gold hover:text-black transition-all hover:shadow-glow-gold"
                    href="#"
                  >
                    <span className="material-symbols-outlined">call</span>
                  </a>
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold text-lg mb-6 uppercase tracking-wider">Acesso Rápido</h3>
                <ul className="space-y-3 text-sm font-medium text-gray-400">
                  {['Sorteios Ativos', 'Hall da Fama', 'Regras do Jogo', 'Termos de Uso'].map((item) => (
                    <li key={item}>
                      <a className="hover:text-neon-cyan transition-all flex items-center gap-2" href="#">
                        <span className="material-symbols-outlined text-[10px] text-neon-cyan">circle</span>
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-white font-bold text-lg mb-6 uppercase tracking-wider">Suporte</h3>
                <ul className="space-y-3 text-sm font-medium text-gray-400">
                  {['FAQ', 'Recuperar Bilhetes', 'Chat ao Vivo', 'Política de Privacidade'].map((item) => (
                    <li key={item}>
                      <a className="hover:text-neon-pink transition-colors flex items-center gap-2" href="#">
                        {item}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-white font-bold text-lg mb-6 uppercase tracking-wider">Métodos Aceitos</h3>
                <div className="flex gap-3 flex-wrap mb-6">
                  <div className="bg-gray-800 rounded px-3 py-2 h-10 w-16 flex items-center justify-center border border-gray-700 hover:border-green-400 transition-colors">
                    <span className="text-sm font-black text-green-400 font-mono">PIX</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
                  <p className="text-xs text-gray-500 font-medium flex gap-2">
                    <span className="material-symbols-outlined text-base">info</span>
                    Resultados baseados na Loteria Federal para garantia de lisura total.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-8 text-center">
              <p className="text-xs font-medium text-gray-600">
                © 2024 CassinoRifas Premium. Todos os direitos reservados. Jogue com responsabilidade. +18
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function CheckoutPage() {
  return (
    <div className="min-h-screen bg-casino-bg text-white flex items-center justify-center font-display">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">Checkout</h1>
        <p className="text-gray-400">Tela reservada para fluxo de pagamento via PIX.</p>
        <Link className="text-sm font-semibold text-neon-cyan underline" to="/">
          Voltar para home
        </Link>
      </section>
    </div>
  )
}

function ResultPage() {
  return (
    <div className="min-h-screen bg-casino-bg text-white flex items-center justify-center font-display">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">Resultado</h1>
        <p className="text-gray-400">Tela reservada para histórico de sorteios e ganhadores.</p>
        <Link className="text-sm font-semibold text-neon-cyan underline" to="/">
          Voltar para home
        </Link>
      </section>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/resultado" element={<ResultPage />} />
      <Route
        path="*"
        element={
          <div className="min-h-screen bg-casino-bg text-white flex items-center justify-center font-display">
            <section className="space-y-3 text-center">
              <h1 className="text-3xl font-bold text-white">Página não encontrada</h1>
              <Link className="text-sm font-semibold text-neon-cyan underline" to="/">
                Voltar para home
              </Link>
            </section>
          </div>
        }
      />
    </Routes>
  )
}

export default App
