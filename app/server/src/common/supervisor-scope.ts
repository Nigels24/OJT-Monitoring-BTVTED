import { Prisma } from '../../generated/prisma/client';

/**
 * Whether an Attendance row is visible to a supervisor at `establishmentId`.
 *
 * The rule is TrainingAssignment-first, not `Student.establishmentId`-first:
 * `CoordinatorService.createPlacement` overwrites that deprecated field the
 * moment a student transfers, so scoping by it alone would make a
 * still-PENDING row at the OLD establishment invisible to the supervisor who
 * has to approve it — those hours could then never be confirmed. Only a
 * legacy row with no assignment at all (`trainingAssignmentId` null, written
 * before Step 1) falls back to the student's current establishment, since it
 * has nothing else to be scoped by.
 *
 * One helper, reused by every supervisor-side attendance query, so this rule
 * is never copy-pasted into a second `where` clause that can drift from it.
 */
export function attendanceEstablishmentWhere(
  establishmentId: string,
): Prisma.AttendanceWhereInput {
  return {
    OR: [
      { trainingAssignmentId: null, student: { establishmentId } },
      { trainingAssignment: { establishmentId } },
    ],
  };
}

/**
 * The same rule evaluated in memory against an already-fetched row, for a
 * single-record check (`verifyAttendanceBelongsToSupervisor`) where issuing a
 * second query just to re-express `attendanceEstablishmentWhere` as a `where`
 * filter would be wasted work.
 */
export function attendanceBelongsToEstablishment(
  attendance: {
    trainingAssignmentId: string | null;
    trainingAssignment: { establishmentId: string } | null;
    student: { establishmentId: string | null };
  },
  establishmentId: string,
): boolean {
  if (attendance.trainingAssignmentId) {
    return attendance.trainingAssignment?.establishmentId === establishmentId;
  }
  return attendance.student.establishmentId === establishmentId;
}
