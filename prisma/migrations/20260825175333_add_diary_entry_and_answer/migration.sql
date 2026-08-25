-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('CUSTOM', 'DAILY');

-- CreateTable
CREATE TABLE "public"."diary_entries" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "diary_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."answers" (
    "id" TEXT NOT NULL,
    "diary_entry_id" TEXT NOT NULL,
    "question_type" "public"."QuestionType" NOT NULL,
    "group_question_id" TEXT,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diary_entries_group_id_diary_date_idx" ON "public"."diary_entries"("group_id", "diary_date");

-- CreateIndex
CREATE INDEX "diary_entries_user_id_diary_date_idx" ON "public"."diary_entries"("user_id", "diary_date");

-- CreateIndex
CREATE UNIQUE INDEX "diary_entries_group_id_user_id_diary_date_key" ON "public"."diary_entries"("group_id", "user_id", "diary_date");

-- CreateIndex
CREATE INDEX "answers_diary_entry_id_idx" ON "public"."answers"("diary_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_diary_entry_id_group_question_id_key" ON "public"."answers"("diary_entry_id", "group_question_id");

-- AddForeignKey
ALTER TABLE "public"."diary_entries" ADD CONSTRAINT "diary_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."diary_entries" ADD CONSTRAINT "diary_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."answers" ADD CONSTRAINT "answers_diary_entry_id_fkey" FOREIGN KEY ("diary_entry_id") REFERENCES "public"."diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."answers" ADD CONSTRAINT "answers_group_question_id_fkey" FOREIGN KEY ("group_question_id") REFERENCES "public"."group_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
