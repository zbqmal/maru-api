# M2 — Authentication, Account Recovery, and Profile

## PR 1 — User and Session Data Model

- Add `users` and `sessions` models.
- Add required unique constraints and indexes.
- Implement password hashing utilities.
- Implement secure opaque session-token generation.
- Store sessions safely and support expiration/revocation.
- Add initial `UserModule` and `AuthModule`.
- Add unit/integration tests for session and password behavior.

## PR 2 — Register and Login

- Implement registration.
- Validate and normalize email addresses.
- Prevent duplicate accounts.
- Implement email/password login.
- Create authenticated sessions.
- Set the session token using an `HttpOnly` cookie.
- Add authentication guard/current-user resolution.
- Implement `GET /me` or equivalent current-user endpoint.
- Add validation, authentication, and error-path tests.

## PR 3 — Logout and Session Lifecycle

- Implement logout.
- Revoke the active session.
- Clear the authentication cookie.
- Handle expired/revoked sessions consistently.
- Add tests for authenticated, expired, revoked, and logged-out requests.

## PR 4 — Resend Email Infrastructure

- Add an `EmailModule`.
- Integrate Resend behind an application-owned email service abstraction.
- Add email configuration/environment validation.
- Implement a reusable transactional-email sending pattern.
- Keep provider-specific code isolated so the provider can be replaced later.
- Add tests with the external provider mocked.

## PR 5 — Forgot and Reset Password

- Add `password_reset_tokens`.
- Implement forgot-password request flow.
- Generate secure, expiring, single-use reset tokens.
- Send password-reset emails through `EmailService`.
- Implement password reset.
- Invalidate the reset token after successful use.
- Decide and implement whether existing sessions are revoked after password reset.
- Add security and expiration tests.

## PR 6 — Profile API

- Implement profile retrieval.
- Implement name update.
- Implement birthday update.
- Keep `profile_image_key` ready for the later media milestone.
- Enforce authenticated ownership.
- Add DTO validation and tests.

## PR 7 — Session and Token Cleanup

- Add `@nestjs/schedule` for cron job support.
- Schedule a recurring cleanup job (e.g., nightly).
- Delete expired and revoked sessions.
- Delete used and expired password reset tokens.
- Add tests for the cleanup logic.
