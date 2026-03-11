# JhonyBarber — Plataforma de Rifa Online

**Site em producao:** https://jhonnybarber.com.br

Plataforma completa de rifa/sorteio online desenvolvida para o criador de conteudo **Jhony Barber**. Participantes compram cotas numeradas via PIX e concorrem a premios de alto valor — atualmente uma **BMW R1200 GS 2015/2016 Triple Black**, uma **Honda CG TITAN 160 2025** e **20 PIX de R$ 1.000 cada**. O sorteio e apurado com transparencia total pela **Loteria Federal**.

---

## Sobre o Projeto

SPA com backend serverless que gerencia campanhas de sorteio de ponta a ponta:

- Venda de cotas numeradas com selecao rapida ou compra personalizada
- Pagamento via PIX gerado automaticamente, com confirmacao instantanea via webhook
- Reserva temporaria de numeros por 5 minutos durante o fluxo de pagamento
- Ranking Geral e Ranking Semanal dos maiores compradores, atualizado em tempo real
- Historico de ganhadores de edicoes anteriores
- Painel Administrativo completo com dashboard de faturamento, campanhas, usuarios, sorteios e graficos de receita por dia
- Sorteio Top e Sorteio Principal configuraveis pelo administrador
- Comprovante em PDF gerado automaticamente apos pagamento confirmado
- Ambiente seguro com App Check do Firebase e regras de seguranca no Firestore e Storage

---

## Stack Tecnologica

### Frontend

| Tecnologia | Versao | Uso |
|---|---|---|
| React | 19 | Interface SPA, entrypoint em src/main.tsx |
| TypeScript | — | Tipagem estatica no frontend e backend |
| Vite | 7 | Bundler e dev server |
| React Router DOM | 7 | Navegacao client-side |
| Tailwind CSS | 3 | Estilizacao utilitaria com PostCSS e Autoprefixer |
| TanStack React Query | — | Cache e fetch de dados assincronos |
| Zustand | — | Estado global leve (authStore.ts) |

### Backend e Infraestrutura

| Tecnologia | Uso |
|---|---|
| Firebase Cloud Functions v2 | Handlers HTTP e callable para logica de negocio |
| Firebase Admin SDK | Gerenciamento server-side e scripts de exportacao |
| Firebase Firestore | Banco de dados NoSQL em tempo real |
| Firebase Auth | Autenticacao de usuarios |
| Firebase Storage | Armazenamento de arquivos e imagens |
| Firebase Analytics | Metricas de uso |
| Firebase App Check | Protecao contra abusos |
| Firebase Hosting | Hospedagem do frontend |
| Firebase Emulator Suite | Ambiente local de desenvolvimento |

### Pagamento PIX

| Tecnologia | Uso |
|---|---|
| HorsePay | Gateway de pagamento PIX |
| Axios | Chamadas HTTP no backend para a API HorsePay |
| qrcode | Geracao do QR Code PIX |

### UI e UX

| Biblioteca | Uso |
|---|---|
| React Toastify | Notificacoes e alertas |
| React Icons | Biblioteca de icones |
| React Loading Skeleton | Skeletons de carregamento |
| Swiper | Carrossel de premios |
| Recharts | Graficos do dashboard (faturamento por dia) |

### Utilitarios

| Biblioteca | Uso |
|---|---|
| Luxon | Manipulacao e formatacao de datas |
| jsPDF | Geracao de comprovantes em PDF |

### Qualidade e Testes

| Ferramenta | Uso |
|---|---|
| ESLint 9 | Linting e padronizacao de codigo |
| Vitest | Testes unitarios |
| Testing Library | Testes de componentes React |
| Happy DOM | DOM virtual para testes |

### Package Management e Runtime

Bun e utilizado fortemente nos scripts do projeto. npm esta presente no fluxo de deploy e predeploy.

---

## Inicio Rapido

### Testar localmente

Terminal 1 — Emuladores Firebase:

```bash
bun run emulators:start
```

Terminal 2 — Frontend (aguarde Terminal 1 inicializar):

```bash
bun run seed:emulator:users
bun run dev:emulator
```

Login admin local: CPF 00000000000 / Senha admin123

---

## Arquitetura

```
rifa-online-rvilaca/
src/              Frontend React (main.tsx, App.tsx, lib/firebase.ts, stores/authStore.ts)
functions/        Backend Firebase Cloud Functions (index.ts, lib/paymentHandlers.ts, lib/horsepayClient.ts)
scripts/          Scripts administrativos
firebase.json     Firebase Hosting, Firestore, Storage, Emulators
firestore.rules   Regras de seguranca do Firestore
storage.rules     Regras de seguranca do Storage
tailwind.config.js, vite.config.js, vitest.config.ts
```

---

## Deploy

Deploy via Firebase CLI. O predeploy compila o frontend com Vite e o backend com TypeScript antes de enviar para o Firebase Hosting e Functions.

```bash
bun run deploy
```

---

## Seguranca

Firebase App Check bloqueia requisicoes nao autorizadas. Firestore Rules e Storage Rules restringem acesso por perfil. Webhook PIX autenticado com validacao de assinatura no backend. Reserva temporaria de cotas evita conflito de compras simultaneas.

---

## Licenca

Projeto privado — todos os direitos reservados a JhonyBarber.
