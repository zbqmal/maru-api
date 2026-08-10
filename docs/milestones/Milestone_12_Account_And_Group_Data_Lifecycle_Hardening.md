# M12 — Account and Group Data Lifecycle Hardening

## PR 1 — Group Deletion Hardening

- Revisit group deletion now that all major dependent entities exist.
- Delete memberships.
- Delete invitations.
- Delete custom questions.
- Delete diary entries and answers.
- Delete comments and reactions.
- Collect and clean up related S3 media.
- Use database transactions for relational cleanup.
- Handle external S3 cleanup safely after/around transaction boundaries.
- Add comprehensive integration tests.

## PR 2 — Account Deletion and Leadership Cleanup

- Implement complete account deletion.
- Remove the user's diary entries and answers.
- Remove the user's comments and reactions.
- Remove memberships.
- Revoke/delete sessions.
- Delete user-owned media.
- For each led group:
  - transfer leadership when other members remain;
  - delete the group when no other members remain.
- Delete the user record only after required relational decisions are made.
- Add tests for users belonging to multiple groups with different roles.

## PR 3 — Cleanup Reliability

- Make external media cleanup retryable.
- Handle partial S3 deletion failures without corrupting relational state.
- Add cleanup logging/observability.
- Add failure-path tests for destructive workflows.
