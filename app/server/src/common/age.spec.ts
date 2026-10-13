import { ageOn, computeAge, withAge } from './age';
import { manilaToday } from './dates';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('ageOn', () => {
  it('counts the birthday itself as reached', () => {
    expect(ageOn(day('2005-10-13'), day('2026-10-13'))).toBe(21);
  });

  it('is still a year younger the day before the birthday', () => {
    // Today is the 13th; the birthday is tomorrow.
    expect(ageOn(day('2005-10-14'), day('2026-10-13'))).toBe(20);
  });

  it('handles a birthday later in the current year', () => {
    expect(ageOn(day('2005-12-25'), day('2026-10-13'))).toBe(20);
    expect(ageOn(day('2005-11-01'), day('2026-10-13'))).toBe(20);
  });

  it('handles a birthday earlier in the current year', () => {
    expect(ageOn(day('2005-01-02'), day('2026-10-13'))).toBe(21);
    expect(ageOn(day('2005-10-12'), day('2026-10-13'))).toBe(21);
  });

  it('is 0 for a baby under one year old', () => {
    expect(ageOn(day('2026-01-01'), day('2026-10-13'))).toBe(0);
  });

  describe('leap-day births', () => {
    const born = day('2004-02-29');

    it('turns a year older on 29 February in a leap year', () => {
      expect(ageOn(born, day('2024-02-28'))).toBe(19);
      expect(ageOn(born, day('2024-02-29'))).toBe(20);
    });

    it('turns a year older on 1 March in a year without a 29 February', () => {
      expect(ageOn(born, day('2026-02-28'))).toBe(21);
      expect(ageOn(born, day('2026-03-01'))).toBe(22);
    });

    it('is right across a century leap-year gap', () => {
      // 2100 is not a leap year.
      expect(ageOn(day('2096-02-29'), day('2100-02-28'))).toBe(3);
      expect(ageOn(day('2096-02-29'), day('2100-03-01'))).toBe(4);
    });
  });
});

describe('computeAge', () => {
  /** A date of birth `years` years before Manila's today, shifted by days. */
  const bornYearsAgo = (years: number, shiftDays = 0) => {
    const today = manilaToday();
    const born = new Date(
      Date.UTC(
        today.getUTCFullYear() - years,
        today.getUTCMonth(),
        today.getUTCDate(),
      ),
    );
    return new Date(born.getTime() + shiftDays * 24 * 60 * 60 * 1000);
  };

  it('uses today on the school’s calendar: birthday today vs tomorrow', () => {
    expect(computeAge(bornYearsAgo(21))).toBe(21);
    expect(computeAge(bornYearsAgo(21, 1))).toBe(20);
    expect(computeAge(bornYearsAgo(21, -1))).toBe(21);
  });

  it('accepts an ISO string and ignores its time of day', () => {
    const iso = bornYearsAgo(18).toISOString().replace('T00:00', 'T15:30');
    expect(computeAge(iso)).toBe(18);
  });

  it('is null — not 0 — when there is no usable date of birth', () => {
    expect(computeAge(null)).toBeNull();
    expect(computeAge(undefined)).toBeNull();
    expect(computeAge('not a date')).toBeNull();
  });

  it('is null for a date of birth in the future', () => {
    expect(computeAge(bornYearsAgo(-1))).toBeNull();
  });
});

describe('withAge', () => {
  it('adds the derived age without changing the record', () => {
    const record = { id: 's1', dateOfBirth: day('2000-01-01') };
    const result = withAge(record);
    expect(result).toMatchObject(record);
    expect(typeof result.age).toBe('number');
    expect(withAge({ dateOfBirth: null }).age).toBeNull();
  });
});
