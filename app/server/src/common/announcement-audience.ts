import type {
  AnnouncementAudience,
  Prisma,
} from '../../generated/prisma/client';

/**
 * Who an announcement reaches. One rule, in two forms that must agree: a Prisma
 * `where` for listing what a viewer may see, and an in-memory check for
 * deciding who to notify when one is posted. Both live here so they cannot
 * drift.
 *
 * - `audience` picks the role: STUDENTS, SUPERVISORS, or ALL (both).
 * - `blockId` and `courseId` are optional and independent; each one that is
 *   set must match, and one that is NULL does not limit anything.
 *
 * A student matches on their own block (their student record's or their
 * placement's) and their own program. A supervisor has neither, so they match
 * through their trainees: a block or program one of the trainees actively
 * placed at their establishment belongs to.
 *
 * Coordinators are not an audience — they write announcements and read all of
 * them through their own endpoints.
 */
export interface AnnouncementViewer {
  role: 'STUDENT' | 'SUPERVISOR';
  blockIds: readonly string[];
  courseIds: readonly string[];
}

export interface AnnouncementTarget {
  audience: AnnouncementAudience;
  blockId: string | null;
  courseId: string | null;
}

const ROLE_AUDIENCE: Record<AnnouncementViewer['role'], AnnouncementAudience> =
  {
    STUDENT: 'STUDENTS',
    SUPERVISOR: 'SUPERVISORS',
  };

export function isAnnouncementVisibleTo(
  announcement: AnnouncementTarget,
  viewer: AnnouncementViewer,
): boolean {
  if (
    announcement.audience !== 'ALL' &&
    announcement.audience !== ROLE_AUDIENCE[viewer.role]
  ) {
    return false;
  }
  if (
    announcement.blockId !== null &&
    !viewer.blockIds.includes(announcement.blockId)
  ) {
    return false;
  }
  if (
    announcement.courseId !== null &&
    !viewer.courseIds.includes(announcement.courseId)
  ) {
    return false;
  }
  return true;
}

/** The same rule as `isAnnouncementVisibleTo`, as a query filter. */
export function announcementWhereFor(
  viewer: AnnouncementViewer,
): Prisma.AnnouncementWhereInput {
  return {
    audience: { in: [ROLE_AUDIENCE[viewer.role], 'ALL'] },
    AND: [
      { OR: [{ blockId: null }, { blockId: { in: [...viewer.blockIds] } }] },
      { OR: [{ courseId: null }, { courseId: { in: [...viewer.courseIds] } }] },
    ],
  };
}

/** Distinct, non-null ids — a viewer's blocks or programs from several sources. */
export function distinctIds(ids: readonly (string | null | undefined)[]) {
  return [...new Set(ids.filter((id): id is string => !!id))];
}
