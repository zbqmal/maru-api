-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_leader_key" ON "group_members"("group_id") WHERE "role" = 'LEADER';

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE INDEX "group_members_group_id_role_idx" ON "group_members"("group_id", "role");

-- CreateIndex
CREATE INDEX "group_members_group_id_created_at_idx" ON "group_members"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateFunction
CREATE OR REPLACE FUNCTION "ensure_group_has_exactly_one_leader"()
RETURNS TRIGGER AS $$
DECLARE
    affected_group_id TEXT;
BEGIN
    IF TG_TABLE_NAME = 'groups' THEN
        affected_group_id := COALESCE(NEW."id", OLD."id");
    ELSE
        affected_group_id := COALESCE(NEW."group_id", OLD."group_id");
    END IF;

    IF affected_group_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM "groups" WHERE "id" = affected_group_id)
       AND (
           SELECT COUNT(*)
           FROM "group_members"
           WHERE "group_id" = affected_group_id
             AND "role" = 'LEADER'
       ) <> 1 THEN
        RAISE EXCEPTION 'Group % must have exactly one leader.', affected_group_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE CONSTRAINT TRIGGER "group_members_leader_invariant"
AFTER INSERT OR UPDATE OR DELETE ON "group_members"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "ensure_group_has_exactly_one_leader"();

-- CreateTrigger
CREATE CONSTRAINT TRIGGER "groups_leader_invariant"
AFTER INSERT OR UPDATE ON "groups"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "ensure_group_has_exactly_one_leader"();
