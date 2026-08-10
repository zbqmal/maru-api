# M9 — Calendar and Monthly Streaks

## PR 1 — Monthly Calendar Activity API

- Implement a single efficient monthly activity query.
- Return dates on which the current user recorded.
- Return dates on which all relevant group members recorded.
- Avoid per-day/N+1 queries.
- Add indexes or query adjustments based on query plans where appropriate.
- Add multi-member integration tests.

## PR 2 — Historical Date Feed and Monthly Streak

- Support diary-feed retrieval for an arbitrary selected date.
- Calculate the required monthly streak value.
- Define date/timezone boundaries consistently.
- Add edge-case tests for month boundaries and missing days.
