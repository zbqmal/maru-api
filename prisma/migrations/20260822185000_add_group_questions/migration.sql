-- CreateTable
CREATE TABLE "group_questions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_questions_group_id_display_order_key" ON "group_questions"("group_id", "display_order");

-- CreateIndex
CREATE INDEX "group_questions_group_id_is_active_idx" ON "group_questions"("group_id", "is_active");

-- AddForeignKey
ALTER TABLE "group_questions" ADD CONSTRAINT "group_questions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_questions" ADD CONSTRAINT "group_questions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
