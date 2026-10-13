import { BadRequestException } from '@nestjs/common';
import { WEEKDAY_BY_JS_DAY } from './assignment-progress';
import {
  AttendanceTimes,
  hoursForAttendance,
  totalHours,
} from './attendance-hours';
import { MS_PER_DAY } from './dates';

/**
 * The month grid of a Daily Time Record (Civil Service Form No. 48): one row
 * for every calendar day of the month, carrying that day's morning and
 * afternoon arrival and departure **from APPROVED attendance only**.
 *
 * Pure: it is handed attendance rows and returns the grid, so the rule that a
 * pending or declined entry never appears on a DTR is testable on its own.
 * Hours come from `attendance-hours.ts` — nothing here re-derives them.
 */
export interface DtrAttendanceRow extends AttendanceTimes {
  /** UTC midnight of the calendar day (see `dates.ts`). */
  date: Date;
  status: string;
}

export interface DtrDay {
  /** 1..31. */
  day: number;
  /** `yyyy-mm-dd`. */
  date: string;
  /** MON..SUN. */
  weekday: string;
  /** Whether the placement schedules duty on this weekday. */
  isDutyDay: boolean;
  /** Clock times as printed ("8:00"), or `null` — blank on the form. */
  amArrival: string | null;
  amDeparture: string | null;
  pmArrival: string | null;
  pmDeparture: string | null;
  /** Hours rendered that day; `null` when there is no approved entry. */
  hours: number | null;
}

export interface DtrMonth {
  /** `yyyy-mm`. */
  month: string;
  /** "October 2026". */
  label: string;
  days: DtrDay[];
  /** Approved hours in the month, two decimals. */
  totalHours: number;
  /** Days with an approved entry. */
  daysRendered: number;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The first day of a `yyyy-mm` month and of the next, both UTC midnight. */
export function monthRange(month: string): { start: Date; end: Date } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new BadRequestException('month must look like "2026-10"');
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    // Day 1 of the following month — exclusive. `Date.UTC` rolls December
    // over into the next January by itself.
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

/**
 * A clock time as the form prints it: 12-hour, no AM/PM (the column says
 * which), in the school's zone. Attendance times are real instants, and the
 * server runs in UTC — reading the hour off the raw value would print every
 * arrival eight hours early.
 */
export function formatClock(value: Date | null): string | null {
  if (!value) return null;
  return value
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    })
    .replace(/\s?[AP]M$/i, '');
}

/**
 * Builds the grid for one month.
 *
 * Only rows whose status is APPROVED **and** whose date falls inside the month
 * are used; everything else — pending, declined, another month's entries — is
 * ignored, whatever the caller passed in. A day with no approved entry is a
 * blank row: the form shows what the supervisor verified, nothing more.
 */
export function buildDtrMonth(
  month: string,
  rows: readonly DtrAttendanceRow[],
  dutyDays: readonly string[],
): DtrMonth {
  const { start, end } = monthRange(month);
  const approved = rows.filter(
    (row) =>
      row.status === 'APPROVED' &&
      row.date.getTime() >= start.getTime() &&
      row.date.getTime() < end.getTime(),
  );
  const byDay = new Map(approved.map((row) => [row.date.getUTCDate(), row]));
  const dutySet = new Set(dutyDays);

  const days: DtrDay[] = [];
  for (let time = start.getTime(); time < end.getTime(); time += MS_PER_DAY) {
    const date = new Date(time);
    const row = byDay.get(date.getUTCDate());
    const weekday = WEEKDAY_BY_JS_DAY[date.getUTCDay()];
    days.push({
      day: date.getUTCDate(),
      date: date.toISOString().slice(0, 10),
      weekday,
      isDutyDay: dutySet.has(weekday),
      amArrival: formatClock(row?.timeInAM ?? null),
      amDeparture: formatClock(row?.timeOutAM ?? null),
      pmArrival: formatClock(row?.timeInPM ?? null),
      pmDeparture: formatClock(row?.timeOutPM ?? null),
      hours: row ? Math.round(hoursForAttendance(row) * 100) / 100 : null,
    });
  }

  return {
    month,
    label: start.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    days,
    totalHours: totalHours(approved),
    daysRendered: approved.length,
  };
}
