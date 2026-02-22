# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
# Frontend (root)
bun run dev          # Vite dev server
bun run build        # Production build → dist/
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit (no emit, type check only)

# Firebase rules
bun run deploy:rules

# Database scripts
bun run seed:firestore
bun run backfill:cpf-registry

# Cloud Functions (from functions/ directory)
cd functions && npm install && npm run build
firebase deploy --only functions
firebase functions:secrets:set <SECRET_NAME>
```

> Note: Cloud Functions use npm (not bun) because they run on Node.js 20 in Firebase.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Firebase (Auth, Firestore, Storage, Cloud Functions), HorsePay for PIX payments (Brazilian payment gateway).

### Frontend (`src/`)

- **Routing:** React Router v7, routes in `src/App.tsx`. Main routes: `/` (home), `/minha-conta` (user dashboard), `/dashboard` (admin only), `/checkout`
- **Auth:** `onIdTokenChanged` listener → Zustand store (`src/stores/`) + `AuthProvider` context (`src/context/`). Role (`user`|`admin`) fetched from Firestore `users/{uid}.role`
- **Server state:** TanStack React Query for caching/data fetching
- **Styling:** Tailwind CSS with a luxury dark theme — `luxury-bg: #0A0A0A`, `luxury-card: #141414`, `gold: #F5A800`, fonts: Plus Jakarta Sans + Cinzel
- **Services:** `src/services/` abstracts all Firestore reads and Cloud Function invocations from components

### Cloud Functions (`functions/src/`)

All sensitive operations run server-side. Never trust amounts or roles from the frontend.

- `index.ts` — exports all functions
- `lib/constants.ts` — min/max cotas per reservation, campaign doc ID constant
- `lib/shared.ts` — token validation, sanitize, masking utilities
- `lib/horsepayClient.ts` — HorsePay HTTP auth + API calls + error mapping
- `lib/horsepayPayload.ts` — resilient extraction of `external_id`, `copy_past`, `payment` from HorsePay responses
- `lib/reservationHandlers.ts` — atomic number reservation/release
- `lib/paymentHandlers.ts` — PIX deposit, webhook reconciliation, withdraw, balance
- `lib/campaignHandlers.ts` — campaign settings update, dashboard summary

### Firestore Collections

`users`, `campaigns`, `numberReservations`, `raffleNumbers`, `orders` (+`events` subcollection), `payments`, `salesLedger`, `metrics`, `salesMetricsDaily`, `auditLogs`, `infractions`, `cpfRegistry`

Rules in `firestore.rules` — update rules whenever adding/renaming collections or fields.

## Critical Sales Flow

1. `reserveNumbers` — reserves raffle numbers atomically in Firestore
2. `createPixDeposit` — calculates amount from `campaigns/{id}.pricePerCota` on server, creates PIX order via HorsePay
3. HorsePay calls `pixWebhook` — validates `HORSEPAY_WEBHOOK_TOKEN`, writes idempotent event to `orders/{externalId}/events/{eventId}`
4. On confirmed payment: updates `payments`, `salesLedger`, `metrics/sales_summary`, `salesMetricsDaily/{YYYY-MM-DD}`, `auditLogs`, marks `raffleNumbers` as `pago`, removes `numberReservations`

**Invariants:**
- Webhook always returns HTTP 200 (even on error) to prevent gateway retries
- Financial idempotency via `salesLedger/{externalId}` and webhook event IDs
- PIX amount is always calculated server-side (`expectedAmount`)

## Required Firebase Secrets

- `HORSEPAY_CLIENT_KEY`
- `HORSEPAY_CLIENT_SECRET`
- `HORSEPAY_WEBHOOK_TOKEN` — protects `pixWebhook` from unauthorized calls

Set with: `firebase functions:secrets:set <NAME>`

## Key Maintenance Rules

- HorsePay payload changes → update `functions/src/lib/horsepayPayload.ts`
- New gateway statuses → update `inferOrderStatus`/`inferOrderType` in `paymentHandlers.ts`
- New Firestore collections/fields → update `firestore.rules`
- Admin role writes are backend-only (enforced by Firestore rules)
