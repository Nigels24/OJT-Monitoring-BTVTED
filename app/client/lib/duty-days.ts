/**
 * The duty-day rule as the student sees it before submitting — a mirror of the
 * server's `common/duty-days.ts`, wording included, so the form and the API
 * never tell a student two different things. The server re-checks regardless.
 */

/** JS `getUTCDay()` (0 = Sunday) to the Weekday values the API uses. */
const WEEKDAY_BY_JS_DAY = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;

const WEEK_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/** "Mon, Wed, Fri" — always Mon-first, whatever order the list arrives in. */
export function formatDutyDays(dutyDays: readonly string[]): string {
  return [...dutyDays]
    .sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))
    .map((day) => WEEKDAY_LABELS[day] ?? day)
    .join(", ");
}

/**
 * The server's message for a `yyyy-mm-dd` day outside `dutyDays`, or "" when it
 * is a duty day. The day of week is read in UTC because the value is a
 * calendar date, not an instant.
 */
export function dutyDayError(
  dateOnly: string,
  dutyDays: readonly string[],
): string {
  const day = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return "";
  const weekday = WEEKDAY_BY_JS_DAY[day.getUTCDay()];
  if (dutyDays.includes(weekday)) return "";
  return `${WEEKDAY_LABELS[weekday]} is not one of your scheduled duty days (${formatDutyDays(dutyDays)}).`;
}
