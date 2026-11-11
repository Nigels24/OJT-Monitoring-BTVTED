import { hoursForAttendance, AttendanceTimes } from './attendance-hours';

/**
 * The attendance decline trail (AttendanceDecline, schema comment).
 *
 * `Attendance` is corrected in place — one row per student per day — so a
 * decline reason would otherwise vanish the moment the student resubmits. Each
 * supervisor decline writes one history row with the entry as it stood when it
 * was declined; `Attendance.declineReason` stays the latest reason so existing
 * screens keep reading it.
 *
 * Read-only everywhere except SupervisorService.declineAttendance, which writes
 * it in the same transaction as the status change.
 */

/** What every attendance read selects for the trail, oldest first. */
export const ATTENDANCE_DECLINES_SELECT = {
  orderBy: { declinedAt: 'asc' },
  select: {
    id: true,
    reason: true,
    declinedByName: true,
    declinedAt: true,
    date: true,
    timeInAM: true,
    timeOutAM: true,
    timeInPM: true,
    timeOutPM: true,
    hours: true,
    remarks: true,
  },
} as const;

/** The attendance row as it is about to be declined. */
export interface DeclinedEntry extends AttendanceTimes {
  date: Date;
  remarks: string | null;
}

/** The snapshot columns of one AttendanceDecline row — copies, never live. */
export function declineSnapshot(entry: DeclinedEntry) {
  return {
    date: entry.date,
    timeInAM: entry.timeInAM,
    timeOutAM: entry.timeOutAM,
    timeInPM: entry.timeInPM,
    timeOutPM: entry.timeOutPM,
    hours: Math.round(hoursForAttendance(entry) * 100) / 100,
    remarks: entry.remarks,
  };
}

/**
 * Whether a decline should add a history row.
 *
 * A double-click on Decline (or a retried request) must not write the same
 * decline twice: if the latest recorded decline is in the current review cycle
 * (on or after `submittedAt`) and has the same reason, it is the same decline.
 * A different reason in the same cycle is a real change and is recorded; any
 * decline after a resubmission is a new cycle and is always recorded.
 */
export function isNewDecline(
  latest: { reason: string; declinedAt: Date } | null | undefined,
  attendance: { submittedAt: Date },
  reason: string,
): boolean {
  if (!latest) return true;
  const sameCycle =
    latest.declinedAt.getTime() >= attendance.submittedAt.getTime();
  return !(sameCycle && latest.reason === reason);
}
