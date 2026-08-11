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

- `DATABASE_URL` is used for development/runtime DB access.
- `TEST_DATABASE_URL` is used when `NODE_ENV=test`; if omitted, `DATABASE_URL` is used.

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

## Test

```bash
yarn test
yarn test:e2e
```

## Build

```bash
yarn build
```
