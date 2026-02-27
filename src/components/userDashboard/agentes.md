# Fluxo Minha Conta (Usuario)

Contexto para IA que precisa alterar o painel do usuario.

## Objetivo

- Exibir perfil, numeros e comprovantes do usuario autenticado.
- Manter leitura em tempo real apenas no que e necessario.

## Arquivos chave

- `src/pages/UserDashboardPage.tsx`
- `src/hooks/useUserDashboard.ts`
- `src/components/userDashboard/UserDashboardContent.tsx`
- `src/components/userDashboard/ProfileCard.tsx`
- `src/components/userDashboard/ReceiptsSection.tsx`
- `src/services/userDashboard/userDashboardService.ts`

## Leituras atuais

- `onSnapshot(users/{uid})` para perfil basico.
- `onSnapshot(query orders where userId == uid orderBy createdAt desc limit 120)` para pedidos.
- Callable `getMyTopBuyersWinningSummary` para resumo de vitorias.

## Guardrails de custo

- Nao remover `limit` da consulta de `orders`.
- Nao abrir listeners duplicados para o mesmo `uid`.
- Evitar listeners para colecoes nao usadas no painel.
- Para historicos muito grandes, preferir paginacao antes de subir `limit`.

## Guardrails de negocio

- Usuario admin deve ser redirecionado para `/dashboard`.
- Usuario nao autenticado deve ser redirecionado para `/`.
- Status do pedido deve continuar respeitando expiracao de reserva.

## Checklist antes de alterar

- Validar filtros de tickets/comprovantes com dados reais.
- Verificar se uploads de avatar mantem tratamento de erro.
- Confirmar que novas consultas respeitam regras do Firestore.
