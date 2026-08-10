# M4 — Email Group Invitations

## PR 1 — Invitation Model and Creation

- Add `group_invitations`.
- Generate secure invitation tokens.
- Store a safe token representation/hash.
- Add expiration and accepted-state handling.
- Implement leader-only invitation creation.
- Prevent obviously invalid or redundant invitations.
- Send invitation emails through the existing Resend-backed `EmailService`.
- Add tests for creation and authorization.

## PR 2 — Invitation Validation and Acceptance

- Implement invitation lookup/validation.
- Reject invalid, expired, and already-used invitations.
- Implement invitation acceptance.
- Create `GroupMember` atomically when an invitation is accepted.
- Prevent duplicate membership.
- Mark the invitation as accepted.
- Add integration tests for the complete acceptance flow.
