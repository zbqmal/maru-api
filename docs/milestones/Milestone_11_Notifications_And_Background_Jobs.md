# M11 — Notifications and Background Jobs

## PR 1 — Redis and BullMQ Foundation

- Add Redis configuration.
- Add BullMQ integration.
- Establish queue/worker conventions.
- Add retry and failure-handling defaults.
- Ensure jobs can be processed idempotently.
- Add queue integration tests where practical.

## PR 2 — In-App Notifications

- Add `notifications`.
- Implement notification creation.
- Implement user notification listing.
- Implement read/unread state.
- Add indexes for user/read-state access.
- Add privacy and ownership tests.

## PR 3 — Activity Notification Jobs

- Publish notification jobs from relevant diary/comment/reaction workflows.
- Process jobs asynchronously.
- Prevent duplicate notifications where applicable.
- Keep synchronous API requests independent of notification delivery success.
- Add worker tests.

## PR 4 — Email and Reminder Jobs

- Move suitable transactional email work to background jobs where useful.
- Add diary reminder job support if enabled by product requirements.
- Add all-members-completed notification support if enabled.
- Reuse the existing Resend-backed `EmailService`.
- Add retry/idempotency tests.
