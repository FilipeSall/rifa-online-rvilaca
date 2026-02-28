# Fluxo Home (Landing e Entrada de Compra)

Contexto para IA no layout principal da home.

## Objetivo

- Entregar a pagina de entrada com CTA claro para compra.
- Integrar secoes institucionais sem acoplar logica pesada de dados.

## Arquivos chave

- `src/pages/HomePage.tsx`
- `src/components/home/HeroSection.tsx`
- `src/components/home/Header.tsx`
- `src/components/home/AnnouncementBar.tsx`
- `src/components/home/WinnersFaqSection.tsx`
- `src/components/home/TrustBadgesSection.tsx`
- `src/components/home/Footer.tsx`

## Integracao com compra

- O Hero recebe `quantity`, `packQuantities` e `onSetQuantity` do `usePurchaseNumbers`.
- A secao de compra real fica em `src/components/purchaseNumbers/*`.
- Home nao deve fazer consulta de disponibilidade de numero diretamente.

## Guardrails de custo

- Nao adicionar listeners Firestore no Hero/Header para dados nao essenciais.
- Para contadores ou stats publicos, usar hooks com cache e TTL.
- Evitar efeitos que disparam callable em cada render/scroll.

## Checklist antes de alterar

- Confirmar que CTA ainda leva para `#comprar-numeros`.
- Confirmar que mudanca visual nao quebra performance mobile.
- Confirmar que secoes continuam desacopladas da logica de reserva.
