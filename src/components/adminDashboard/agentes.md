# Fluxo Dashboard Admin

Contexto rapido para IA atuar no painel administrativo.

## Objetivo

- Gerenciar campanha, metricas, usuarios e publicacao de sorteios.
- Manter controles de permissao e estabilidade operacional.

## Arquivos chave

- `src/pages/AdminDashboardPage.tsx`
- `src/components/adminDashboard/AdminDashboardContent.tsx`
- `src/components/adminDashboard/ui/DashboardTab.tsx`
- `src/components/adminDashboard/ui/CampaignTab.tsx`
- `src/components/adminDashboard/ui/UsersTab.tsx`
- `src/components/adminDashboard/ui/TopBuyersDrawTab.tsx`
- `src/components/adminDashboard/ui/MainRaffleDrawTab.tsx`
- `src/components/adminDashboard/hooks/*`

## Tabs e responsabilidade

- `dashboard`: KPIs e visao geral.
- `campanha`: configuracoes da campanha e midia.
- `usuarios`: busca e gestao administrativa de usuarios.
- `sorteio-top`: publicacao/consulta sorteio top compradores.
- `sorteio-geral`: publicacao/consulta sorteio principal.

## Guardrails de seguranca

- Acesso so para `userRole === 'admin'`.
- Se nao logado, redireciona para `/`.
- Se logado sem role admin, redireciona para `/minha-conta`.
- Operacoes sensiveis devem continuar em callable backend com validacao de role.

## Guardrails de custo

- Evitar consultas sem `limit` em telas administrativas.
- Evitar polling agressivo para metricas.
- Reaproveitar hooks existentes antes de criar novas assinaturas realtime.

## Checklist antes de alterar

- Confirmar que mudanca nao quebra navegacao por `tab` na URL.
- Confirmar estados de loading e erro por tab.
- Confirmar impacto de leitura/escrita nas funcoes administrativas.
