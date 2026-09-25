import { Prisma } from '../../generated/prisma/client';
import { MS_PER_DAY } from './dates';

/**
 * A PENDING attendance record left unactioned this long is flagged and
 * raised to the coordinator (thesis Obj 8). `Attendance.submittedAt`, not
 * `createdAt` — see that column's own schema comment for why they differ.
 */
export const OVERDUE_DAYS = 21;

/**
 * Elapsed whole days since submission. `submittedAt` is a real instant, not
 * a calendar-day column like `Attendance.date` (see common/dates.ts) — a
 * duration between two instants is the same number of days everywhere, so
 * unlike the rest of this codebase's date handling, no Asia/Manila
 * conversion applies here.
 */
export function daysPending(attendance: { submittedAt: Date }): number {
  return Math.floor(
    (Date.now() - attendance.submittedAt.getTime()) / MS_PER_DAY,
  );
}

export function isOverdue(attendance: {
  status: string;
  submittedAt: Date;
}): boolean {
  return (
    attendance.status === 'PENDING' && daysPending(attendance) >= OVERDUE_DAYS
  );
}

/**
 * The read-time source of truth (goal 4): PENDING rows whose submission
 * crosses the overdue threshold, evaluated fresh on every read rather than a
 * stored flag. The dashboard's overdue table, the sweep, and anywhere else
 * that needs "just the overdue ones" all filter through this one `where`, so
 * the threshold can never drift between call sites the way two independently
 * hand-written filters could.
 */
export function overdueAttendanceWhere(): Prisma.AttendanceWhereInput {
  return {
    status: 'PENDING',
    submittedAt: { lt: new Date(Date.now() - OVERDUE_DAYS * MS_PER_DAY) },
  };
}
