/**
 * How a student's name is written, in one place. The record keeps last, first
 * and full middle name; the middle *initial* is derived here wherever a single
 * line needs one.
 *
 * Mirrors `app/server/src/common/person-name.ts` — the two projects share no
 * code, so keep them identical.
 */
export interface NameParts {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
}

const clean = (value?: string | null) =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** "Santos" -> "S.", "de la Paz" -> "D.", blank -> "". */
export function middleInitialOf(middleName?: string | null): string {
  const first = clean(middleName).match(/\p{L}/u)?.[0];
  return first ? `${first.toUpperCase()}.` : "";
}

/** "Juan S. Dela Cruz". */
export function formatFullName(parts: NameParts): string {
  return [
    clean(parts.firstName),
    middleInitialOf(parts.middleName),
    clean(parts.lastName),
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Dela Cruz, Juan S." */
export function formatLastFirst(parts: NameParts): string {
  const given = [clean(parts.firstName), middleInitialOf(parts.middleName)]
    .filter(Boolean)
    .join(" ");
  return [clean(parts.lastName), given].filter(Boolean).join(", ");
}

/** "21 years old" from the server-computed age; "" when there is none. */
export function formatAge(age: number | null | undefined): string {
  if (age === null || age === undefined) return "";
  return `${age} year${age === 1 ? "" : "s"} old`;
}
