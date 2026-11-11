-- Attendance edits and decline history (additive; no backfill).
--
-- lastEditedAt: set when a student corrects a PENDING log, which keeps its
-- original submittedAt so the 21-day overdue clock does not restart.
-- AttendanceDecline: one row per supervisor decline with a snapshot of the
-- entry as declined; cascades only with its Attendance row (schema comment).

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "lastEditedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AttendanceDecline" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "declinedById" TEXT,
    "declinedByName" TEXT,
    "declinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "timeInAM" TIMESTAMP(3),
    "timeOutAM" TIMESTAMP(3),
    "timeInPM" TIMESTAMP(3),
    "timeOutPM" TIMESTAMP(3),
    "hours" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "AttendanceDecline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceDecline_attendanceId_idx" ON "AttendanceDecline"("attendanceId");

-- AddForeignKey
ALTER TABLE "AttendanceDecline" ADD CONSTRAINT "AttendanceDecline_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDecline" ADD CONSTRAINT "AttendanceDecline_declinedById_fkey" FOREIGN KEY ("declinedById") REFERENCES "Supervisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

