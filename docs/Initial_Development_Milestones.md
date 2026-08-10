# Our Daily — Development Milestones

## 1. Purpose

This document defines the shared frontend and backend implementation roadmap for **Our Daily**, a private group diary platform where family members and friends can stay connected by answering a small set of daily questions, sharing photos, and interacting with each other's entries.

This file is intended to live in both the frontend and backend repositories so that both codebases follow the same product milestones and implementation order.

---

## 2. Product Principles

- Build features as **vertical slices** across frontend and backend whenever possible.
- Keep the initial backend as a **modular monolith** rather than introducing microservices too early.
- Prefer a simple implementation first, while keeping clear boundaries for future scaling.
- Authorization must always be enforced on the backend, even when the frontend hides unavailable actions.
- Group data is private and accessible only to valid group members.
- Destructive operations such as account deletion and group deletion must be explicit and carefully handled.
- The application should remain deployable and usable after every milestone.

---

## 3. Initial Technical Direction

### Frontend

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui or equivalent reusable component primitives
- TanStack Query for server state
- Minimal client-side global state only where necessary

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Modular monolith architecture
- AWS SES for transactional email
- AWS S3 for uploaded media
- OpenAI API for the global daily question

### Authentication

Initial authentication should use:

- Email + password
- Database-backed sessions
- Opaque session token stored in an `HttpOnly`, `Secure` cookie
- Session revocation through the backend
- Password reset through email

Google and Apple authentication are intentionally deferred to a later milestone.

---

# Milestones

## M1 — Project Foundation

### Goal

Establish the shared project structure and development foundation for both repositories.

### Frontend

- Initialize Next.js + TypeScript application.
- Configure linting, formatting, and environment variables.
- Establish routing conventions.
- Create shared application layout.
- Create base design system:
  - typography
  - spacing
  - buttons
  - inputs
  - cards
  - dialogs
  - form validation patterns
- Add global error and loading states.
- Establish API client utilities.
- Configure TanStack Query.
- Add basic unit/component test setup.

### Backend

- Initialize NestJS application.
- Configure TypeScript, linting, formatting, and environment validation.
- Configure PostgreSQL.
- Add Prisma and initial migration workflow.
- Establish module conventions.
- Add global request validation.
- Add global error handling.
- Add structured logging.
- Add health-check endpoint.
- Establish test conventions for unit and integration tests.

### Shared

- Define development, staging, and production environments.
- Establish GitHub Actions CI.
- Ensure both repositories can build and test successfully.
- Document shared API/environment conventions.

### Completion Criteria

- Frontend and backend run locally.
- CI passes for both repositories.
- Frontend can successfully call a backend health endpoint.

---

## M2 — Authentication, Account Recovery, and Profile

### Goal

Allow users to create an account, authenticate securely, recover their password, and manage basic profile information.

### Backend

Implement the initial user and session model.

Suggested core entities:

- `users`
- `sessions`
- `password_reset_tokens`

User information should support:

- email
- password hash
- name
- birthday
- profile image key
- created/updated timestamps

Authentication flows:

- Register
- Login
- Logout
- Get current authenticated user
- Revoke session
- Forgot password
- Reset password

Session behavior:

- Generate an opaque session token.
- Store only a safe representation/hash server-side where appropriate.
- Set session token through an `HttpOnly` cookie.
- Support session expiration.
- Invalidate sessions when required.

Email infrastructure:

- Create `EmailModule`.
- Integrate AWS SES.
- Implement password reset email.
- Keep email abstraction reusable for group invitations later.

Profile:

- Get profile.
- Update name.
- Update birthday.
- Update profile image reference when media support becomes available.

### Frontend

Create:

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/home`
- `/profile`

Implement:

- Login form
- Registration form
- Forgot-password flow
- Reset-password flow
- Authenticated route handling
- Logout
- Profile view/update form
- Basic authenticated application shell
- Profile menu

The Home page is only a **draft/shell** during this milestone.

Suggested empty state:

> You are not part of a group yet.

Actions can be placeholders for upcoming group creation and invitations.

### Deferred

- Google login
- Apple login
- MFA
- Multiple device/session management UI

### Completion Criteria

A user can:

1. Register.
2. Log in.
3. Stay authenticated through the secure session cookie.
4. View the authenticated Home page.
5. View and update their profile.
6. Log out.
7. Request and complete a password reset.

---

## M3 — Groups, Membership, and Leadership

### Goal

Allow users to create private groups and manage membership and leadership rules.

### Backend

Suggested entities:

- `groups`
- `group_members`

Group member roles:

- `LEADER`
- `MEMBER`

Implement:

- Create group.
- Read group.
- Update group.
- List groups for current user.
- Get selected group members.
- Leave group.
- Transfer leadership.
- Delete group.

Authorization rules:

- Only group members may access group data.
- Only the leader may perform leader-only operations.
- Group authorization must be enforced in NestJS guards/services.

Leadership behavior:

If a leader leaves or deletes their account and other members remain:

1. Leadership must be transferred.
2. Default fallback: transfer leadership to the longest-standing remaining member.

The UI may later allow the leader to explicitly choose a successor before leaving.

If the leader is the only remaining member:

- Leaving the group should delete the group.
- Deleting the account should delete the group.

### Frontend

Implement:

- Create Group flow.
- Group selector.
- Selected group header.
- Group member sidebar.
- Leader indicator.
- Group settings.
- Leave Group flow.
- Leadership transfer UI where appropriate.
- Group deletion confirmation UI.

For destructive group deletion, require strong confirmation such as entering the group name.

### Completion Criteria

Users can:

- Create multiple groups.
- Switch between groups.
- View group members.
- Identify the leader.
- Leave a group.
- Transfer leadership.
- Delete a group if they are the leader.

---

## M4 — Email Group Invitations

### Goal

Allow leaders to invite new members through email.

### Backend

Suggested entity:

- `group_invitations`

Suggested fields:

- id
- group_id
- invited_email
- token_hash
- invited_by_user_id
- expires_at
- accepted_at
- created_at

Implement:

- Create invitation.
- Validate invitation.
- Accept invitation.
- Reject expired or already-used invitations.
- Prevent invalid membership creation.
- Send invitation email through existing Email Service.

Example flow:

```text
Leader
  ↓
Enter email
  ↓
Create invitation
  ↓
Send email
  ↓
Recipient opens invitation link
  ↓
Login/Register if needed
  ↓
Accept invitation
  ↓
GroupMember created
```

### Frontend

Implement:

- Invite Member dialog.
- Invitation sent state.
- Invitation landing page.
- Login/Register redirect preservation.
- Invitation acceptance flow.
- Useful expired/invalid invitation states.

### Deferred

- QR-code invitations
- Public invite links
- SMS invitations

### Completion Criteria

A leader can invite another user by email and the recipient can join the group through the invitation link.

---

## M5 — Custom Group Questions

### Goal

Allow each group leader to configure up to four custom daily questions.

### Backend

Suggested entity:

- `group_questions`

Suggested fields:

- id
- group_id
- question
- display_order
- is_active
- created_by_user_id
- created_at
- updated_at

Rules:

- Maximum of **4 active custom questions per group**.
- Only the leader may create, update, reorder, or delete questions.
- `display_order` must be unique within a group.
- Members may read the questions but may not modify them.

Implement:

- List group questions.
- Create question.
- Update question.
- Delete question.
- Reorder questions.

### Frontend

Build the **Question Settings** page.

Include:

- Current question count.
- Maximum limit indicator.
- Add question.
- Edit question.
- Delete question.
- Reorder questions.
- Leader-only controls.
- Read-only state for normal members if the route is accessible to them.

### Completion Criteria

The group leader can maintain 0–4 custom questions and all members see the current ordered set.

---

## M6 — Daily Diary Core

### Goal

Implement the core product loop: answering daily questions and seeing group members' daily records.

### Backend

Suggested entities:

- `diary_entries`
- `answers`

A `DiaryEntry` represents one user's diary for one group on one day.

Recommended uniqueness rule:

```text
UNIQUE(group_id, user_id, diary_date)
```

Suggested `diary_entries` fields:

- id
- group_id
- user_id
- diary_date
- created_at
- updated_at

Suggested `answers` fields:

- id
- diary_entry_id
- question_type
- group_question_id nullable
- daily_question_id nullable
- content
- created_at
- updated_at

Initial `question_type` values:

- `CUSTOM`
- `DAILY`

Implement:

- Get today's diary context.
- Get current user's answers.
- Create/update an answer.
- Get group members' entries for the selected date.
- Enforce group membership.
- Enforce diary ownership for answer modification.

### Frontend

Build the main **Today's Diary** page.

Question interaction:

- Questions appear collapsed by default.
- Clicking a question expands an answer input.
- No emoji button inside the answer input.
- No placeholder text in the answer input.
- `Answer` button saves the answer.
- Completed questions collapse again.
- Completed questions show a checkmark.
- Existing answers can be reopened and edited.

Feed:

- Show group members' entries for the current day.
- Show their answers grouped into a diary card.
- Empty and partially completed states should be supported.

### Product Behavior

The daily diary should eventually contain:

```text
4 Group Custom Questions
+
1 Global Daily Question
```

The fifth global question is introduced in the next milestone.

### Completion Criteria

Users can answer custom questions for today and view other members' submitted daily entries.

This milestone represents the first complete version of the **core diary loop**.

---

## M7 — Global OpenAI Daily Question

### Goal

Generate one global question each day and show the same question to every user.

### Product Rule

There is only **one AI-generated global question per calendar day**.

It is not generated per group or per user.

### Backend

Suggested entity:

- `daily_questions`

Suggested fields:

- id
- question
- question_date
- created_at

Constraint:

```text
UNIQUE(question_date)
```

Implement a scheduled job in NestJS.

Recommended resilient behavior:

```text
Scheduler runs periodically
        ↓
Does today's question already exist?
        ↓
Yes → Do nothing
No  → Call OpenAI
        ↓
Store question
```

Although the scheduler may run more than once, OpenAI should normally be called only once per day because the database existence check prevents duplicate generation.

Add:

- OpenAI service abstraction.
- Prompt configuration.
- Validation of generated content.
- Logging.
- Retry/failure handling.
- Database uniqueness protection.

### Frontend

Add the fifth question to Today's Diary.

UI requirements:

- Label it **"오늘의 질문"**.
- Visually distinguish it from the four customizable questions.
- Do not expose an `AI question` chip.
- Do not show an explanatory `?` icon.
- Treat it as unanswered until the user submits an answer.
- Use the same expand → answer → save → collapse interaction.

### Completion Criteria

Every user receives the same generated question for the day and can answer it inside each of their group diaries.

---

## M8 — Photo Upload and Media

### Goal

Allow diary entries and profiles to contain uploaded images without routing large image binaries through the NestJS API.

### Architecture

The NestJS API participates in authorization and signed URL generation, but the actual image binary uploads directly from the browser to S3.

```text
Frontend
   │
   │ Request upload authorization
   ▼
NestJS
   │
   │ Generate short-lived presigned URL
   ▼
Frontend
   │
   │ Upload image binary
   ▼
S3
```

Never expose permanent AWS credentials to the frontend.

### Backend

Suggested entity:

- `photos`

Suggested fields:

- id
- diary_entry_id
- uploaded_by_user_id
- storage_key
- mime_type
- width
- height
- size_bytes
- display_order
- created_at

Implement:

- Request presigned upload URL.
- Validate:
  - authentication
  - group membership
  - diary ownership
  - MIME type
  - file-size constraints
- Confirm/register uploaded media metadata.
- Delete media records.
- Delete S3 objects when required.

Profile and group images should reuse the same media infrastructure where practical.

### Frontend

Implement:

- Image picker.
- Client-side preview.
- Upload progress.
- Direct S3 upload using presigned URL.
- Failure/retry state.
- Image removal.
- Diary photo gallery.
- Profile image upload.

### Completion Criteria

Users can attach photos to diary entries and change their profile image through the S3 upload flow.

---

## M9 — Calendar and Monthly Streaks

### Goal

Allow users to browse historical diary activity through a monthly calendar.

### Backend

Implement monthly activity queries.

Calendar states should support:

- current user's recorded day
- day with no record
- day where every current group member recorded

Implement:

- Get monthly diary activity.
- Get diary entries for a selected date.
- Calculate current streak within the relevant monthly experience.
- Determine all-members-completed days.

Avoid expensive per-day N+1 queries.

Add appropriate indexes on:

- `group_id`
- `user_id`
- `diary_date`

### Frontend

Build the **Calendar** page.

Requirements:

- Monthly view.
- Previous month navigation.
- Next month navigation.
- Selected date state.
- Checkmark for days the current user recorded.
- Fire indicator for days where all group members recorded.
- Legend explaining all calendar symbols.
- Clicking a date displays that day's group records below the calendar.
- Show the selected date clearly.
- Show current monthly streak information.

### Completion Criteria

Users can navigate months, inspect completion history, and open diary records for a selected date.

---

## M10 — Comments and Reactions

### Goal

Add lightweight social interaction around diary entries.

### Backend

Suggested entities:

- `comments`
- `reactions`

Implement:

- Create comment.
- Edit own comment.
- Delete own comment.
- List comments.
- Add reaction.
- Remove reaction.
- Prevent invalid or duplicate reactions as required.
- Enforce group privacy.

Recommended reaction uniqueness:

```text
UNIQUE(diary_entry_id, user_id, type)
```

### Frontend

Implement:

- Comment count.
- Comment list.
- Add comment.
- Edit/delete own comment.
- Like/reaction button.
- Reaction count.
- Optimistic UI where safe.

### Completion Criteria

Group members can react to and discuss each other's diary entries.

---

## M11 — Notifications and Background Jobs

### Goal

Notify users about meaningful activity without slowing synchronous API requests.

### Backend

Introduce background processing when justified.

Potential jobs:

- email notifications
- in-app notifications
- diary reminders
- invitation emails
- media cleanup
- all-members-completed notifications

Possible initial implementation:

- BullMQ
- Redis

Suggested pattern:

```text
HTTP Request
    ↓
Persist business data
    ↓
Return response
    ↓
Background job handles notification work
```

Suggested entity:

- `notifications`

Implement:

- Notification creation.
- Read/unread status.
- User notification list.
- Notification worker(s).
- Idempotent job handling.

### Frontend

Implement:

- Notification icon.
- Notification list/panel.
- Read/unread state.
- Navigation from notifications to the relevant group/entry.

### Completion Criteria

Important diary activity can generate asynchronous notifications without blocking normal API responses.

---

## M12 — Account and Group Data Lifecycle Hardening

### Goal

Implement reliable destructive-data workflows across all features that now exist.

This milestone should revisit deletion behavior after diary, media, comments, and reactions exist.

### Account Deletion Rules

When a user deletes their account:

- Delete their answers.
- Delete their diary entries.
- Delete their comments.
- Delete their reactions.
- Remove their memberships.
- Delete their sessions.
- Delete associated user-owned media from S3.
- Delete the user record.

For every group in which the user is leader:

- If other members remain, transfer leadership.
- If no other members remain, delete the entire group.

### Group Deletion Rules

Only the group leader may delete a group.

Deleting a group removes:

- group
- memberships
- invitations
- custom questions
- diary entries
- answers
- comments
- reactions
- related media

S3 deletion must be explicitly handled; database cascades alone are not sufficient.

### Implementation Guidance

Use database transactions for relational consistency where practical.

Do not rely solely on `ON DELETE CASCADE` for the entire workflow because external resources such as S3 objects require application-level cleanup.

Potential pattern:

```text
Validate destructive action
        ↓
Collect external resource keys
        ↓
Transactional database cleanup
        ↓
Commit
        ↓
Asynchronously delete S3 objects
```

### Frontend

Add strong confirmation UX for:

- Delete Account
- Delete Group
- Leave Group when leader
- Leadership transfer

Clearly communicate irreversible data loss.

### Completion Criteria

All account/group deletion scenarios behave deterministically and leave no unintended relational or media data behind.

---

## M13 — Social Authentication

### Goal

Add convenient third-party authentication after the email/password system is stable.

### Backend

Add provider account support for:

- Google
- Apple

Suggested entity:

- `auth_accounts`

Support:

- provider identity linking
- existing-email conflict handling
- account linking policy
- users with no password hash when created through OAuth

### Frontend

Add:

- Continue with Google
- Continue with Apple
- Account-linking feedback and errors

### Completion Criteria

Users can authenticate through supported social providers without breaking existing email/password accounts.

---

## M14 — Production Hardening and Scale

### Goal

Prepare the system for high traffic and production reliability.

### Backend / Infrastructure

Evaluate and add based on measured need:

- Redis caching
- rate limiting
- API pagination
- database query optimization
- database indexes
- connection pooling
- read replicas
- job retry/dead-letter handling
- CDN
- image optimization pipeline
- backups and restore testing
- OpenTelemetry
- Sentry or equivalent error monitoring
- centralized structured logs
- load testing
- security review
- dependency scanning

### Frontend

- Performance profiling.
- Bundle analysis.
- Dynamic loading where useful.
- Image optimization.
- Query cache tuning.
- Error telemetry.
- Accessibility review.
- Responsive/mobile UX polish.
- Browser compatibility testing.

### Architecture Principle

Do not introduce microservices solely because the application has many users.

Start with:

```text
Next.js
   │
NestJS Modular Monolith
   ├── PostgreSQL
   ├── Redis
   ├── S3
   └── Background Workers
```

Split services only when clear operational or scaling boundaries emerge.

### Completion Criteria

The application has measurable performance targets, observability, recovery procedures, and documented scaling bottlenecks.

---

# Suggested Backend Module Boundaries

The initial NestJS modular monolith can roughly follow:

```text
AuthModule
UserModule
ProfileModule
EmailModule
GroupModule
GroupMemberModule
InvitationModule
QuestionModule
DiaryModule
AnswerModule
MediaModule
CommentModule
ReactionModule
DailyQuestionModule
NotificationModule
```

These are module boundaries, not separate deployable microservices.

---

# Suggested Core Data Model

```text
User
 ├── Session
 ├── AuthAccount
 ├── GroupMember
 ├── DiaryEntry
 ├── Comment
 └── Reaction

Group
 ├── GroupMember
 ├── GroupInvitation
 ├── GroupQuestion × 0..4
 └── DiaryEntry

DiaryEntry
 ├── Answer
 ├── Photo
 ├── Comment
 └── Reaction

Answer
 ├── GroupQuestion (CUSTOM)
 └── DailyQuestion (DAILY)

DailyQuestion
 └── One global question per date
```

---

# Recommended Core Database Constraints

At minimum, consider:

```text
users.email
  UNIQUE

group_members(group_id, user_id)
  UNIQUE

group_questions(group_id, display_order)
  UNIQUE

diary_entries(group_id, user_id, diary_date)
  UNIQUE

daily_questions(question_date)
  UNIQUE

reactions(diary_entry_id, user_id, type)
  UNIQUE
```

Application-level rules should additionally enforce:

- Maximum 4 active custom questions per group.
- Exactly one active leader per group.
- Only leaders may modify group questions.
- Only group members may read private group data.
- Users may modify only data they own unless an explicit leader/admin rule says otherwise.

---

# MVP Definition

The earliest meaningful MVP is complete after approximately **M6**:

```text
Register / Login
       ↓
Create Group
       ↓
Invite Members
       ↓
Configure 4 Questions
       ↓
Answer Daily Questions
       ↓
View Group Members' Daily Entries
```

M7 adds the global AI-generated question and completes the intended five-question daily experience.

Photos, calendar/streaks, comments, reactions, and notifications enhance the product but should not block testing the core diary loop with real users.

---

# Development Strategy

For each milestone, prefer a vertical implementation order.

Example for Daily Diary:

```text
Database schema
    ↓
GET daily context
    ↓
Frontend question rendering
    ↓
POST/PUT answer
    ↓
Frontend answer interaction
    ↓
GET group daily feed
    ↓
Frontend feed
    ↓
Tests
```

Avoid implementing a large collection of backend endpoints first and postponing frontend integration until much later.

Every milestone should leave both repositories in a deployable state.

---

# Testing Expectations

Each milestone should include appropriate tests.

### Frontend

- Component tests for important interactions.
- Form validation tests.
- Route/auth behavior tests.
- End-to-end tests for critical user journeys.

### Backend

- Unit tests for business rules.
- Integration tests for database-backed flows.
- Authorization tests.
- Validation/error-path tests.
- Deletion lifecycle tests for destructive operations.

Critical flows should eventually have end-to-end coverage across both applications.

---

# Key Product Rules Summary

- A user may belong to multiple groups.
- Each group has one leader.
- A leader may invite members.
- A group may have up to four customizable questions.
- OpenAI creates one global daily question shared by all users.
- Each user may have one diary entry per group per day.
- Photos upload directly from the browser to S3 using backend-issued presigned URLs.
- Calendar activity is shown monthly.
- A fire indicator represents a day when every group member recorded.
- Leader deletion transfers ownership when members remain.
- If the final member/leader leaves or deletes their account, the group is deleted.
- Group deletion removes all associated group data.
- Account deletion removes all data owned by that user and cleans up leadership responsibilities.
