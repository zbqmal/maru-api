# M7 — Global OpenAI Daily Question

This milestone can remain one focused PR because only one global question is generated per day.

## PR 1 — Global Daily Question

- Add `daily_questions`.
- Add `UNIQUE(question_date)`.
- Create `DailyQuestionModule`.
- Add an OpenAI service abstraction.
- Define the prompt used to generate an appropriate daily question.
- Implement scheduled generation.
- Make generation idempotent by checking whether today's question already exists.
- Add retry/failure logging.
- Validate generated content before persistence.
- Include the current global question in the daily diary context.
- Allow `DAILY` answers to reference it.
- Add tests with OpenAI mocked.
- Add concurrency/idempotency tests around daily generation.
