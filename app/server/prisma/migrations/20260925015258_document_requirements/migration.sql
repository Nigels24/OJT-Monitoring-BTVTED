-- CreateEnum
CREATE TYPE "DocumentStage" AS ENUM ('APPLICATION', 'ACCEPTANCE', 'COMPLETION');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "requirementId" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT;

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "DocumentStage" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "perAssignment" BOOLEAN NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequirement_code_key" ON "DocumentRequirement"("code");

-- CreateIndex
CREATE INDEX "Document_studentId_requirementId_idx" ON "Document"("studentId", "requirementId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DocumentRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The six required documents of thesis Table 3.
--
-- Seeded here as well as in prisma/seed.ts so a freshly migrated database is
-- immediately usable (uploads require a requirement to point at) without also
-- running the seed. ON CONFLICT on the unique `code` makes it a no-op on a
-- database that already has them, and the ids are fixed literals rather than
-- generated so this statement and the seed converge on the same rows.
--
-- perAssignment: an application letter and resume are the student's own, written
-- before they are placed; an endorsement letter, MOA, waiver and portfolio
-- belong to one placement, so a transferred student needs new ones.
INSERT INTO "DocumentRequirement" ("id", "code", "name", "stage", "sortOrder", "isActive", "perAssignment") VALUES
  ('docreq_appletter', 'APPLETTER',  'Application Letter',         'APPLICATION', 1, true, false),
  ('docreq_resume',    'RESUME',     'Resume',                     'APPLICATION', 2, true, false),
  ('docreq_endorse',   'ENDORSE',    'Endorsement Letter',         'ACCEPTANCE',  1, true, true),
  ('docreq_moa',       'MOA',        'Memorandum of Agreement',    'ACCEPTANCE',  2, true, true),
  ('docreq_waiver',    'WAIVER',     'Waiver',                     'ACCEPTANCE',  3, true, true),
  ('docreq_portfolio', 'PORTFOLIO',  'OJT Portfolio Report',       'COMPLETION',  1, true, true)
ON CONFLICT ("code") DO NOTHING;

-- Backfill: point existing documents at a requirement where the free text the
-- student typed maps unambiguously to a code.
--
-- Deliberately conservative — only clear matches, checked against the whole
-- title, and only rows that are still unmapped. Anything else keeps
-- `requirementId` NULL and shows up under "Other uploads" in both UIs rather
-- than being silently filed as something it may not be. `name` is left exactly
-- as the student typed it for these legacy rows: renaming them to the
-- convention would be a lie about what was uploaded, and the file behind the
-- row was never stored under that name.
UPDATE "Document" SET "requirementId" = 'docreq_appletter'
  WHERE "requirementId" IS NULL AND ("name" ILIKE '%application letter%' OR "name" ILIKE '%app letter%' OR "name" ILIKE '%letter of application%');

UPDATE "Document" SET "requirementId" = 'docreq_resume'
  WHERE "requirementId" IS NULL AND ("name" ILIKE '%resume%' OR "name" ILIKE '%curriculum vitae%' OR "name" ~* '(^|[^a-z])cv([^a-z]|$)');

UPDATE "Document" SET "requirementId" = 'docreq_endorse'
  WHERE "requirementId" IS NULL AND ("name" ILIKE '%endorse%' OR "name" ILIKE '%endorsement%');

UPDATE "Document" SET "requirementId" = 'docreq_moa'
  WHERE "requirementId" IS NULL AND ("name" ILIKE '%moa%' OR "name" ILIKE '%memorandum of agreement%');

UPDATE "Document" SET "requirementId" = 'docreq_waiver'
  WHERE "requirementId" IS NULL AND "name" ILIKE '%waiver%';

UPDATE "Document" SET "requirementId" = 'docreq_portfolio'
  WHERE "requirementId" IS NULL AND ("name" ILIKE '%portfolio%' OR "name" ILIKE '%ojt report%');
