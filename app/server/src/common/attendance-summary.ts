import { WEEKDAY_BY_JS_DAY } from './assignment-progress';
import {
  AttendanceTimes,
  hoursForAttendance,
  totalHours,
} from './attendance-hours';
import { MS_PER_DAY } from './dates';
import { formatClock } from './dtr';

/**
 * The attendance summary report: every day of a date range for one placement,
 * each with what happened on it.
 *
 * A day that has an attendance entry shows that entry's status. A day that
 * has none is classified here — this is the one place "Missing Log" and "Not
 * a Duty Day" are decided:
 *
 * - NOT_DUTY_DAY — the placement does not schedule duty on that weekday;
 * - MISSING_LOG — a duty day inside the placement, already past or today,
 *   with nothing logged.
 *
 * Days outside the placement (before it started, on or after its end date) or
 * still in the future are not listed at all unless something was logged on
 * them: nothing was expected, so nothing is missing.
 */
export type SummaryDayStatus =
  'APPROVED' | 'PENDING' | 'DECLINED' | 'MISSING_LOG' | 'NOT_DUTY_DAY';

export interface SummaryAttendanceRow extends AttendanceTimes {
  date: Date;
  status: string;
}

export interface SummaryDay {
  date: string;
  weekday: string;
  status: SummaryDayStatus;
  amArrival: string | null;
  amDeparture: string | null;
  pmArrival: string | null;
  pmDeparture: string | null;
  /** Hours on the entry, whatever its status; `null` with no entry. */
  hours: number | null;
}

export interface AttendanceSummary {
  days: SummaryDay[];
  totals: Record<SummaryDayStatus, number>;
  /** Hours on APPROVED entries only — the hours that count. */
  approvedHours: number;
  /** Hours on PENDING entries, shown apart: not yet verified. */
  pendingHours: number;
}

export function buildAttendanceSummary(
  range: { from: Date; to: Date },
  rows: readonly SummaryAttendanceRow[],
  placement: {
    startDate: Date;
    endDate: Date | null;
    dutyDays: readonly string[];
  },
  today: Date,
): AttendanceSummary {
  const inRange = rows.filter(
    (row) =>
      row.date.getTime() >= range.from.getTime() &&
      row.date.getTime() <= range.to.getTime(),
  );
  const byDate = new Map(inRange.map((row) => [row.date.getTime(), row]));
  const dutySet = new Set(placement.dutyDays);
  // `endDate` is exclusive, as it is for logging attendance.
  const lastExpected = Math.min(
    today.getTime(),
    placement.endDate ? placement.endDate.getTime() - MS_PER_DAY : Infinity,
  );

  const days: SummaryDay[] = [];
  for (
    let time = range.from.getTime();
    time <= range.to.getTime();
    time += MS_PER_DAY
  ) {
    const date = new Date(time);
    const weekday = WEEKDAY_BY_JS_DAY[date.getUTCDay()];
    const row = byDate.get(time);
    const base = { date: date.toISOString().slice(0, 10), weekday };

    if (row) {
      days.push({
        ...base,
        status: row.status as SummaryDayStatus,
        amArrival: formatClock(row.timeInAM),
        amDeparture: formatClock(row.timeOutAM),
        pmArrival: formatClock(row.timeInPM),
        pmDeparture: formatClock(row.timeOutPM),
        hours: Math.round(hoursForAttendance(row) * 100) / 100,
      });
      continue;
    }

    const expected =
      time >= placement.startDate.getTime() && time <= lastExpected;
    if (!expected) continue;
    days.push({
      ...base,
      status: dutySet.has(weekday) ? 'MISSING_LOG' : 'NOT_DUTY_DAY',
      amArrival: null,
      amDeparture: null,
      pmArrival: null,
      pmDeparture: null,
      hours: null,
    });
  }

  const totals: Record<SummaryDayStatus, number> = {
    APPROVED: 0,
    PENDING: 0,
    DECLINED: 0,
    MISSING_LOG: 0,
    NOT_DUTY_DAY: 0,
  };
  for (const day of days) totals[day.status] += 1;

  return {
    days,
    totals,
    approvedHours: totalHours(inRange.filter((r) => r.status === 'APPROVED')),
    pendingHours: totalHours(inRange.filter((r) => r.status === 'PENDING')),
  };
}
