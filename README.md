# Maru API

NestJS + TypeScript backend for Our Daily.

## Prerequisites

- Node.js 20+
- Corepack enabled (`corepack enable`)
- Docker

## Install

```bash
yarn install
```

## Environment

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

| Variable           | Required              | Default       | Description                                                                    |
| ------------------ | --------------------- | ------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`         | No                    | `development` | Runtime environment: `development`, `test`, or `production`                    |
| `PORT`             | No                    | `3001`        | TCP port the HTTP server listens on (1–65535)                                  |
| `DATABASE_URL`     | Yes (non-test)        | —             | PostgreSQL connection URL used in development and production                   |
| `TEST_DATABASE_URL`| Yes (when `NODE_ENV=test`) | —        | PostgreSQL connection URL used during testing; falls back to `DATABASE_URL` if absent |

> **Note:** When `NODE_ENV=test`, `TEST_DATABASE_URL` takes precedence over `DATABASE_URL`. If `TEST_DATABASE_URL` is not set and `NODE_ENV=test`, startup will fail.

## Local PostgreSQL with Docker

```bash
yarn db:up
```

This starts PostgreSQL on `localhost:5432` with:

- dev DB: `maru_dev`
- test DB: `maru_test`

Stop DB:

```bash
yarn db:down
```

## Prisma

Generate Prisma client:

```bash
yarn prisma:generate
```

Create/apply migrations in local development:

```bash
yarn prisma:migrate:dev --name <migration_name>
```

Apply committed migrations (staging/production/test):

```bash
yarn prisma:migrate:deploy
```

## Run the API

```bash
yarn start:dev
```

Swagger: `http://localhost:3001/docs`  
Health: `http://localhost:3001/health`

## API Contract

The checked-in API contract lives in `docs/api-contracts/openapi.json`.

Whenever the API surface changes, refresh the contract before committing:

```bash
yarn api-contract:generate
```

Commit the API implementation change and the updated `docs/api-contracts` files together so `maru-web` can sync the same contract.

## Test

```bash
yarn test
yarn test:e2e
```

## Build

```bash
yarn build
```
