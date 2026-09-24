-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "courseYearLevel" INTEGER;

-- Backfill existing rows: prefer the assigned Block's yearLevel (an
-- authoritative Int); otherwise fall back to parsing the first digit out of
-- the deprecated free-text yearLevel column (e.g. "4th Year" -> 4), matching
-- the app's old parseYearLevel fallback. Rows with neither are left NULL.
UPDATE "Student"
SET "courseYearLevel" = COALESCE(
  (SELECT b."yearLevel" FROM "Block" b WHERE b.id = "Student"."blockId"),
  NULLIF(substring("Student"."yearLevel" from '\d'), '')::INTEGER
);
