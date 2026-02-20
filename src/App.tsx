import { Link, Route, Routes } from 'react-router-dom'

function HomePage() {
  return (
    <div className="bg-luxury-bg font-display text-text-main overflow-x-hidden selection:bg-gold selection:text-black">
      {/* Announcement bar */}
      <div className="bg-luxury-card border-b border-white/5 text-center py-2 px-4 text-xs font-medium tracking-widest text-gold uppercase hidden md:block">
        🔥 ÚLTIMAS COTAS DISPONÍVEIS — Compre agora e concorra a uma BMW R 1200 GS + R$ 20.000 em prêmios! 🏆
      </div>

      <div className="flex min-h-screen flex-col relative">
        {/* Header */}
        <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-luxury-bg/90 backdrop-blur-md">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="flex h-20 items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-gold text-black">
                  <span className="material-symbols-outlined text-2xl">diamond</span>
                </div>
                <h1 className="text-xl lg:text-2xl font-luxury font-bold text-white tracking-widest uppercase">
                  Premium<span className="text-gold">Rifas</span>
                </h1>
              </div>

              <nav className="hidden lg:flex items-center gap-8">
                <a className="text-xs font-bold text-white hover:text-gold transition-colors uppercase tracking-widest" href="#">Início</a>
                <a className="text-xs font-bold text-gray-400 hover:text-gold transition-colors uppercase tracking-widest" href="#como-funciona">Como Funciona</a>
                <a className="text-xs font-bold text-gray-400 hover:text-gold transition-colors uppercase tracking-widest" href="#ganhadores">Ganhadores</a>
                <a className="text-xs font-bold text-gray-400 hover:text-gold transition-colors uppercase tracking-widest" href="#faq">FAQ</a>
                <a className="text-xs font-bold text-gray-400 hover:text-gold transition-colors uppercase tracking-widest" href="#">Regulamento</a>
                <a className="text-xs font-bold text-gray-400 hover:text-gold transition-colors uppercase tracking-widest" href="#">Minha Conta</a>
              </nav>

              <div className="flex items-center gap-4">
                <button className="hidden md:flex h-10 items-center justify-center rounded bg-gold hover:bg-gold-hover px-6 text-xs font-black text-black transition-all uppercase tracking-widest shadow-glow-gold">
                  Comprar Números
                </button>
                <button className="lg:hidden text-white">
                  <span className="material-symbols-outlined">menu</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow">
          {/* Hero */}
          <section className="relative pt-12 pb-20 lg:pt-24 lg:pb-32 overflow-hidden hero-bg">
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-gold/5 to-transparent pointer-events-none"></div>
            <div className="container relative z-10 mx-auto px-4 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                {/* Left */}
                <div className="lg:col-span-6 flex flex-col gap-6 order-2 lg:order-1">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-gold/10 border border-gold/30 px-3 py-1 text-[10px] font-bold text-gold uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse mr-2"></span> Edição Limitada
                    </span>
                  </div>

                  <h1 className="text-4xl lg:text-6xl font-luxury font-black leading-tight text-white">
                    GANHE UMA <span className="text-gold-gradient block">BMW R 1200 GS</span> E MUITO MAIS!
                  </h1>

                  <p className="text-lg text-gray-400 font-light leading-relaxed max-w-xl">
                    Participe da rifa mais exclusiva do Brasil. Transparência total via Loteria Federal, auditoria em tempo real e entrega garantida.
                  </p>

                  <div className="bg-luxury-card/50 backdrop-blur border border-white/10 p-6 rounded-xl max-w-lg mt-4">
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cotas Vendidas</span>
                      <span className="text-2xl font-bold text-gold font-mono">67%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden relative">
                      <div className="h-full bg-gold relative z-10 shadow-[0_0_10px_rgba(245,168,0,0.5)]" style={{ width: '67%' }}>
                        <div
                          className="absolute inset-0 bg-white/20 animate-shimmer"
                          style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                        ></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 text-right uppercase tracking-wider">Finalizando em breve</p>
                  </div>

                  <div className="grid grid-cols-4 gap-4 max-w-md mt-2">
                    {[
                      { value: '02', label: 'Dias' },
                      { value: '14', label: 'Horas' },
                      { value: '45', label: 'Min' },
                      { value: '30', label: 'Seg' },
                    ].map(({ value, label }) => (
                      <div key={label} className="text-center">
                        <span className="block text-2xl font-bold text-white font-mono">{value}</span>
                        <span className="text-[10px] uppercase text-gray-500 tracking-wider">{label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row gap-4">
                    <a
                      className="inline-flex h-14 items-center justify-center rounded bg-gold px-8 text-sm font-black text-black transition-all hover:bg-gold-hover hover:scale-[1.02] shadow-glow-gold uppercase tracking-widest"
                      href="#comprar"
                    >
                      Comprar Números
                    </a>
                    <a
                      className="inline-flex h-14 items-center justify-center rounded border border-white/20 px-8 text-sm font-bold text-white transition-all hover:bg-white/5 uppercase tracking-widest"
                      href="#como-funciona"
                    >
                      Ver Detalhes
                    </a>
                  </div>
                </div>

                {/* Right */}
                <div className="lg:col-span-6 relative order-1 lg:order-2">
                  <div className="absolute inset-0 bg-gold/20 blur-[100px] rounded-full opacity-20"></div>
                  <div className="relative z-10 aspect-square w-full">
                    <img
                      alt="Black BMW R1200 GS motorcycle"
                      className="w-full h-full object-contain drop-shadow-2xl"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDaQF11hNB5K8OrSxcTvxNOx5hgNg1ADcoHxYzDLBIsbbeH_5iAWjd-AboztLottNaaNPlPIG8UHvAY3crWR6zGTWK4JgzYQlU1JEadKFDe4wimQeFcTl4nboPuYNSoQTsiCiz7CpWKyN_0iqn0DGk3AZdWYkzXlhPtcL7sV1mbKzzCTpG52RRuJq1dIaFlCWEsVWKWA2g1tkKXaBW_yIdfhx3OzWszMoNNcpteERd6bjDmzkNMWQKl5nsaiOmrgyfxwyWII69GMJ6g"
                    />
                  </div>
                  <div className="absolute -bottom-6 right-0 md:right-10 bg-luxury-card border border-gold/30 p-4 rounded-lg shadow-xl max-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-gold">verified</span>
                      <span className="text-xs font-bold text-white">IPVA 2024 PAGO</span>
                    </div>
                    <p className="text-[10px] text-gray-400">Documentação e transferência por nossa conta.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Prizes */}
          <section className="py-16 bg-luxury-card border-y border-white/5">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="text-center mb-12">
                <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">O que você pode ganhar</span>
                <h2 className="text-3xl font-luxury font-bold text-white">Prêmios da Edição</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="group bg-luxury-bg border border-white/5 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300 hover:shadow-card-hover">
                  <div className="aspect-[16/10] bg-gray-900 relative overflow-hidden">
                    <div className="absolute top-3 left-3 bg-gold text-black text-[10px] font-black px-2 py-1 uppercase tracking-wider rounded-sm z-10">1º Prêmio</div>
                    <img
                      alt="BMW Motorcycle"
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDaQF11hNB5K8OrSxcTvxNOx5hgNg1ADcoHxYzDLBIsbbeH_5iAWjd-AboztLottNaaNPlPIG8UHvAY3crWR6zGTWK4JgzYQlU1JEadKFDe4wimQeFcTl4nboPuYNSoQTsiCiz7CpWKyN_0iqn0DGk3AZdWYkzXlhPtcL7sV1mbKzzCTpG52RRuJq1dIaFlCWEsVWKWA2g1tkKXaBW_yIdfhx3OzWszMoNNcpteERd6bjDmzkNMWQKl5nsaiOmrgyfxwyWII69GMJ6g"
                    />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-luxury font-bold text-white mb-2">BMW R 1200 GS</h3>
                    <p className="text-sm text-gray-400">A máquina definitiva para suas aventuras. Completa, com acessórios e documentação grátis.</p>
                  </div>
                </div>

                <div className="group bg-luxury-bg border border-white/5 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300 hover:shadow-card-hover">
                  <div className="aspect-[16/10] bg-gray-900 relative overflow-hidden">
                    <div className="absolute top-3 left-3 bg-white text-black text-[10px] font-black px-2 py-1 uppercase tracking-wider rounded-sm z-10">2º Prêmio</div>
                    <img
                      alt="Honda Motorcycle"
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9vPUnNi9GeVGuP8cEk_bTws-UD92OhX5CitQJ9GO5u3efdLU1VLwR1o2Qa8Kl4BxvKw6RcuQI3Mj2YmsnNd_soxwmzryanwI14UB0BMaFaDaYh0kZriOw8gfFK-ORFT4P2qCKIWDJxxo34SUo8cohk2QGBT3ewqAl98N7WgZYuKWhykkiyvKwPwMrM5piDUBiwiYvDssRbWKK8x24li1gZ2tbopzr0txQJYHFAqktbdEut_4XEtZuTFJgMHGUmeb-QfE4npTZUpjj"
                    />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-luxury font-bold text-white mb-2">Honda CG 160 Titan</h3>
                    <p className="text-sm text-gray-400">Economia e agilidade para o dia a dia. Tanque cheio e emplacada.</p>
                  </div>
                </div>

                <div className="group bg-luxury-bg border border-white/5 rounded-xl overflow-hidden hover:border-gold/50 transition-all duration-300 hover:shadow-card-hover">
                  <div className="aspect-[16/10] bg-gray-900 relative overflow-hidden flex items-center justify-center">
                    <div className="absolute top-3 left-3 bg-white text-black text-[10px] font-black px-2 py-1 uppercase tracking-wider rounded-sm z-10">Bilhetes Premiados</div>
                    <span className="material-symbols-outlined text-6xl text-gold group-hover:scale-110 transition-transform duration-500">payments</span>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-luxury font-bold text-white mb-2">20x Pix de R$ 1.000</h3>
                    <p className="text-sm text-gray-400">Prêmios instantâneos escondidos nos números. Achou, ganhou na hora!</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How it works */}
          <section className="py-20 bg-luxury-bg relative overflow-hidden" id="como-funciona">
            <div className="container mx-auto px-4 lg:px-8 relative z-10">
              <div className="text-center mb-16">
                <span className="text-gold font-bold text-xs uppercase tracking-[0.2em] mb-2 block">Passo a Passo</span>
                <h2 className="text-3xl font-luxury font-bold text-white">Como Participar</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                <div className="hidden md:block absolute top-8 left-[16%] right-[16%] h-[1px] bg-gradient-to-r from-transparent via-gold/30 to-transparent z-0"></div>
                {[
                  { num: '1', title: 'Escolha seus Números', desc: 'Selecione a quantidade de bilhetes que deseja comprar. Quanto mais números, maiores as chances.' },
                  { num: '2', title: 'Faça o Pagamento', desc: 'Realize o pagamento via PIX de forma rápida e segura. A confirmação é automática.' },
                  { num: '3', title: 'Aguarde o Sorteio', desc: 'Acompanhe o resultado pela Loteria Federal na data marcada. Boa sorte!' },
                ].map(({ num, title, desc }) => (
                  <div key={num} className="relative z-10 flex flex-col items-center text-center group">
                    <div className="w-16 h-16 rounded-full bg-luxury-card border border-gold/30 flex items-center justify-center mb-6 group-hover:border-gold group-hover:shadow-glow-gold transition-all duration-300">
                      <span className="text-xl font-black text-white">{num}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3 uppercase tracking-wide">{title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed px-4">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Buy */}
          <section className="py-20 bg-luxury-card border-y border-white/5" id="comprar">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="max-w-4xl mx-auto bg-luxury-bg border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold to-transparent"></div>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-luxury font-bold text-white mb-2">Garanta sua participação</h2>
                  <p className="text-gray-400 text-sm">Por apenas <span className="text-gold font-bold">R$ 0,99</span> cada número.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {[
                    { amount: '+10', popular: false },
                    { amount: '+50', popular: true },
                    { amount: '+100', popular: false },
                    { amount: '+250', popular: false },
                  ].map(({ amount, popular }) => (
                    <button
                      key={amount}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all group relative ${
                        popular
                          ? 'bg-luxury-card border border-gold/30 hover:border-gold hover:bg-gold/5 shadow-glow-gold'
                          : 'bg-luxury-card border border-white/10 hover:border-gold/50 hover:bg-white/5'
                      }`}
                    >
                      {popular && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gold text-black text-[8px] font-bold px-2 py-0.5 rounded-full uppercase">Popular</div>
                      )}
                      <span className="text-lg font-black text-white group-hover:text-gold">{amount}</span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Números</span>
                    </button>
                  ))}
                </div>
                <div className="bg-luxury-card rounded-lg p-6 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="text-center md:text-left">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Total a pagar</p>
                    <p className="text-3xl font-black text-white">R$ 49,50</p>
                  </div>
                  <button className="w-full md:w-auto px-10 py-4 bg-gold hover:bg-gold-hover text-black font-black uppercase tracking-widest rounded transition-all shadow-glow-gold flex items-center justify-center gap-2">
                    Participar Agora <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Winners & FAQ */}
          <section className="py-20 bg-luxury-bg" id="ganhadores">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Ranking */}
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <span className="material-symbols-outlined text-gold">trophy</span>
                    <h3 className="text-xl font-luxury font-bold text-white uppercase tracking-wider">Ranking dos Campeões</h3>
                  </div>
                  <div className="bg-luxury-card border border-white/5 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                      <span className="text-xs font-bold text-gray-400 uppercase">Usuário</span>
                      <span className="text-xs font-bold text-gray-400 uppercase">Cotas Compradas</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {[
                        { pos: 1, name: 'Rafael M.', cotas: 520, isGold: true },
                        { pos: 2, name: 'Ana Paula S.', cotas: 415, isGold: false },
                        { pos: 3, name: 'Carlos E.', cotas: 380, isGold: false },
                        { pos: 4, name: 'Julia R.', cotas: 250, isGold: false },
                        { pos: 5, name: 'Marcos V.', cotas: 210, isGold: false },
                      ].map(({ pos, name, cotas, isGold }) => (
                        <div key={pos} className="p-4 flex justify-between items-center hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                              pos === 1 ? 'bg-gold text-black' : pos === 2 ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400'
                            }`}>{pos}</div>
                            <span className="text-sm font-medium text-white">{name}</span>
                          </div>
                          <span className={`text-sm font-bold ${isGold ? 'text-gold' : 'text-white'}`}>{cotas}</span>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-luxury-card border-t border-white/5">
                      <p className="text-xs text-gray-500 text-center">O maior comprador ganha <span className="text-gold font-bold">R$ 5.000</span> extras!</p>
                    </div>
                  </div>
                </div>

                {/* FAQ */}
                <div id="faq">
                  <div className="flex items-center gap-3 mb-8">
                    <span className="material-symbols-outlined text-gold">help</span>
                    <h3 className="text-xl font-luxury font-bold text-white uppercase tracking-wider">Perguntas Frequentes</h3>
                  </div>
                  <div className="space-y-4">
                    {[
                      {
                        q: 'Como recebo meu prêmio?',
                        a: 'Após a apuração do resultado, nossa equipe entrará em contato via WhatsApp e telefone para alinhar a entrega do prêmio. Para prêmios físicos como a moto, cobrimos todos os custos de envio.',
                      },
                      {
                        q: 'O sorteio é confiável?',
                        a: 'Sim! Utilizamos os números da Loteria Federal para definir os ganhadores, garantindo 100% de imparcialidade e transparência. Você pode conferir o resultado diretamente no site da Caixa.',
                      },
                      {
                        q: 'Posso pagar com cartão de crédito?',
                        a: 'Atualmente aceitamos exclusivamente PIX, pois permite a baixa automática e instantânea dos seus números, garantindo sua participação imediata no sorteio.',
                      },
                    ].map(({ q, a }) => (
                      <details key={q} className="group bg-luxury-card border border-white/5 rounded-lg open:border-gold/30 transition-all">
                        <summary className="flex cursor-pointer items-center justify-between p-4 font-medium text-white group-hover:text-gold transition-colors">
                          {q}
                          <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                        </summary>
                        <div className="px-4 pb-4 text-sm text-gray-400 leading-relaxed">{a}</div>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Trust badges */}
          <section className="py-10 bg-black border-t border-white/5">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-green-500">lock</span>
                  <span className="text-sm font-bold text-white">Ambiente Seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-blue-500">verified_user</span>
                  <span className="text-sm font-bold text-white">Sorteio Verificado</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-yellow-500">workspace_premium</span>
                  <span className="text-sm font-bold text-white">Garantia de Entrega</span>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="bg-luxury-card border-t border-white/5 pt-16 pb-8">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-gold text-black">
                    <span className="material-symbols-outlined text-lg">diamond</span>
                  </div>
                  <h2 className="text-lg font-luxury font-bold text-white uppercase">Premium<span className="text-gold">Rifas</span></h2>
                </div>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  A plataforma de sorteios premium líder de mercado. Compromisso com a transparência e a satisfação de nossos participantes.
                </p>
                <div className="flex gap-4">
                  <a className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gold transition-colors" href="#">
                    <span className="material-symbols-outlined text-sm">alternate_email</span>
                  </a>
                  <a className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gold transition-colors" href="#">
                    <span className="material-symbols-outlined text-sm">chat</span>
                  </a>
                </div>
              </div>

              <div>
                <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-6">Navegação</h3>
                <ul className="space-y-3 text-sm text-gray-500">
                  {['Sorteios Ativos', 'Ganhadores', 'Termos de Uso', 'Política de Privacidade'].map((item) => (
                    <li key={item}><a className="hover:text-gold transition-colors" href="#">{item}</a></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-6">Suporte</h3>
                <ul className="space-y-3 text-sm text-gray-500">
                  {['Fale Conosco', 'Dúvidas Frequentes', 'Regulamento'].map((item) => (
                    <li key={item}><a className="hover:text-gold transition-colors" href="#">{item}</a></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-6">Pagamento Seguro</h3>
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-white/10 px-3 py-1.5 rounded border border-white/10 flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-400 text-sm">photos</span>
                    <span className="text-xs font-bold text-white">PIX</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  Pagamentos processados em ambiente seguro criptografado. Seus dados estão protegidos.
                </p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs text-gray-600">© 2024 Premium Rifas. Todos os direitos reservados. CNPJ: 00.000.000/0001-00.</p>
              <p className="text-xs text-gray-600 flex items-center gap-1">Feito com <span className="text-gold">♥</span> para vencedores.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function CheckoutPage() {
  return (
    <div className="min-h-screen bg-luxury-bg text-white flex items-center justify-center font-display">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">Checkout</h1>
        <p className="text-gray-400">Tela reservada para fluxo de pagamento via PIX.</p>
        <Link className="text-sm font-semibold text-gold underline" to="/">
          Voltar para home
        </Link>
      </section>
    </div>
  )
}

function ResultPage() {
  return (
    <div className="min-h-screen bg-luxury-bg text-white flex items-center justify-center font-display">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">Resultado</h1>
        <p className="text-gray-400">Tela reservada para histórico de sorteios e ganhadores.</p>
        <Link className="text-sm font-semibold text-gold underline" to="/">
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
          <div className="min-h-screen bg-luxury-bg text-white flex items-center justify-center font-display">
            <section className="space-y-3 text-center">
              <h1 className="text-3xl font-bold text-white">Página não encontrada</h1>
              <Link className="text-sm font-semibold text-gold underline" to="/">
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
