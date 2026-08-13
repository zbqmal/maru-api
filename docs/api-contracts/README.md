# API Contracts

`docs/api-contracts/openapi.json` is the checked-in API contract shared with `maru-web`.

## Refresh

Whenever the API surface changes, regenerate the contract from the current NestJS Swagger document:

```bash
yarn api-contract:generate
```

## Workflow

1. Update the API code.
2. Run `yarn api-contract:generate`.
3. Review the `docs/api-contracts` diff.
4. Commit the API change and the contract update together.
