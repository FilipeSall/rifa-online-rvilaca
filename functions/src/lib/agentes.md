# Fluxo Backend (Cloud Functions + Firestore)

Este arquivo explica o contexto backend para outra IA atuar com seguranca.

## Objetivo

- Manter consistencia transacional em reserva, pagamento e publicacao de resultados.
- Evitar leituras/escritas explosivas no Firestore.

## Arquivos chave por dominio

- Reserva: `reservationHandlers.ts`, `numberStateStore.ts`
- Numeros publicos: `numberHandlers.ts`
- Pagamento PIX: `paymentHandlers.ts`, `horsepayClient.ts`, `horsepayPayload.ts`
- Campanha e metricas: `campaignHandlers.ts`
- Ranking/sorteios: `rankingHandlers.ts`, `topBuyersDrawHandlers.ts`, `mainRaffleDrawHandlers.ts`
- Admin/usuarios: `userAdminHandlers.ts`, `userProfileHandlers.ts`
- Utilitarios e contratos: `shared.ts`, `constants.ts`

## Contratos criticos

- `reserveNumbers`:
- Exige auth.
- Valida faixa e quantidade.
- Usa transacao para reservar/liberar numeros.
- Retorna conflitos em lote (`conflictedNumbers`) para a UI tratar em modal.
- `createPixDeposit`:
- Exige auth e secrets validos.
- Calcula valor no servidor com base na reserva ativa.
- Cria pedido no gateway e persiste `orders`.
- `pixWebhook`:
- Deve permanecer idempotente.
- Sempre responde HTTP 200 para evitar retries agressivos.
- Atualiza `orders`, `payments`, `salesLedger`, metricas e `numberChunks`.

## Guardrails de custo

- Nunca varrer colecoes inteiras para validar numeros.
- Ler somente docs necessarios por id (ex.: numeros solicitados na reserva).
- Evitar loops de trigger que reescrevem o mesmo documento repetidamente.
- Em callable publica, limitar `limit` e sanitizar entrada.

## Guardrails de seguranca

- Manter `requireActiveUid` em endpoints autenticados.
- Nao confiar em valor monetario vindo do cliente.
- Validar token/secrets no webhook e nas operacoes do gateway.
- Preservar verificacoes de role em handlers admin.

## Checklist antes de alterar

- Confirmar impacto de leitura/escrita por request.
- Confirmar idempotencia em paths de pagamento e webhook.
- Confirmar mensagens e `details` de erro para UX do frontend.
- Rodar build: `npm --prefix functions run build`.
