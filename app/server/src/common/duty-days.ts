import { BadRequestException } from '@nestjs/common';
import { WEEKDAY_BY_JS_DAY } from './assignment-progress';

/**
 * The scheduled-duty-day rule, shared by attendance and journal entries.
 *
 * Non-duty days are excluded outright (thesis rule): a Wed-Fri assignment is
 * never "absent" on Mon/Tue, so those days cannot be logged or journalled at
 * all rather than merely being unpenalised. The check and its wording live here
 * so the two features can never drift into telling a student two different
 * things about the same schedule.
 */

/** Canonical Mon-first week order, for sorting `dutyDays` into a readable list. */
const WEEK_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export const WEEKDAY_LABELS: Record<string, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

/** "Mon, Wed, Fri" — always Mon-first, whatever order the column stores. */
export function formatDutyDays(dutyDays: readonly string[]): string {
  return [...dutyDays]
    .sort(
      (a, b) =>
        WEEK_ORDER.indexOf(a as (typeof WEEK_ORDER)[number]) -
        WEEK_ORDER.indexOf(b as (typeof WEEK_ORDER)[number]),
    )
    .map((day) => WEEKDAY_LABELS[day] ?? day)
    .join(', ');
}

/**
 * Rejects a date that is not one of the assignment's scheduled duty days.
 *
 * `date` must be a UTC-midnight date-only value (see `common/dates.ts`) —
 * day-of-week is a property of the calendar date it encodes, so `getUTCDay()`
 * needs no further conversion.
 */
export function assertDutyDay(date: Date, dutyDays: readonly string[]): void {
  const weekday = WEEKDAY_BY_JS_DAY[date.getUTCDay()];
  if (dutyDays.includes(weekday)) return;

  throw new BadRequestException(
    `${WEEKDAY_LABELS[weekday]} is not one of your scheduled duty days (${formatDutyDays(dutyDays)}).`,
  );
}
