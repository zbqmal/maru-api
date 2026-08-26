-- CreateTable
CREATE TABLE "public"."daily_questions" (
    "id" TEXT NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "question_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_questions_question_date_key" ON "public"."daily_questions"("question_date");

-- AlterTable
ALTER TABLE "public"."answers" ADD COLUMN "daily_question_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "answers_diary_entry_id_daily_question_id_key" ON "public"."answers"("diary_entry_id", "daily_question_id");

-- AddForeignKey
ALTER TABLE "public"."answers" ADD CONSTRAINT "answers_daily_question_id_fkey" FOREIGN KEY ("daily_question_id") REFERENCES "public"."daily_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
