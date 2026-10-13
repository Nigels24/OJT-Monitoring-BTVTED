import { manilaToday, toUtcDateOnly } from './dates';

/**
 * The coordinator's final grade for one TrainingAssignment — the second half of
 * the two-part assessment. It is based on the OJT portfolio report and its
 * presentation, and is entirely separate from the supervisor's evaluation
 * sheet: that one is a raw TOTAL RATING out of the sheet's own maximum
 * (`evaluation-scoring.ts`), this one is a plain 0-100 figure with no rubric.
 */
export const GRADE_MIN = 0;
export const GRADE_MAX = 100;

export interface GradeEligibility {
  eligible: boolean;
  /** Why not, worded for the coordinator. `null` when eligible. */
  reason: string | null;
}

/**
 * Whether an assignment can be graded yet: it has ended, or its approved hours
 * have reached the requirement.
 *
 * "Ended" is any status but ACTIVE (COMPLETED, TRANSFERRED, CANCELLED), or an
 * `endDate` that has arrived. `endDate` is exclusive, the same reading
 * `StudentService.submitAttendance` gives it — attendance on that day is
 * already refused — so the placement is over once today reaches it. "Today" is
 * Manila's (see `dates.ts`).
 *
 * Hours are APPROVED only, taken from `assignment-progress.ts` by the caller:
 * pending hours have not been confirmed by anyone and do not count.
 *
 * One function, so the list that tells the coordinator whether the form is
 * open and the write that enforces it cannot disagree.
 */
export function gradeEligibility(
  assignment: { status: string; endDate: Date | null },
  progress: { approvedHours: number; requiredHours: number },
): GradeEligibility {
  const ended =
    assignment.status !== 'ACTIVE' ||
    (assignment.endDate !== null &&
      toUtcDateOnly(assignment.endDate).getTime() <= manilaToday().getTime());
  const hoursMet =
    progress.requiredHours > 0 &&
    progress.approvedHours >= progress.requiredHours;

  if (ended || hoursMet) return { eligible: true, reason: null };
  return {
    eligible: false,
    reason:
      `This placement cannot be graded yet: it is still ongoing and has ` +
      `${progress.approvedHours} of ${progress.requiredHours} required hours approved. ` +
      `A grade can be recorded once the placement has ended or its approved hours reach the requirement.`,
  };
}

/** Who recorded the grade, for every response that shows one. */
export const GRADED_BY_SELECT = {
  select: { id: true, user: { select: { name: true } } },
} as const;
