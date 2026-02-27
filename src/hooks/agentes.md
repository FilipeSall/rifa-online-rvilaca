# Fluxo de Hooks e Politica de Cache

Este arquivo descreve como os hooks do projeto evitam leituras excessivas.

## Objetivo

- Padronizar cache e janela de refetch.
- Evitar chamadas repetidas de callables em cada render.

## Arquivos chave

- `src/utils/fetchCache.ts`
- `src/hooks/useWeeklyTopBuyersRanking.ts`
- `src/hooks/useTopBuyersDraw.ts`
- `src/hooks/useMainRaffleDraw.ts`
- `src/hooks/useWinnersNotification.ts`
- `src/hooks/usePublicSalesSnapshot.ts`

## Estrategia atual

- Dados publicos e de ranking usam `localStorage` via:
- `readCachedJson`
- `writeCachedJson`
- `shouldFetchAfterDays`
- `markFetchedNow`
- Politica atual dominante: refetch a cada 5 dias (`FETCH_EVERY_DAYS = 5`).
- Chaves de cache sao versionadas (`...:v1`) para invalidacao controlada.

## Guardrails de custo

- Nao chamar callable dentro de render.
- Evitar intervalos curtos sem necessidade real.
- Em auto refresh, sempre verificar `document.visibilityState`.
- Sempre usar condicao de TTL antes de buscar novamente.

## Quando alterar TTL

- Aumentar TTL para dados mais estaveis (ranking historico e snapshots publicos).
- Reduzir TTL apenas quando o requisito de negocio exigir dado quase em tempo real.
- Se reduzir TTL, documentar impacto esperado em leituras.

## Checklist antes de alterar

- Confirmar que `useEffect` nao cria loop por dependencia incorreta.
- Confirmar que hook inicia com cache quando existir.
- Confirmar fallback seguro em erro de rede sem quebrar UI.
