# M6 — Daily Diary Core

## PR 1 — Diary Entry and Answer Data Model

- Add `diary_entries`.
- Add `answers`.
- Add `CUSTOM` and `DAILY` question types.
- Add `UNIQUE(group_id, user_id, diary_date)`.
- Model nullable references needed for custom and future global daily questions.
- Add indexes for common group/user/date access patterns.
- Add database and service-level invariant tests.

## PR 2 — Today's Diary Context

- Implement retrieval of today's diary context for a selected group.
- Return the group's active custom questions.
- Return the current user's existing diary entry/answers when present.
- Do not require an empty diary entry to be created merely by viewing the page unless implementation needs justify it.
- Enforce group membership.
- Add integration tests.

## PR 3 — Create and Update Answers

- Implement answer creation.
- Create the user's daily `DiaryEntry` when the first answer requires it.
- Implement answer updates.
- Validate that custom questions belong to the selected group.
- Enforce diary ownership.
- Prevent duplicate answers for the same applicable question.
- Add transactional and authorization tests.

## PR 4 — Group Daily Feed

- Implement retrieval of group members' diary entries for a selected date.
- Return answers grouped by member/entry.
- Support users with no entry and partially completed entries appropriately.
- Avoid N+1 query patterns.
- Add membership/privacy tests.
- Add integration tests for multi-member diary data.

## PR 5 — Question Snapshot on Answer

- Add `questionSnapshot` (`VARCHAR(200)`) column to `answers`.
- Populate the snapshot at answer creation time with the current `GroupQuestion.question` text.
- The snapshot is immutable after creation: answer update operations must not overwrite it.
- When rendering historical diary entries, prefer the snapshot over the live question text so that past records remain accurate even if the question is later edited or deleted.
- Update `GroupQuestionService.deleteQuestion` to use soft-delete (`isActive = false`) instead of a hard delete, so that `Answer.groupQuestionId` foreign keys are preserved for records created before the question was removed.
- Add a Prisma migration.
- Update `AnswerResponseDto` to include `questionSnapshot`.
- Add unit, integration, and invariant tests covering: snapshot is set on create, snapshot is unchanged after answer update, historical answers still resolve their snapshot after the source question is edited.
