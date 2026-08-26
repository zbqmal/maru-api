-- AlterTable
ALTER TABLE "public"."answers"
ADD COLUMN "question_snapshot" VARCHAR(200);

-- Backfill snapshots for existing answers
UPDATE "public"."answers" AS "a"
SET "question_snapshot" = "gq"."question"
FROM "public"."group_questions" AS "gq"
WHERE "a"."group_question_id" = "gq"."id";

UPDATE "public"."answers"
SET "question_snapshot" = ''
WHERE "question_snapshot" IS NULL;

ALTER TABLE "public"."answers"
ALTER COLUMN "question_snapshot" SET NOT NULL;

-- Ensure deleting a group question keeps answers and nullifies relation
ALTER TABLE "public"."answers"
DROP CONSTRAINT IF EXISTS "answers_group_question_id_fkey";

ALTER TABLE "public"."answers"
ADD CONSTRAINT "answers_group_question_id_fkey"
FOREIGN KEY ("group_question_id")
REFERENCES "public"."group_questions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
