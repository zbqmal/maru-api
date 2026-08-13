-- Backfill null names before enforcing NOT NULL
UPDATE "users"
SET "name" = split_part("email", '@', 1)
WHERE "name" IS NULL;

-- Make user name required
ALTER TABLE "users"
ALTER COLUMN "name" SET NOT NULL;
