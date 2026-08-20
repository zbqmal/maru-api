-- CreateTable
CREATE TABLE "public"."group_invitations" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "invited_email" VARCHAR(320) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_invitations_token_hash_key" ON "public"."group_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "group_invitations_group_id_idx" ON "public"."group_invitations"("group_id");

-- CreateIndex
CREATE INDEX "group_invitations_group_id_invited_email_idx" ON "public"."group_invitations"("group_id", "invited_email");

-- CreateIndex
CREATE INDEX "group_invitations_expires_at_idx" ON "public"."group_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "public"."group_invitations" ADD CONSTRAINT "group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
