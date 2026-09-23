import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { totalHours } from './attendance-hours';
import { MS_PER_DAY, manilaToday } from './dates';

/**
 * Accepts either a `PrismaService.client` or a `$transaction` callback's `tx`
 * — both expose the same query methods this file uses, so the same function
 * works whether progress is read standalone or as part of a larger write.
 */
type Client = Prisma.TransactionClient;

export interface AssignmentProgress {
  requiredHours: number;
  approvedHours: number;
  pendingHours: number;
  remainingHours: number;
  /** 0-100, 2dp, capped at 100 even if approvedHours exceeds requiredHours. */
  percentComplete: number;
  /** Calendar days from startDate to min(today, endDate) whose weekday is a duty day. */
  expectedDutyDaysToDate: number;
  daysWithApprovedAttendance: number;
}

/** What every zeroed/no-assignment response uses, so every caller agrees on the shape. */
export const ZERO_ASSIGNMENT_PROGRESS: AssignmentProgress = {
  requiredHours: 0,
  approvedHours: 0,
  pendingHours: 0,
  remainingHours: 0,
  percentComplete: 0,
  expectedDutyDaysToDate: 0,
  daysWithApprovedAttendance: 0,
};

type AttendanceStatusRow = {
  status: string;
  timeInAM: Date | null;
  timeOutAM: Date | null;
  timeInPM: Date | null;
  timeOutPM: Date | null;
};

type AssignmentFields = {
  requiredHours: number;
  dutyDays: string[];
  startDate: Date;
  endDate: Date | null;
};

/**
 * The pure half of `computeProgress`: given an assignment's own fields and
 * its own APPROVED/PENDING attendance rows (already fetched — by one
 * assignment or, for a list, batched across many and grouped by caller),
 * derives its progress. Split out so a list endpoint (coordinator's student
 * list, dashboard, supervisor's roster) can compute every row's progress from
 * two flat, batched queries instead of one `computeProgress` round trip per
 * student — the same batch-then-group-in-memory shape
 * `getAttendanceOversight` already uses — while still going through this one
 * function, so the math itself is never duplicated.
 */
export function progressFromRows(
  assignment: AssignmentFields,
  rows: AttendanceStatusRow[],
): AssignmentProgress {
  const approvedRows = rows.filter((a) => a.status === 'APPROVED');
  const pendingRows = rows.filter((a) => a.status === 'PENDING');

  // Reuses totalHours (common/attendance-hours.ts) — the same sum-and-round
  // every other hours figure in the app is built from. Not reinvented here.
  const approvedHours = totalHours(approvedRows);
  const pendingHours = totalHours(pendingRows);
  const remainingHours =
    Math.round(Math.max(0, assignment.requiredHours - approvedHours) * 100) /
    100;
  const percentComplete =
    assignment.requiredHours > 0
      ? Math.min(
          100,
          Math.round((approvedHours / assignment.requiredHours) * 10000) / 100,
        )
      : 0;

  return {
    requiredHours: assignment.requiredHours,
    approvedHours,
    pendingHours,
    remainingHours,
    percentComplete,
    expectedDutyDaysToDate: countExpectedDutyDays(
      assignment.startDate,
      assignment.endDate,
      assignment.dutyDays,
    ),
    // Attendance.@@unique([studentId, date]) means every row for this
    // assignment is already a distinct calendar day — no separate distinct
    // count needed.
    daysWithApprovedAttendance: approvedRows.length,
  };
}

/**
 * Progress for one TrainingAssignment, computed from its own APPROVED/PENDING
 * attendance only — never the student's attendance across other assignments.
 *
 * `client` is untyped as either the plain PrismaService client or a
 * `$transaction` tx: both satisfy `Prisma.TransactionClient` structurally, so
 * this can run standalone (a GET handler) or inside a write (e.g. right after
 * creating a placement, to return its starting — always zero — progress).
 *
 * Fetches its own two queries; for more than one assignment at a time, batch
 * the same two queries yourself and call `progressFromRows` per group instead
 * — see its comment.
 */
export async function computeProgress(
  client: Client,
  assignmentId: string,
): Promise<AssignmentProgress> {
  const assignment = await client.trainingAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      requiredHours: true,
      dutyDays: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!assignment) {
    throw new NotFoundException(`TrainingAssignment ${assignmentId} not found`);
  }

  const attendances = await client.attendance.findMany({
    where: {
      trainingAssignmentId: assignmentId,
      status: { in: ['APPROVED', 'PENDING'] },
    },
    select: {
      status: true,
      timeInAM: true,
      timeOutAM: true,
      timeInPM: true,
      timeOutPM: true,
    },
  });

  return progressFromRows(assignment, attendances);
}

/** JS `Date#getUTCDay()` (0 = Sunday) to Weekday enum value. Also used by
 * `StudentService.submitAttendance` to check a submitted date against
 * `dutyDays`, so the mapping lives in one place. */
export const WEEKDAY_BY_JS_DAY = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
] as const;

/**
 * Counts dates in [startDate, min(today, endDate)] whose weekday is in
 * dutyDays — a Wed-Fri assignment is not "absent" on Mon/Tue.
 *
 * startDate/endDate are UTC-midnight date-only values, the same convention
 * `Attendance.date` uses (see common/dates.ts) — day-of-week is a property of
 * the calendar date they encode, not of the instant, so `getUTCDay()` on them
 * is correct with no further timezone conversion. "today" is Manila's, via
 * `manilaToday()`, for the same reason every other "today" in this app is.
 */
function countExpectedDutyDays(
  startDate: Date,
  endDate: Date | null,
  dutyDays: string[],
): number {
  const today = manilaToday();
  const upperBound =
    endDate && endDate.getTime() < today.getTime() ? endDate : today;
  if (startDate.getTime() > upperBound.getTime()) return 0;

  const dutySet = new Set(dutyDays);
  let count = 0;
  for (
    let t = startDate.getTime();
    t <= upperBound.getTime();
    t += MS_PER_DAY
  ) {
    if (dutySet.has(WEEKDAY_BY_JS_DAY[new Date(t).getUTCDay()])) count += 1;
  }
  return count;
}
