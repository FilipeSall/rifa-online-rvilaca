# Rifa Online Web

Frontend React + backend Firebase Functions para reservas de numeros, pagamentos PIX e consolidacao de vendas.

## Inicio rapido

### Testar local (2 comandos em 2 terminais)

Terminal 1:

```bash
bun run emulators:start
```

Terminal 2 (espere o terminal 1 concluir):

```bash
bun run seed:emulator:users
bun run dev:emulator
```

Login admin local (emulator):
- CPF: `00000000000`
- Telefone: `99999999999`

Quando gerar um PIX e quiser simular o pagamento HorsePay no emulator:

```bash
bun run webhook:mock:paid
```

### Voltar para producao

1. Pare os emuladores (`Ctrl + C` no terminal 1).
2. Rode o frontend normal:

```bash
bun run dev
```

Checklist rapido de producao:
- `VITE_USE_FIREBASE_EMULATORS=false` (ou ausente).
- `USE_MOCK_HORSEPAY` nao definido em producao.

## Objetivo desta documentacao

Este guia mostra exatamente:

1. Como testar backend local sem usar producao e sem custo do Firebase.
2. Quantos terminais abrir em cada fluxo.
3. Como voltar para ambiente de producao com seguranca.

## Modos de execucao

### 1) Desenvolvimento local com Emulator Suite (fluxo manual)

- Usa projeto demo `demo-rifa-online`.
- Usa gateway PIX mock (`USE_MOCK_HORSEPAY=true`).
- Nao toca dados de producao.
- Nao gera custo de uso do Firebase em producao.
- Terminais necessarios: **2**.

### 2) Teste E2E automatizado do backend

- Sobe emuladores temporariamente e encerra ao final.
- Executa o cenario completo: reserva -> createPixDeposit(mock) -> webhook -> baixa.
- Terminais necessarios: **1**.

### 3) Ambiente de producao

- Sem emuladores.
- Usa projeto Firebase real (`rifa-online-395d9`).
- Usa secrets reais no Secret Manager.

## Pre-requisitos

- Node.js instalado.
- Dependencias do projeto instaladas (`bun install`).
- Java instalado (necessario para Firestore Emulator).
- Firebase CLI instalada.

## Arquivos de configuracao de ambiente

### Frontend

- `/.env` (base do frontend)
- `/.env.emulator` (modo local com emuladores)
- `/.env.production` (modo producao)

### Functions

- `/functions/.env.local` (flags locais do emulator)
- `/functions/.secret.local` (secrets locais para Functions Emulator)

## Setup inicial (uma vez)

1. Instale dependencias da raiz:

```bash
bun install
```

2. Instale dependencias das functions (se ainda nao instalou):

```bash
cd functions && bun install
```

3. Crie arquivos de ambiente locais a partir dos exemplos:

```bash
cp .env.emulator.example .env.emulator
cp functions/.env.local.example functions/.env.local
cp functions/.secret.local.example functions/.secret.local
```

## Fluxo A: testar local sem producao (2 terminais)

### Terminal 1: subir emuladores

```bash
bun run emulators:start
```

Servicos iniciados:
- Auth Emulator
- Firestore Emulator
- Functions Emulator
- Storage Emulator

Projeto usado neste comando: `demo-rifa-online`.

### Terminal 2: frontend apontando para emuladores

```bash
bun run dev:emulator
```

Esse comando usa `vite --mode emulator` e habilita:
- `VITE_USE_FIREBASE_EMULATORS=true`
- conexao local de Auth/Firestore/Functions/Storage
- analytics desativado no modo emulator

## Fluxo B: rodar teste E2E backend (1 terminal)

```bash
bun run emulators:exec:backend-e2e
```

Esse comando:
1. sobe emuladores temporarios,
2. executa seed local,
3. roda `tests/backend-emulator.e2e.test.mjs`,
4. encerra os emuladores.

Cenarios cobertos:
- reserva de numeros,
- criacao de PIX com mock,
- webhook idempotente,
- gravacao em `payments` e `salesLedger`,
- liberacao da reserva,
- numero vendido na consulta publica.

## Script de seed local do backend

Se quiser apenas popular campanha de teste no emulator:

```bash
bun run seed:emulator:backend
```

Observacao: execute esse comando com emuladores ativos.

## Simular pagamento PIX local (webhook fake)

Quando `USE_MOCK_HORSEPAY=true`, o `createPixDeposit` gera pedido pendente e PIX mock, mas nao confirma pagamento sozinho.
Para simular confirmacao sem pagar de verdade:

1. Gere um PIX no frontend local (fluxo normal).
2. Rode:

```bash
bun run webhook:mock:paid
```

Esse comando:
- busca o pedido mais recente com `type=deposit` e `status=pending` no **Firestore Emulator**;
- envia `POST` para `pixWebhook` local (`127.0.0.1:5001`);
- marca o pedido como pago e executa a baixa de numeros.

Opcional: forcar um pedido especifico:

```bash
bun run webhook:mock:paid -- --externalId=SEU_EXTERNAL_ID
```

Seguranca:
- o script aborta se nao estiver no projeto `demo-rifa-online`;
- o script aborta se os hosts nao forem locais (`127.0.0.1`/`localhost`);
- nao consome HorsePay real e nao toca producao.

## Script de seed de usuarios locais (Auth + Firestore)

Para criar/atualizar contas de login no emulator (sem tocar producao):

```bash
bun run seed:emulator:users
```

Contas criadas:

- admin: CPF `00000000000` / telefone `99999999999`
- user: CPF `11111111111` / telefone `98911111111`
- user: CPF `22222222222` / telefone `98922222222`

Comportamento do script:

- cria/atualiza usuario no **Auth Emulator** (sem email/senha, login por token custom);
- cria/atualiza `cpfRegistry/{cpf}` e `phoneRegistry/{phone}` no **Firestore Emulator**;
- cria/atualiza `users/{uid}` no **Firestore Emulator** com `role` correto;
- e idempotente (rodar de novo so atualiza os mesmos usuarios).

Seguranca:

- o script aborta se o projeto nao for `demo-rifa-online`;
- o script aborta se hosts de emulator nao forem locais (`127.0.0.1`/`localhost`).

## Build e testes de Functions

```bash
bun run functions:build
bun run functions:test
```

O build limpa `functions/lib` antes de compilar para evitar testes stale de compilacoes antigas.

## Como voltar para producao (passo a passo)

### 1) Parar tudo do emulator

- Pare o terminal dos emuladores (`Ctrl + C`).

### 2) Rodar frontend em modo normal (sem emulator)

```bash
bun run dev
```

Nao use `dev:emulator` para producao.

### 3) Validar flags e arquivos locais

Checklist:

1. `VITE_USE_FIREBASE_EMULATORS` deve estar `false` (ou ausente) no ambiente de producao.
2. Nao usar `functions/.env.local` e `functions/.secret.local` em producao.
3. `USE_MOCK_HORSEPAY` nao deve estar definido em producao.
4. `HORSEPAY_WEBHOOK_CALLBACK_URL` so deve ser usado se houver necessidade explicita.

### 4) Garantir secrets reais no Firebase

As Functions em producao usam Secret Manager (`defineSecret`).

Secrets obrigatorios:

- `HORSEPAY_CLIENT_KEY`
- `HORSEPAY_CLIENT_SECRET`
- `HORSEPAY_WEBHOOK_TOKEN`

### 5) Deploy

Deploy completo:

```bash
firebase deploy --project rifa-online-395d9
```

Deploy apenas de rules:

```bash
bun run deploy:rules
```

## Resumo rapido: quantos terminais abrir?

- Teste manual local (app + backend): **2 terminais**.
- E2E automatizado backend: **1 terminal**.
- Nao precisa 3 terminais no fluxo padrao.
