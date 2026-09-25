-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ATTENDANCE_APPROVED', 'ATTENDANCE_DECLINED', 'ATTENDANCE_OVERDUE', 'JOURNAL_RETURNED', 'JOURNAL_ACCEPTED', 'DOCUMENT_REVIEWED', 'ASSESSMENT_COMPLETED', 'CONCERN_RAISED', 'PLACEMENT_RECORDED');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: every row that already existed before this migration gets its
-- real original submission time (createdAt), not "now" (the column's
-- DEFAULT, which only applies to rows inserted after this point). Without
-- this, every pre-existing PENDING row would look freshly submitted the
-- moment this migration runs and the 21-day overdue clock would restart from
-- zero for all of them.
UPDATE "Attendance" SET "submittedAt" = "createdAt";

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
