import type { Prisma, StudentStatus } from '../../generated/prisma/client';

/**
 * The coordinator's student filters, as one query builder.
 *
 * The Students list and the program/block summary report both filter through
 * `buildStudentWhere`, which is why the summary's counts always match the list
 * it was printed from. Pure — it is handed the filters and the block scope and
 * returns a `where`; the DTO that validates the query string is
 * `student-filters.dto.ts`.
 */
export const TRAINING_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'ENDED',
  'NONE',
] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export interface StudentFilters {
  /** Program. */
  courseId?: string;
  yearLevel?: number;
  blockId?: string;
  /** One academic year, e.g. "2025-2026". */
  academicYear?: string;
  /** An inclusive range of academic years; either end may be omitted. */
  academicYearFrom?: string;
  academicYearTo?: string;
  establishmentId?: string;
  trainingStatus?: TrainingStatus;
  /** The student record's own status (the list's older "status" filter). */
  status?: StudentStatus;
}

/**
 * Where a student stands in training, from the statuses of all their
 * placements. One classification, used to filter and to count:
 *
 * - ACTIVE — has a placement in progress;
 * - COMPLETED — none in progress, and at least one completed;
 * - ENDED — none in progress or completed, only cancelled/transferred ones;
 * - NONE — never placed.
 */
export function trainingStatusOf(
  assignmentStatuses: readonly string[],
): TrainingStatus {
  if (assignmentStatuses.includes('ACTIVE')) return 'ACTIVE';
  if (assignmentStatuses.includes('COMPLETED')) return 'COMPLETED';
  if (assignmentStatuses.length > 0) return 'ENDED';
  return 'NONE';
}

/** The same classification as `trainingStatusOf`, as a query filter. */
function trainingStatusWhere(status: TrainingStatus): Prisma.StudentWhereInput {
  const some = (value: 'ACTIVE' | 'COMPLETED') => ({
    trainingAssignments: { some: { status: value } },
  });
  const none = (value: 'ACTIVE' | 'COMPLETED') => ({
    trainingAssignments: { none: { status: value } },
  });
  switch (status) {
    case 'ACTIVE':
      return some('ACTIVE');
    case 'COMPLETED':
      return { AND: [none('ACTIVE'), some('COMPLETED')] };
    case 'ENDED':
      return {
        AND: [
          none('ACTIVE'),
          none('COMPLETED'),
          { trainingAssignments: { some: {} } },
        ],
      };
    case 'NONE':
      return { trainingAssignments: { none: {} } };
  }
}

/**
 * An academic-year condition on a string column. Academic years are written
 * "2025-2026", so comparing them as text orders them correctly and a range is
 * a plain `gte`/`lte`.
 */
function academicYearCondition(
  filters: StudentFilters,
): Prisma.StringFilter | null {
  if (filters.academicYear) return { equals: filters.academicYear };
  if (!filters.academicYearFrom && !filters.academicYearTo) return null;
  return {
    ...(filters.academicYearFrom ? { gte: filters.academicYearFrom } : {}),
    ...(filters.academicYearTo ? { lte: filters.academicYearTo } : {}),
  };
}

/**
 * Builds the `where` for a set of filters.
 *
 * Every filter that is set narrows the result (they are ANDed); one that is
 * not set does nothing. `blockScopeIds` is the "My Block" scope — the
 * coordinator's own block ids, or `null` for the whole program. It is a view
 * default, not an authorization boundary (CLAUDE.md §2).
 *
 * Each condition is its own entry in `AND` rather than a key on one object:
 * several of them constrain `trainingAssignments` or `blockId`, and as object
 * keys the later would silently replace the earlier.
 */
export function buildStudentWhere(
  filters: StudentFilters,
  blockScopeIds: readonly string[] | null,
): Prisma.StudentWhereInput {
  const and: Prisma.StudentWhereInput[] = [];

  if (blockScopeIds) and.push({ blockId: { in: [...blockScopeIds] } });
  if (filters.courseId) and.push({ courseId: filters.courseId });
  if (filters.yearLevel !== undefined) {
    and.push({ courseYearLevel: filters.yearLevel });
  }
  if (filters.blockId) and.push({ blockId: filters.blockId });
  if (filters.status) and.push({ status: filters.status });

  // The academic year lives on the block a student belongs to and on each of
  // their placements; a student matches through either.
  const academicYear = academicYearCondition(filters);
  if (academicYear) {
    and.push({
      OR: [
        { block: { academicYear } },
        { trainingAssignments: { some: { academicYear } } },
      ],
    });
  }

  // Ever placed there — past placements count, so a transferred trainee is
  // still found under the establishment they were at.
  if (filters.establishmentId) {
    and.push({
      trainingAssignments: {
        some: { establishmentId: filters.establishmentId },
      },
    });
  }

  if (filters.trainingStatus) {
    and.push(trainingStatusWhere(filters.trainingStatus));
  }

  return and.length > 0 ? { AND: and } : {};
}
