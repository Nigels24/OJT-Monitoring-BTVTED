/**
 * Shared shapes for an attendance log's change trail — the same on the
 * student's history, the supervisor's approval queue and the coordinator's
 * overdue list (server: common/attendance-declines.ts).
 */

/** One supervisor decline, with the entry as it stood when declined. Read-only. */
export interface AttendanceDeclineRecord {
  id: string;
  reason: string;
  /** Snapshot of the supervisor's name; kept if their account is removed. */
  declinedByName: string | null;
  declinedAt: string;
  date: string;
  timeInAM: string | null;
  timeOutAM: string | null;
  timeInPM: string | null;
  timeOutPM: string | null;
  hours: number;
  remarks: string | null;
}

/** The two change fields every attendance row carries. */
export interface AttendanceChangeFields {
  /** When the student last corrected the log, or null if never. */
  lastEditedAt: string | null;
  /** Every decline, oldest first. */
  declines: AttendanceDeclineRecord[];
}

/** What a submission did (server: AttendanceSubmitOutcome). */
export type AttendanceSubmitOutcome = "CREATED" | "UPDATED" | "RESUBMITTED";
