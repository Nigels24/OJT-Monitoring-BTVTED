-- Student profile cleanup: full middle name, structured address, and no stored
-- age or school.
--
-- Hand-ordered so no existing data is lost. `prisma migrate diff` produces the
-- same end state (the same columns added and dropped) but would simply drop
-- "address" and "middleInitial"; here they are carried over first:
--   * "middleInitial" is copied into the new "middleName" before it is dropped;
--   * "address" is RENAMED to "legacyAddress", so every old free-text address
--     is kept and still shown (read-only) until a structured one is entered.
-- "age" and "school" are dropped without a copy on purpose: age is derived
-- from "dateOfBirth" at read time, and school is the one fixed school name.

-- 1. New columns.
ALTER TABLE "Student" ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "cityMunicipality" TEXT,
ADD COLUMN     "barangay" TEXT,
ADD COLUMN     "streetAddress" TEXT,
ADD COLUMN     "postalCode" TEXT;

-- 2. Backfill: the old initial becomes the middle name as-is.
UPDATE "Student" SET "middleName" = "middleInitial" WHERE "middleInitial" IS NOT NULL;

-- 3. Keep the old free-text address under its new, read-only name.
ALTER TABLE "Student" RENAME COLUMN "address" TO "legacyAddress";

-- 4. Only now drop what has been carried over or is derived.
ALTER TABLE "Student" DROP COLUMN "middleInitial",
DROP COLUMN "age",
DROP COLUMN "school";
