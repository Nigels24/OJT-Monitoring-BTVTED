import { manilaToday, startOfUtcDay } from './dates';

/**
 * A person's age: completed years between their date of birth and a given
 * day. The single place age is worked out — it is never stored and never
 * typed (CLAUDE.md §18); every response that shows an age derives it here.
 *
 * Both arguments are date-only values (UTC midnight of the calendar day, see
 * `dates.ts`), so the comparison is on calendar month and day, not on elapsed
 * milliseconds — which is what makes "the birthday is tomorrow" come out one
 * year younger than "the birthday is today".
 *
 * A 29 February birthday counts as reached on 1 March in a year with no 29
 * February: on 28 February the month-and-day has not yet arrived.
 */
export function ageOn(dateOfBirth: Date, today: Date): number {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayReached =
    today.getUTCMonth() > dateOfBirth.getUTCMonth() ||
    (today.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      today.getUTCDate() >= dateOfBirth.getUTCDate());
  if (!birthdayReached) age -= 1;
  return age;
}

/**
 * Age as of today on the school's calendar (Asia/Manila), or `null` when there
 * is no usable date of birth — a missing age reads as absent, not as 0.
 */
export function computeAge(
  dateOfBirth: Date | string | null | undefined,
): number | null {
  if (!dateOfBirth) return null;
  const birthdate = startOfUtcDay(dateOfBirth);
  if (Number.isNaN(birthdate.getTime())) return null;
  const age = ageOn(birthdate, manilaToday());
  // A date of birth in the future is a data error, not a negative age.
  return age >= 0 ? age : null;
}

/** Adds the derived, read-only `age` to a record that has a `dateOfBirth`. */
export function withAge<T extends { dateOfBirth: Date | null }>(
  record: T,
): T & { age: number | null } {
  return { ...record, age: computeAge(record.dateOfBirth) };
}
