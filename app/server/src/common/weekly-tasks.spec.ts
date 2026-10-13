import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertCanMarkDone,
  assertCanUndo,
  assertDueDate,
  assertEditable,
  assertRatable,
  isValidRating,
  ratingChanged,
  resolveWeek,
  summariseWeek,
  weekEndOf,
  weekStartOf,
} from './weekly-tasks';

const iso = (date: Date) => date.toISOString();
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('weekStartOf', () => {
  it('returns the same day for a Monday', () => {
    expect(iso(weekStartOf('2026-10-12'))).toBe('2026-10-12T00:00:00.000Z');
  });

  it.each([
    ['2026-10-13', 'Tuesday'],
    ['2026-10-16', 'Friday'],
    ['2026-10-17', 'Saturday'],
    ['2026-10-18', 'Sunday'],
  ])('normalises %s (%s) back to that week’s Monday', (value) => {
    expect(iso(weekStartOf(value))).toBe('2026-10-12T00:00:00.000Z');
  });

  it('starts a new week on the following Monday', () => {
    expect(iso(weekStartOf('2026-10-19'))).toBe('2026-10-19T00:00:00.000Z');
  });

  it('drops the time of day and stays on the UTC calendar date', () => {
    expect(iso(weekStartOf(new Date('2026-10-14T23:59:59.000Z')))).toBe(
      '2026-10-12T00:00:00.000Z',
    );
  });

  it('crosses a month and a year boundary', () => {
    expect(iso(weekStartOf('2026-11-01'))).toBe('2026-10-26T00:00:00.000Z');
    expect(iso(weekStartOf('2027-01-01'))).toBe('2026-12-28T00:00:00.000Z');
  });

  it('passes an unparseable value through as an Invalid Date', () => {
    expect(Number.isNaN(weekStartOf('not-a-date').getTime())).toBe(true);
  });

  it('ends the week on the Sunday six days later', () => {
    expect(iso(weekEndOf(day('2026-10-12')))).toBe('2026-10-18T00:00:00.000Z');
  });
});

describe('resolveWeek', () => {
  it('resolves any day of a week to its Monday-Sunday range', () => {
    const week = resolveWeek('2026-10-15');
    expect(iso(week.start)).toBe('2026-10-12T00:00:00.000Z');
    expect(iso(week.end)).toBe('2026-10-18T00:00:00.000Z');
  });

  it('defaults to a Monday when no week is sent', () => {
    expect(resolveWeek().start.getUTCDay()).toBe(1);
  });

  it('rejects an invalid date', () => {
    expect(() => resolveWeek('nope')).toThrow(BadRequestException);
  });
});

describe('assertDueDate', () => {
  const weekStart = day('2026-10-12');
  const assignmentStart = day('2026-10-14');

  it('accepts a date inside the week or after it', () => {
    expect(() =>
      assertDueDate(day('2026-10-16'), weekStart, assignmentStart),
    ).not.toThrow();
    expect(() =>
      assertDueDate(day('2026-10-26'), weekStart, assignmentStart),
    ).not.toThrow();
  });

  it('rejects a date before the week starts', () => {
    expect(() =>
      assertDueDate(day('2026-10-11'), weekStart, day('2026-06-01')),
    ).toThrow(BadRequestException);
  });

  it('rejects a date before the placement started, even inside the week', () => {
    expect(() =>
      assertDueDate(day('2026-10-13'), weekStart, assignmentStart),
    ).toThrow(BadRequestException);
  });
});

describe('status rules', () => {
  it('lets a supervisor edit or delete only an ASSIGNED task', () => {
    expect(() => assertEditable('ASSIGNED')).not.toThrow();
    expect(() => assertEditable('DONE')).toThrow(ConflictException);
    expect(() => assertEditable('RATED')).toThrow(ConflictException);
  });

  it('lets a student mark only an ASSIGNED task done', () => {
    expect(() => assertCanMarkDone('ASSIGNED')).not.toThrow();
    expect(() => assertCanMarkDone('DONE')).toThrow(ConflictException);
    expect(() => assertCanMarkDone('RATED')).toThrow(ConflictException);
  });

  it('lets a student undo DONE, but not once it is rated', () => {
    expect(() => assertCanUndo('DONE')).not.toThrow();
    expect(() => assertCanUndo('RATED')).toThrow(ConflictException);
    expect(() => assertCanUndo('ASSIGNED')).toThrow(ConflictException);
  });
});

describe('rating rules', () => {
  it('rates only a task the trainee has marked done, and allows a correction', () => {
    expect(() => assertRatable('ASSIGNED')).toThrow(ConflictException);
    expect(() => assertRatable('DONE')).not.toThrow();
    expect(() => assertRatable('RATED')).not.toThrow();
  });

  it('accepts whole numbers from 1 to 5 only', () => {
    expect([1, 2, 3, 4, 5].every(isValidRating)).toBe(true);
    expect([0, 6, -1, 3.5, NaN, '4', null, undefined].some(isValidRating)).toBe(
      false,
    );
  });

  it('treats a repeated save as unchanged and a real correction as changed', () => {
    const current = { rating: 4, ratingComment: 'Good work' };
    expect(ratingChanged(current, { rating: 4, comment: 'Good work' })).toBe(
      false,
    );
    expect(ratingChanged(current, { rating: 5, comment: 'Good work' })).toBe(
      true,
    );
    expect(ratingChanged(current, { rating: 4, comment: null })).toBe(true);
    expect(
      ratingChanged(
        { rating: null, ratingComment: null },
        { rating: 3, comment: null },
      ),
    ).toBe(true);
  });
});

describe('summariseWeek', () => {
  it('averages rated tasks only and counts each status', () => {
    expect(
      summariseWeek([
        { status: 'RATED', rating: 5 },
        { status: 'RATED', rating: 4 },
        { status: 'RATED', rating: 4 },
        { status: 'DONE', rating: null },
        { status: 'ASSIGNED', rating: null },
      ]),
    ).toEqual({
      total: 5,
      assigned: 1,
      done: 1,
      rated: 3,
      averageRating: 4.33,
    });
  });

  it('reports no average, not zero, when nothing is rated', () => {
    expect(
      summariseWeek([{ status: 'DONE', rating: null }]).averageRating,
    ).toBe(null);
    expect(summariseWeek([]).averageRating).toBe(null);
  });
});
