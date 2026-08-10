# M5 — Custom Group Questions

This milestone is small enough for one focused PR.

## PR 1 — Group Question Management

- Add `group_questions`.
- Add `(group_id, display_order)` uniqueness.
- Implement question listing.
- Implement leader-only create, update, delete, and reorder operations.
- Enforce a maximum of four active custom questions per group.
- Validate display order and question content.
- Allow normal members to read questions.
- Add unit/integration tests for the four-question limit, ordering, and authorization.
