# Rifa Online Web - Agent Context

## Objetivo
Aplicacao de rifa com checkout PIX via HorsePay. O frontend usa Firebase Auth + Firestore. As Cloud Functions em `functions/src` fazem reserva de numeros, criacao de pedido PIX, webhook de confirmacao e metricas/auditoria.

## Fluxo Critico de Venda
1. Usuario reserva numeros (`reserveNumbers`).
2. Usuario gera PIX (`createPixDeposit`) com valor calculado no servidor a partir da reserva e `campaigns/{CAMPAIGN_DOC_ID}.pricePerCota`.
3. HorsePay chama `pixWebhook`.
4. Webhook atualiza `orders/{externalId}` e cria evento idempotente em `orders/{externalId}/events/{eventId}`.
5. Se pagamento confirmado, aplica logica de negocio:
- cria/atualiza `payments/{externalId}`
- cria `salesLedger/{externalId}` (idempotente)
- incrementa `metrics/sales_summary`
- incrementa `salesMetricsDaily/{YYYY-MM-DD}`
- cria/atualiza `auditLogs/payment_paid_{externalId}`
- marca `raffleNumbers/{number}` como `pago`
- remove `numberReservations/{uid}` quando aplicavel

## Seguranca e Secrets
Secrets esperados:
- `HORSEPAY_CLIENT_KEY`
- `HORSEPAY_CLIENT_SECRET`
- `HORSEPAY_WEBHOOK_TOKEN`

`HORSEPAY_WEBHOOK_TOKEN` protege o endpoint `pixWebhook` contra chamadas nao autorizadas (query/header). Sem ele, qualquer origem poderia tentar simular callback.

## Estrutura de Functions (apos refatoracao)
- `functions/src/index.ts`: composicao e exports das functions.
- `functions/src/lib/constants.ts`: constantes globais e tipos base.
- `functions/src/lib/shared.ts`: utilitarios comuns (sanitize, parse, hash/eventId, mascaramento, token check).
- `functions/src/lib/horsepayClient.ts`: token + chamadas HTTP HorsePay + map de erros.
- `functions/src/lib/horsepayPayload.ts`: extracao resiliente de `external_id`, `copy_past`, `payment`.
- `functions/src/lib/campaignHandlers.ts`: handlers de campanha e resumo do dashboard.
- `functions/src/lib/reservationHandlers.ts`: reserva/liberacao de numeros.
- `functions/src/lib/paymentHandlers.ts`: deposito, saque, saldo, webhook e logica de conciliacao.

## Collections usadas no Firestore
- `users`
- `campaigns`
- `numberReservations`
- `raffleNumbers`
- `orders` (+ subcollection `events`)
- `payments`
- `salesLedger`
- `metrics`
- `salesMetricsDaily`
- `auditLogs`
- `infractions`

## Regras de Negocio Importantes
- Minimo e maximo de cotas por reserva definidos em `constants.ts`.
- Valor do pedido PIX e sempre do servidor (`expectedAmount`), nunca confiado do frontend.
- Webhook responde HTTP 200 sempre (inclusive erro interno) para evitar retry agressivo do gateway.
- Idempotencia de eventos do webhook por `eventId` e de contabilizacao financeira por `salesLedger/{externalId}`.

## Pontos de Atencao para futuras alteracoes
- Qualquer mudanca no payload HorsePay deve atualizar `horsepayPayload.ts`.
- Qualquer novo status do gateway deve revisar `inferOrderStatus`/`inferOrderType` em `paymentHandlers.ts`.
- Alteracoes de collections/campos exigem revisar `firestore.rules`.
- Alteracoes em secrets exigem deploy com `firebase functions:secrets:set`.
