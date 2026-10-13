/**
 * How a student's name is written, in one place.
 *
 * The record keeps the three parts — last, first and full middle name. Where a
 * single line is needed it is built here, so the middle *initial* (which is no
 * longer stored) is derived the same way everywhere. Mirrored on the client at
 * `app/client/lib/person-name.ts`; the two projects share no code, so keep
 * them identical.
 */
export interface NameParts {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
}

const clean = (value?: string | null) =>
  (value ?? '').replace(/\s+/g, ' ').trim();

/** "Santos" -> "S.", "de la Paz" -> "D.", blank -> "". */
export function middleInitialOf(middleName?: string | null): string {
  const first = clean(middleName).match(/\p{L}/u)?.[0];
  return first ? `${first.toUpperCase()}.` : '';
}

/** "Juan S. Dela Cruz" — the display name (`User.name`). */
export function formatFullName(parts: NameParts): string {
  return [
    clean(parts.firstName),
    middleInitialOf(parts.middleName),
    clean(parts.lastName),
  ]
    .filter(Boolean)
    .join(' ');
}

/** "Dela Cruz, Juan S." — for lists and printed headers sorted by surname. */
export function formatLastFirst(parts: NameParts): string {
  const given = [clean(parts.firstName), middleInitialOf(parts.middleName)]
    .filter(Boolean)
    .join(' ');
  return [clean(parts.lastName), given].filter(Boolean).join(', ');
}
