import { gradeEligibility } from './assignment-grade';
import { MS_PER_DAY, manilaToday } from './dates';

describe('gradeEligibility', () => {
  const short = { approvedHours: 120, requiredHours: 486 };
  const daysFromToday = (days: number) =>
    new Date(manilaToday().getTime() + days * MS_PER_DAY);

  it('refuses an ongoing placement that is short of its hours', () => {
    const result = gradeEligibility({ status: 'ACTIVE', endDate: null }, short);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('120 of 486');
  });

  it('allows an ACTIVE placement once approved hours reach the requirement', () => {
    expect(
      gradeEligibility(
        { status: 'ACTIVE', endDate: null },
        { approvedHours: 486, requiredHours: 486 },
      ),
    ).toEqual({ eligible: true, reason: null });
  });

  it('does not treat a zero-hour requirement as already met', () => {
    expect(
      gradeEligibility(
        { status: 'ACTIVE', endDate: null },
        { approvedHours: 0, requiredHours: 0 },
      ).eligible,
    ).toBe(false);
  });

  it.each(['COMPLETED', 'TRANSFERRED', 'CANCELLED'])(
    'allows a %s placement whatever its hours',
    (status) => {
      expect(gradeEligibility({ status, endDate: null }, short).eligible).toBe(
        true,
      );
    },
  );

  it('treats an end date of today as ended, and tomorrow as still ongoing', () => {
    expect(
      gradeEligibility({ status: 'ACTIVE', endDate: daysFromToday(0) }, short)
        .eligible,
    ).toBe(true);
    expect(
      gradeEligibility({ status: 'ACTIVE', endDate: daysFromToday(1) }, short)
        .eligible,
    ).toBe(false);
  });
});
