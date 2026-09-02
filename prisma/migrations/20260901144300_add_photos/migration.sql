-- CreateTable
CREATE TABLE "public"."photos" (
    "id" TEXT NOT NULL,
    "diary_entry_id" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_storage_key_key" ON "public"."photos"("storage_key");

-- CreateIndex
CREATE INDEX "photos_diary_entry_id_display_order_idx" ON "public"."photos"("diary_entry_id", "display_order");

-- CreateIndex
CREATE INDEX "photos_uploaded_by_user_id_idx" ON "public"."photos"("uploaded_by_user_id");

-- AddForeignKey
ALTER TABLE "public"."photos" ADD CONSTRAINT "photos_diary_entry_id_fkey" FOREIGN KEY ("diary_entry_id") REFERENCES "public"."diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."photos" ADD CONSTRAINT "photos_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
