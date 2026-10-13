import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  MS_PER_DAY,
  formatDateOnly,
  manilaToday,
  startOfUtcDay,
} from './dates';

/**
 * The rules of a weekly task that need no database: which week a date belongs
 * to, when a task may be edited, marked done, undone or rated, and how a week's
 * ratings are averaged. Pure, so the service and its unit test share them.
 *
 * The 1-5 here is the weekly task's own scale. It happens to match the
 * evaluation sheet's, but nothing in this file is imported by
 * `evaluation-scoring.ts` or `assignment-grade.ts`, and nothing here reads
 * them: a weekly rating never moves an Evaluation total or a coordinator grade.
 */
export const MIN_TASK_RATING = 1;
export const MAX_TASK_RATING = 5;

/** A task may carry at most this many proof photos. */
export const MAX_TASK_PHOTOS = 5;

export type WeeklyTaskStatusValue = 'ASSIGNED' | 'DONE' | 'RATED';

/**
 * The Monday of the week `value` falls in, as UTC midnight — the form every
 * `WeeklyTask.weekStart` is stored in. Weeks run Monday to Sunday, so a Sunday
 * belongs to the week that began six days earlier.
 *
 * `value` is read as a date-only value (see `dates.ts`): day-of-week is a
 * property of the calendar date it encodes, so `getUTCDay()` needs no further
 * conversion. An unparseable input returns an Invalid Date for the caller to
 * reject.
 */
export function weekStartOf(value: string | Date): Date {
  const day = startOfUtcDay(value);
  if (Number.isNaN(day.getTime())) return day;
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * MS_PER_DAY);
}

/** The Sunday that closes the week starting on `weekStart`. */
export function weekEndOf(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 6 * MS_PER_DAY);
}

/** The week that contains today — Manila's today, like every other "today". */
export function currentWeekStart(): Date {
  return weekStartOf(manilaToday());
}

/**
 * The week a request is asking about: the one containing `week` (any day of
 * it), or the current week when none was sent.
 */
export function resolveWeek(week?: string): { start: Date; end: Date } {
  const start = week ? weekStartOf(week) : currentWeekStart();
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('week is not a valid date');
  }
  return { start, end: weekEndOf(start) };
}

/**
 * A due date may not fall before the week the task belongs to, nor before the
 * placement itself began. It may fall after the week — a task assigned on a
 * Friday can reasonably be due the following Monday.
 */
export function assertDueDate(
  dueDate: Date,
  weekStart: Date,
  assignmentStart: Date,
): void {
  if (Number.isNaN(dueDate.getTime())) {
    throw new BadRequestException('dueDate is not a valid date');
  }
  if (dueDate.getTime() < weekStart.getTime()) {
    throw new BadRequestException(
      `The due date cannot be before the task's week, which starts on ${formatDateOnly(weekStart)}.`,
    );
  }
  const placementStart = startOfUtcDay(assignmentStart);
  if (dueDate.getTime() < placementStart.getTime()) {
    throw new BadRequestException(
      `The due date cannot be before the placement started on ${formatDateOnly(placementStart)}.`,
    );
  }
}

/** A supervisor may edit or delete a task only until the student acts on it. */
export function assertEditable(status: WeeklyTaskStatusValue): void {
  if (status !== 'ASSIGNED') {
    throw new ConflictException(
      status === 'RATED'
        ? 'This task has already been rated and can no longer be changed.'
        : 'The trainee has already marked this task done, so it can no longer be changed.',
    );
  }
}

export function assertCanMarkDone(status: WeeklyTaskStatusValue): void {
  if (status !== 'ASSIGNED') {
    throw new ConflictException(
      status === 'RATED'
        ? 'This task has already been rated.'
        : 'This task is already marked done.',
    );
  }
}

/** Undo is the student's until the supervisor rates; after that it is final. */
export function assertCanUndo(status: WeeklyTaskStatusValue): void {
  if (status === 'RATED') {
    throw new ConflictException(
      'This task has already been rated and can no longer be undone.',
    );
  }
  if (status !== 'DONE') {
    throw new ConflictException('This task is not marked done.');
  }
}

/** Only finished work is rated: DONE for a first rating, RATED for a correction. */
export function assertRatable(status: WeeklyTaskStatusValue): void {
  if (status === 'ASSIGNED') {
    throw new ConflictException(
      'This task can be rated once the trainee marks it done.',
    );
  }
}

export function isValidRating(rating: unknown): rating is number {
  return (
    typeof rating === 'number' &&
    Number.isInteger(rating) &&
    rating >= MIN_TASK_RATING &&
    rating <= MAX_TASK_RATING
  );
}

/**
 * Whether saving this rating would change anything. A repeat of the stored
 * rating and comment is a no-op — it restamps nothing and notifies no one —
 * which is what lets `ratedAt` serve as the notification's version marker.
 */
export function ratingChanged(
  current: { rating: number | null; ratingComment: string | null },
  next: { rating: number; comment: string | null },
): boolean {
  return (
    current.rating !== next.rating || current.ratingComment !== next.comment
  );
}

export interface WeekSummary {
  total: number;
  assigned: number;
  done: number;
  rated: number;
  /**
   * The mean of the week's RATED tasks only, to two decimals — a plain number,
   * with no band or label. `null`, not 0, when nothing has been rated yet.
   */
  averageRating: number | null;
}

export function summariseWeek(
  tasks: ReadonlyArray<{
    status: WeeklyTaskStatusValue;
    rating: number | null;
  }>,
): WeekSummary {
  const ratings = tasks
    .filter((task) => task.status === 'RATED' && task.rating !== null)
    .map((task) => task.rating as number);
  return {
    total: tasks.length,
    assigned: tasks.filter((task) => task.status === 'ASSIGNED').length,
    done: tasks.filter((task) => task.status === 'DONE').length,
    rated: tasks.filter((task) => task.status === 'RATED').length,
    averageRating:
      ratings.length === 0
        ? null
        : Math.round(
            (ratings.reduce((sum, rating) => sum + rating, 0) /
              ratings.length) *
              100,
          ) / 100,
  };
}
