# Fluxo Resultado e Ganhadores

Contexto para IA no fluxo publico de auditoria e ganhadores.

## Objetivo

- Exibir ultimo resultado publicado e historico auditavel.
- Permitir consulta publica de numero sem expor colecoes sensiveis.

## Arquivos chave

- `src/pages/ResultsPage.tsx`
- `src/components/winners/PrizeWinnersShowcase.tsx`
- `src/components/winners/PublicNumberLookupSection.tsx`
- `src/hooks/useTopBuyersDraw.ts`
- `src/hooks/useMainRaffleDraw.ts`
- `functions/src/lib/topBuyersDrawHandlers.ts`
- `functions/src/lib/mainRaffleDrawHandlers.ts`

## Estrategia de dados

- Hooks de sorteio usam cache local + refetch condicional por dias.
- Historicos publicos usam callable dedicada com `limit`.
- UI mostra trilha de calculo para transparencia da apuracao.

## Guardrails de custo

- Nao consultar colecoes brutas diretamente no cliente.
- Nao remover limite de historico.
- Nao reduzir TTL de cache sem necessidade de negocio.

## Guardrails de negocio

- Dados exibidos precisam ser normalizados e validados antes de render.
- Falta de resultado deve cair em estado vazio claro, sem erro fatal.
- Apuracao deve continuar explicavel (trilha de calculo visivel).

## Checklist antes de alterar

- Testar sem resultado publicado.
- Testar com resultado parcial/invalido vindo do backend.
- Confirmar se labels de calculo batem com os campos retornados.
