# Fluxo Notificacao de Ganhadores (Home FAB + Modal)

Contexto para IA no mini fluxo de notificacao da home.

## Objetivo

- Avisar usuario quando existe novo resultado publicado.
- Exibir modal de ganhadores sem sobrecarregar backend.

## Arquivos chave

- `src/hooks/useWinnersNotification.ts`
- `src/components/winnersNotification/WinnersFloatingButton.tsx`
- `src/components/winnersNotification/WinnersModal.tsx`
- `src/services/winners/winnersService.ts`

## Comportamento atual

- Carrega cache inicial de `localStorage`.
- Busca remota apenas quando TTL expira (5 dias) ou cache nao existe.
- Mantem `lastViewedDrawId` no storage para controlar visibilidade do FAB.
- Auto refresh roda por intervalo, mas respeita `document.visibilityState`.

## Guardrails de custo

- Nao remover gate de TTL antes de chamar `refreshWinners`.
- Nao baixar intervalo de auto refresh sem justificativa forte.
- Nao fazer query direta em colecoes de sorteio no componente.

## Checklist antes de alterar

- Verificar se abrir modal marca draw como visualizado.
- Verificar sincronizacao entre abas pelo evento `storage`.
- Verificar fallback de erro sem quebrar home.
