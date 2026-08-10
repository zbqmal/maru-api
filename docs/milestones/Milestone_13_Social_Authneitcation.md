# M13 — Social Authentication

## PR 1 — Provider Account Foundation and Google Login

- Add `auth_accounts`.
- Support users whose account does not require a local password.
- Implement Google authentication.
- Define safe account-linking behavior for existing email addresses.
- Reuse the existing application session model after provider authentication.
- Add authentication/linking tests.

## PR 2 — Apple Login

- Add Apple authentication.
- Reuse provider-account and session abstractions.
- Handle Apple-specific identity/email edge cases.
- Add authentication/linking tests.
