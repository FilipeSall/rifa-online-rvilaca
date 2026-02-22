# Rifa Online Web - agents.md

Este arquivo concentra o contexto tecnico e de negocio para agentes de IA que vao atuar neste repositorio.

## 1) Objetivo do produto

Aplicacao web de rifa online com checkout PIX integrado ao HorsePay.

Fluxo principal:
1. Usuario seleciona numeros.
2. Backend reserva os numeros por tempo limitado.
3. Backend cria pedido PIX no HorsePay.
4. Usuario paga.
5. HorsePay envia webhook.
6. Sistema confirma pagamento, marca numeros como pagos, atualiza metricas e auditoria.

## 2) Stack e arquitetura

- Frontend:
  - React 19 + TypeScript
  - Vite 7
  - Tailwind CSS 3
  - Firebase Web SDK (Auth, Firestore, Functions, Storage, Analytics)
  - Zustand (estado de auth)
  - React Router 7
  - React Toastify
- Backend:
  - Firebase Cloud Functions v2 (Node 20, TypeScript)
  - Firebase Admin SDK
  - Integracao HTTP com HorsePay (axios)
- Banco:
  - Firestore
- Hosting:
  - Firebase Hosting (SPA rewrite para `index.html`)

## 3) Estrutura relevante do repositorio

- Frontend app: `src/`
- Functions: `functions/src/`
- Regras Firestore: `firestore.rules`
- Regras Storage: `storage.rules`
- Scripts utilitarios: `scripts/`
- Contexto antigo (legado): `agents.md`
- Este documento: `AGENTS.MD`

## 4) Comandos principais

Na raiz do projeto:

- `bun run dev` - inicia frontend local (Vite)
- `bun run build` - build de producao frontend
- `bun run lint` - lint
- `bun run typecheck` - validacao TypeScript sem emitir build
- `bun run deploy:rules` - deploy de regras Firestore
- `bun run seed:firestore` - seed de dados no Firestore (usa credenciais admin)
- `bun run backfill:cpf-registry` - utilitario de backfill

Na pasta `functions/`:

- `npm run build` - compila Cloud Functions TS para `functions/lib`

## 5) Variaveis de ambiente e secrets

### Frontend (`.env`)

Obrigatorias:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIREBASE_FUNCTIONS_REGION` (default no codigo: `southamerica-east1`)

Observacao: `src/lib/firebase.ts` lanca erro em runtime se faltar qualquer variavel obrigatoria.

### Scripts de seed (`.env` / shell)

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `SEED_CAMPAIGN_ID`
- `SEED_PRECREATE_NUMBERS`
- `ALLOW_LARGE_NUMBER_SEED`
- `SEED_CREATE_EXAMPLES`

### Cloud Functions secrets (Firebase Functions Secret Manager)

- `HORSEPAY_CLIENT_KEY`
- `HORSEPAY_CLIENT_SECRET`
- `HORSEPAY_WEBHOOK_TOKEN`

## 6) Rotas do frontend (status atual)

Definidas em `src/App.tsx`:
- `/` - home
- `/minha-conta` - dashboard do usuario
- `/dashboard` - dashboard admin
- `/checkout` - checkout PIX
- `/resultado` - placeholder atualmente
- `*` - not found placeholder

## 7) Cloud Functions expostas

Em `functions/src/index.ts`:

- `upsertCampaignSettings` (callable)
- `reserveNumbers` (callable)
- `createPixDeposit` (callable, exige secrets)
- `requestWithdraw` (callable, exige secrets)
- `getBalance` (callable, exige secrets)
- `getDashboardSummary` (callable)
- `pixWebhook` (HTTP onRequest, protegido por token)

## 8) Fluxo transacional de venda (implementado)

### Reserva de numeros
- Callable `reserveNumbers`.
- Exige usuario autenticado.
- Valida faixa de numeros e limites de quantidade.
- Transacao Firestore:
  - libera reservas antigas do proprio usuario que sairam da selecao
  - reserva novos numeros com `reservationExpiresAt`
  - atualiza `numberReservations/{uid}`
- Regras atuais de quantidade e faixa:
  - minimo: 10
  - maximo: 300
  - faixa: 540001 a 540120
  - expiracao: 10 minutos

### Criacao do PIX
- Callable `createPixDeposit`.
- Exige usuario autenticado e reserva ativa nao expirada.
- Valor final e calculado no servidor: `quantidade_reservada * pricePerCota`.
- Ignora valor confiado do cliente (apenas registra divergencia para log).
- Cria pedido no HorsePay com retry ate 3 tentativas.
- Persiste `orders/{externalId}` com status `pending` ou `failed`.

### Webhook de pagamento
- Endpoint `pixWebhook` (metodo POST).
- Sempre responde HTTP 200 (inclusive erro interno), para evitar retry agressivo do gateway.
- Exige token valido (`HORSEPAY_WEBHOOK_TOKEN`) em header/query.
- Idempotencia:
  - evento por `orders/{externalId}/events/{eventId}`
  - contabilizacao unica por `salesLedger/{externalId}`
- Se status final `paid` para `deposit`, executa reconciliacao:
  - `payments/{externalId}` atualizado/criado
  - `salesLedger/{externalId}` criado (uma vez)
  - `metrics/sales_summary` incrementado
  - `salesMetricsDaily/{YYYY-MM-DD}` incrementado
  - `auditLogs/payment_paid_{externalId}` atualizado/criado
  - `raffleNumbers/{number}` -> `pago`, com `ownerUid` e `orderId`
  - `numberReservations/{uid}` removido quando corresponde ao conjunto pago

## 9) Colecoes Firestore relevantes

Colecoes usadas no runtime atual:
- `users`
- `campaigns`
- `draws`
- `winners`
- `raffleNumbers`
- `numberReservations`
- `orders`
- `orders/{orderId}/events`
- `payments`
- `salesLedger`
- `metrics`
- `salesMetricsDaily`
- `auditLogs`
- `infractions`
- `cpfRegistry`

## 10) Regras de seguranca (Firestore rules)

Resumo de `firestore.rules`:
- `campaigns`, `draws`, `winners`, `raffleNumbers`: leitura publica, escrita negada ao cliente.
- `numberReservations/{uid}`: leitura somente do dono, escrita negada ao cliente.
- `users/{uid}`:
  - leitura/escrita somente do proprio usuario.
  - `role` nao pode ser elevado pelo cliente (preservacao/controle).
- `cpfRegistry/{cpfId}`:
  - create permitido para usuario autenticado com formato valido.
  - update/delete negado.
- `orders/{orderId}`:
  - leitura somente para o dono (`resource.data.userId == auth.uid`).
  - escrita negada ao cliente.
- colecoes sensiveis (`payments`, `auditLogs`) negadas ao cliente.
- fallback global: negar tudo nao explicitamente permitido.

## 11) Regras de negocio do escopo (extraidas do PDF)

Fonte de negocio: `/home/sea/Downloads/📄_ESCOPO_DO_SITE_–_RIFA_ONLINE.pdf`

### Campanha e premios
- Sorteio com:
  - BMW R1200 GS (2015/2016, preta, gasolina)
  - Honda CG Start 160 (2026/2026)
  - 20 premios PIX de R$ 1.000
- Total de cotas alvo de negocio: 3.450.000
- Numeracao automatica, sem repeticao

### Paginas previstas no escopo
- Home/Landing:
  - banner principal com premios
  - contador regressivo do sorteio
  - progresso de vendas (% vendida)
  - botao comprar numeros
  - quantidade de cotas vendidas
  - depoimentos de ganhadores (opcional)
  - lista de ganhadores anteriores
  - regulamento
  - FAQ
  - secoes de seguranca/transparencia
- Pagina de compra:
  - escolha de quantidade
  - selecao manual ou automatica
  - exibicao de numeros disponiveis
  - resumo/carrinho
  - valor total
  - cupom (opcional)
- Checkout:
  - numeros adquiridos
  - status de pagamento
  - download de comprovante
  - envio automatico por WhatsApp e email
- Pagina de resultados:
  - resultado dos sorteios
  - lista de ganhadores
  - historico de campanhas
  - prova do sorteio (loteria federal ou algoritmo auditavel)

### Pagamento e reserva
- PIX automatico obrigatorio
- QR Code dinamico
- Confirmacao automatica por webhook
- Reserva temporaria de numeros (exemplo dado: 10 minutos)
- Liberacao automatica apos confirmacao de pagamento

### Controle de numeros
- Estados de numero: disponivel, reservado, pago
- Selecao automatica aleatoria
- Possibilidade de selecao manual
- Bloqueio de duplicidade
- Registro de dono do numero

### Area administrativa esperada
- Dashboard:
  - faturamento total
  - numeros vendidos/disponiveis
  - conversao
  - ticket medio
  - vendas por dia
- Gestao de pedidos:
  - lista de compradores
  - status de pagamento
  - reenviar numeros
  - cancelar compra
  - exportar relatorios
- Gestao da campanha:
  - editar premios
  - alterar data do sorteio
  - alterar preco da cota
  - inserir regulamento
  - upload de imagens
- Gestao financeira:
  - extrato de pagamentos
  - conciliacao PIX
  - exportacao de planilhas
- Sorteio:
  - rodar sorteio automatico
  - inserir resultado da loteria federal
  - registrar/publicar ganhadores

### Area do usuario esperada
- Cadastro com nome, CPF, telefone, email
- Login por email/senha (OTP WhatsApp opcional)
- Ver numeros comprados, comprovantes, resultados e historico

### Automacoes esperadas
- WhatsApp: confirmacao, envio dos numeros, aviso de sorteio e resultado
- Email: confirmacao de pagamento, recibo, numeros adquiridos

### Seguranca e confianca esperadas
- SSL
- compliance LGPD
- logs de sorteio
- antifraude
- backup automatico
- anti bot

### Escalabilidade esperada
- Alto volume simultaneo
- Picos de acesso
- Milhares de transacoes por hora
- Banco otimizado
- CDN e cache

### Marketing e opcionais
- Pixel Meta
- Opcionais recomendados:
  - ranking de maiores compradores
  - combo promocional
  - popup de urgencia
  - prova social em tempo real

### Regras de negocio centrais (explicitadas no PDF)
- Numero so pertence ao usuario apos pagamento confirmado.
- Compra minima deve ser definida pelo admin.
- Nao permitir duplicidade de numeros.
- Sorteio deve ser transparente e auditavel.
- Log completo das operacoes.
- UX alvo: fluxo compra/pagamento/recebimento em menos de 60 segundos.

## 12) Gap entre escopo e implementacao atual

Pontos importantes para agentes:

1. Escopo fala em 3.450.000 cotas, mas runtime atual opera com faixa curta (`540001..540120`) nas constantes das functions/frontend.
2. Script de seed contempla modelo grande (inclusive subcolecao `campaigns/{id}/numbers`), mas runtime principal usa colecao top-level `raffleNumbers`.
3. Rota `/resultado` ainda esta como placeholder.
4. Recursos de automacao WhatsApp/email, anti-bot, marketing avancado e sorteio completo ainda nao estao totalmente implementados no frontend/backend principal.

Qualquer agente deve validar com o dono do projeto se o objetivo e:
- manter o range reduzido atual (MVP), ou
- evoluir para o range total do escopo (3.45M).

## 13) Convencoes e cuidados para alteracoes

- Nunca confiar em valor financeiro vindo do frontend.
- Preservar idempotencia no webhook e na contabilizacao financeira.
- Evitar quebrar compatibilidade de payload HorsePay sem atualizar `horsepayPayload.ts`.
- Alterou statuses do gateway? revisar `inferOrderStatus` e `inferOrderType`.
- Alterou campos/colecoes? revisar `firestore.rules`.
- Alterou secrets? atualizar deploy de secrets no Firebase.
- Evitar logs com PII em claro (ha mascaramento em varios pontos do backend).
- Nao expor chaves/credentials no repositorio.

## 14) Ordem recomendada para agentes ao pegar tasks

1. Ler este `AGENTS.MD`.
2. Ler `functions/src/index.ts` e handlers relacionados ao fluxo da tarefa.
3. Conferir `firestore.rules` antes de mudar leitura/escrita no cliente.
4. Se envolver checkout/pagamento, validar ponta a ponta:
   - reserva -> createPixDeposit -> webhook -> atualizacao de order/metrics/numeros.
5. Se envolver campanha/admin, validar papel `admin` e impacto em `campaigns`.
6. Se envolver escala de numeros, alinhar modelo unico:
   - `raffleNumbers` (atual) vs `campaigns/{id}/numbers` (seed legado/alternativo).

## 15) Arquivos-chave (atalho mental rapido)

- Entrada functions: `functions/src/index.ts`
- Pagamentos/webhook: `functions/src/lib/paymentHandlers.ts`
- Reservas: `functions/src/lib/reservationHandlers.ts`
- Campanha/dashboard admin: `functions/src/lib/campaignHandlers.ts`
- Constantes de dominio: `functions/src/lib/constants.ts`
- Firestore rules: `firestore.rules`
- Firebase web init: `src/lib/firebase.ts`
- Fluxo de compra frontend: `src/hooks/usePurchaseNumbers.ts`
- Checkout frontend: `src/components/PixCheckout.tsx`
- Estado auth: `src/stores/authStore.ts`

## 16) Estado do projeto Firebase

- Projeto default em `.firebaserc`: `rifa-online-395d9`
- Hosting configurado para servir `dist` e reescrever qualquer rota para `index.html`
- Predeploy de functions compila TypeScript automaticamente

## 17) Observacao final para IAs

Quando houver conflito entre escopo do PDF e implementacao real no codigo, priorizar:
1. nao quebrar o fluxo transacional e a seguranca atuais;
2. explicitar o gap no PR/entrega;
3. propor migracao incremental em vez de troca brusca de modelo.
