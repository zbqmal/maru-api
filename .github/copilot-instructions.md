# Copilot Instructions

## Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Resend for transactional email
- AWS S3 for media storage
- OpenAI API for the global daily question
- Redis + BullMQ only when background jobs are introduced
- OpenAPI via @nestjs/swagger (Swagger UI served at /docs)

## Package Manager

- Use **Yarn** only.
- Do not use npm or pnpm commands.

## Testing

- **Unit:** Jest
- **Integration:** Jest + Supertest
- **API E2E:** Jest + Supertest
- Place unit tests in adjacent `__tests__` folders under `src`.
- Keep test typings/config in `tsconfig.spec.json` (Jest + Node types), separate from app `tsconfig.json`.
- Use a real test database for database integration tests when practical.

## Deployment

- Deploy the backend to Railway.
- Use Railway PostgreSQL initially.
- Keep deployment-specific logic out of application code.

## Development Guidelines

- Use TypeScript strictly; avoid `any`.
- Keep the backend as a modular monolith unless there is a clear reason to split services.
- Use Prisma for database access and migrations.
- Validate request DTOs at API boundaries.
- Enforce authentication and authorization on the backend.
- Keep controllers thin; business logic belongs in services.
- Use database transactions for operations that must remain consistent.
- Do not expose AWS credentials or other secrets to clients.
- Do not route uploaded image binaries through the API when direct S3 upload with presigned URLs is appropriate.
- Do not add dependencies unless they are clearly necessary.
- Add or update tests for meaningful behavior changes.
- Always update `docs/api-contracts` whenever API changes require contract updates.

# Backend Implementation PR Guidelines (Not Planning PR)

- Prefer one coherent backend capability per PR.
- A PR may contain schema, service, controller, and tests when they belong to the same capability.
- Do not split tiny implementation details into separate PRs solely to make PRs smaller.
- Do not combine unrelated capabilities simply because they belong to the same milestone.
- Include Prisma migrations in the PR that introduces the corresponding data model.
- Include authorization and validation in the same PR as the protected behavior; do not defer them.
- Include meaningful unit/integration/E2E tests with the behavior they protect.
- Keep the backend as a modular monolith unless a measured need justifies a different deployment boundary.
- Keep external providers behind application-owned abstractions where practical.
- Every merged PR should leave the backend deployable.
