/**
 * Week arithmetic for the weekly-task pages, on `yyyy-mm-dd` keys.
 *
 * Weeks run Monday to Sunday, the same rule as the server's `weekStartOf`
 * (`src/common/weekly-tasks.ts`). The server normalises whatever day it is
 * sent, so these only have to agree with it, not be trusted by it.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Today on the school's calendar, whatever zone the browser is in. */
export function manilaTodayKey(): string {
  // en-CA is ISO-shaped (YYYY-MM-DD).
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function parseKey(key: string): Date {
  return new Date(`${key.slice(0, 10)}T00:00:00Z`);
}

/** The Monday of the week `key` falls in; this week's for an unreadable key. */
export function weekStartKey(key: string | null | undefined): string {
  const date = parseKey(key || manilaTodayKey());
  if (Number.isNaN(date.getTime())) return weekStartKey(manilaTodayKey());
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return new Date(parseKey(weekStart).getTime() + weeks * 7 * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function weekEndKey(weekStart: string): string {
  return new Date(parseKey(weekStart).getTime() + 6 * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** "October 12 – 18, 2026" style range. Date-only values, so read in UTC. */
export function formatWeekRange(start: string, end: string): string {
  const format = (value: string, withYear: boolean) =>
    new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}

export function readApiError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
