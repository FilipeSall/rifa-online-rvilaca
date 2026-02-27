# Fluxo de Compra e Reserva (Frontend)

Este fluxo controla selecao de numeros, conflito e ida para checkout.

## Objetivo

- Garantir UX rapida com poucas leituras.
- Deixar validacao de disponibilidade e trava de concorrencia no backend.

## Arquivos chave

- `src/hooks/usePurchaseNumbers.ts`
- `src/components/purchaseNumbers/PurchaseNumbersContent.tsx`
- `src/components/purchaseNumbers/NumberSelectionCard.tsx`
- `src/components/purchaseNumbers/PurchaseSummaryCard.tsx`
- `functions/src/lib/reservationHandlers.ts` (contrato do callable)

## Como funciona hoje

- A grade de numeros e gerada localmente (`buildLocalNumberPool`) por pagina de 50.
- Selecao automatica usa pool local aleatorio (`pickRandomUniqueNumbersFromRange`).
- Selecao manual adiciona numero localmente, sem consulta imediata ao banco.
- A reserva real acontece apenas ao clicar em comprar (`reserveNumbers`).

## Conflitos de reserva

- Se o backend retornar conflito, a UI recebe lista de `conflictedNumbers`.
- O modal mostra todos os numeros em conflito de uma vez.
- Usuario escolhe:
- `Escolher manualmente` para revisar.
- `Preencher todos automatico` para substituir em lote.

## Guardrails de custo

- Nao reintroduzir `onSnapshot` para disponibilidade de todos os numeros da campanha.
- Nao fazer `get` por numero durante clique na grade.
- Nao fazer polling curto para validar disponibilidade.
- Manter validacao final de disponibilidade dentro da transacao do backend.

## Invariantes de negocio

- Quantidade minima vem de `campaign.minPurchaseQuantity`.
- Limite maximo segue `campaign.totalNumbers`.
- Navegacao para `/checkout` so depois de reserva bem sucedida.

## Checklist antes de alterar

- Verificar se conflito continua sendo tratado em lote, nao item por item.
- Verificar se `handleProceed` continua sendo o unico ponto de reserva.
- Verificar se quantidade selecionada e preservada ao substituir conflitos.
