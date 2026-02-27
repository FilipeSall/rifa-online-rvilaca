# Fluxo de Paginas (Router)

Este arquivo orienta outra IA sobre como as paginas orquestram os fluxos principais.

## Objetivo

- Concentrar os pontos de entrada de cada fluxo: compra, checkout, resultado, painel do usuario e admin.
- Evitar mudancas que quebrem navegacao, estado entre paginas ou aumentem leituras desnecessarias.

## Arquivos chave

- `src/App.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/CheckoutPage.tsx`
- `src/pages/ResultsPage.tsx`
- `src/pages/UserDashboardPage.tsx`
- `src/pages/AdminDashboardPage.tsx`

## Mapa de rotas atual

- `/` -> Home + fluxo de compra/reserva.
- `/checkout` -> checkout PIX com dados vindos do `navigate(..., { state })`.
- `/resultado` -> pagina publica de ganhadores e consulta de numero.
- `/minha-conta` -> dashboard do usuario autenticado.
- `/dashboard` -> dashboard admin.

## Regras importantes

- `HomePage` deve continuar delegando a logica de compra para `usePurchaseNumbers`.
- `CheckoutPage` depende do estado enviado da home (`amount`, `quantity`, `selectedNumbers`, `couponCode`).
- `CheckoutPage` possui `onSnapshot` no documento `users/{uid}` para autofill de nome/telefone/cpf.
- `AdminDashboardPage` e `UserDashboardPage` fazem guard de permissao com `authStore`.

## Guardrails de custo (Firestore)

- Nao adicionar listeners globais no nivel de pagina para colecoes grandes.
- Para dados publicos de home/resultado, priorizar hooks com cache em `localStorage`.
- Para fluxo de compra, manter validacao final no backend (nao validar disponibilidade em massa na pagina).

## Checklist antes de alterar

- Confirmar se a rota usa `location.state` critico para continuar o fluxo.
- Confirmar fallback quando usuario abre pagina direto por URL (sem state).
- Confirmar que novas leituras nao rodam em loop por `useEffect` mal condicionado.
