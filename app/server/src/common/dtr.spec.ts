import { BadRequestException } from '@nestjs/common';
import {
  DtrAttendanceRow,
  buildDtrMonth,
  formatClock,
  monthRange,
} from './dtr';

/** A Manila clock time on a calendar day, as the UTC instant it is stored as. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);

const entry = (
  date: string,
  status = 'APPROVED',
  times: Partial<Record<'inAM' | 'outAM' | 'inPM' | 'outPM', string>> = {
    inAM: '08:00',
    outAM: '12:00',
    inPM: '13:00',
    outPM: '17:00',
  },
): DtrAttendanceRow => ({
  date: new Date(`${date}T00:00:00.000Z`),
  status,
  timeInAM: times.inAM ? at(date, times.inAM) : null,
  timeOutAM: times.outAM ? at(date, times.outAM) : null,
  timeInPM: times.inPM ? at(date, times.inPM) : null,
  timeOutPM: times.outPM ? at(date, times.outPM) : null,
});

const DUTY = ['WED', 'THU', 'FRI'];

describe('monthRange', () => {
  it('rejects anything that is not yyyy-mm', () => {
    for (const month of [
      '2026-13',
      '2026-00',
      '2026-1',
      '26-10',
      'October',
      '',
    ]) {
      expect(() => monthRange(month)).toThrow(BadRequestException);
    }
  });

  it('rolls December into the next year', () => {
    const { start, end } = monthRange('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('buildDtrMonth — the month grid', () => {
  it.each([
    ['2026-10', 31, 'October 2026'],
    ['2026-09', 30, 'September 2026'],
    ['2026-02', 28, 'February 2026'],
    ['2028-02', 29, 'February 2028'],
    ['2100-02', 28, 'February 2100'],
  ])('%s has %i days', (month, count, label) => {
    const dtr = buildDtrMonth(month, [], DUTY);
    expect(dtr.days).toHaveLength(count);
    expect(dtr.days[0].day).toBe(1);
    expect(dtr.days[count - 1].day).toBe(count);
    expect(dtr.days.map((d) => d.day)).toEqual(
      Array.from({ length: count }, (_, i) => i + 1),
    );
    expect(dtr.label).toBe(label);
  });

  it('labels each day with its date, weekday and whether it is a duty day', () => {
    const dtr = buildDtrMonth('2026-10', [], DUTY);
    // 1 October 2026 is a Thursday.
    expect(dtr.days[0]).toMatchObject({
      day: 1,
      date: '2026-10-01',
      weekday: 'THU',
      isDutyDay: true,
    });
    expect(dtr.days[3]).toMatchObject({ weekday: 'SUN', isDutyDay: false });
    expect(dtr.days[4]).toMatchObject({ weekday: 'MON', isDutyDay: false });
  });

  it('is all blank rows and a zero total when nothing is approved', () => {
    const dtr = buildDtrMonth('2026-10', [], DUTY);
    expect(dtr.totalHours).toBe(0);
    expect(dtr.daysRendered).toBe(0);
    for (const day of dtr.days) {
      expect(day).toMatchObject({
        amArrival: null,
        amDeparture: null,
        pmArrival: null,
        pmDeparture: null,
        hours: null,
      });
    }
  });
});

describe('buildDtrMonth — entries', () => {
  it('prints an approved day’s four times in Manila time, with its hours', () => {
    const dtr = buildDtrMonth('2026-10', [entry('2026-10-07')], DUTY);
    expect(dtr.days[6]).toMatchObject({
      day: 7,
      amArrival: '8:00',
      amDeparture: '12:00',
      pmArrival: '1:00',
      pmDeparture: '5:00',
      hours: 8,
    });
    expect(dtr.totalHours).toBe(8);
    expect(dtr.daysRendered).toBe(1);
  });

  it('leaves the other session blank for a half day', () => {
    const dtr = buildDtrMonth(
      '2026-10',
      [entry('2026-10-08', 'APPROVED', { inPM: '13:30', outPM: '17:15' })],
      DUTY,
    );
    expect(dtr.days[7]).toMatchObject({
      amArrival: null,
      amDeparture: null,
      pmArrival: '1:30',
      pmDeparture: '5:15',
      hours: 3.75,
    });
  });

  it('excludes pending and declined entries entirely', () => {
    const dtr = buildDtrMonth(
      '2026-10',
      [
        entry('2026-10-07', 'APPROVED'),
        entry('2026-10-08', 'PENDING'),
        entry('2026-10-09', 'DECLINED'),
      ],
      DUTY,
    );
    expect(dtr.days[6].hours).toBe(8);
    for (const index of [7, 8]) {
      expect(dtr.days[index]).toMatchObject({
        amArrival: null,
        pmDeparture: null,
        hours: null,
      });
    }
    expect(dtr.totalHours).toBe(8);
    expect(dtr.daysRendered).toBe(1);
  });

  it('ignores entries outside the month, on both sides', () => {
    const dtr = buildDtrMonth(
      '2026-10',
      [
        entry('2026-09-30'),
        entry('2026-10-01'),
        entry('2026-10-31'),
        entry('2026-11-01'),
        entry('2025-10-15'),
      ],
      DUTY,
    );
    expect(dtr.daysRendered).toBe(2);
    expect(dtr.totalHours).toBe(16);
    expect(dtr.days[0].hours).toBe(8);
    expect(dtr.days[30].hours).toBe(8);
    expect(dtr.days[14].hours).toBeNull();
  });

  it('totals the month with the shared hours helper, to two decimals', () => {
    const dtr = buildDtrMonth(
      '2026-10',
      [
        entry('2026-10-07', 'APPROVED', { inAM: '08:00', outAM: '12:10' }),
        entry('2026-10-08', 'APPROVED', { inAM: '08:05', outAM: '12:00' }),
        entry('2026-10-09'),
      ],
      DUTY,
    );
    // 4h10 + 3h55 + 8h = 16.0833… -> 16.08
    expect(dtr.totalHours).toBe(16.08);
  });

  it('shows an approved entry even on a day that is not a duty day', () => {
    // It was approved by the supervisor, so it is on the record.
    const dtr = buildDtrMonth('2026-10', [entry('2026-10-05')], DUTY);
    expect(dtr.days[4]).toMatchObject({ isDutyDay: false, hours: 8 });
  });

  it('handles 29 February in a leap year', () => {
    const dtr = buildDtrMonth('2028-02', [entry('2028-02-29')], DUTY);
    expect(dtr.days[28]).toMatchObject({ day: 29, hours: 8 });
  });
});

describe('formatClock', () => {
  it('prints 12-hour Manila time without AM/PM', () => {
    expect(formatClock(at('2026-10-07', '07:45'))).toBe('7:45');
    expect(formatClock(at('2026-10-07', '12:00'))).toBe('12:00');
    expect(formatClock(at('2026-10-07', '17:30'))).toBe('5:30');
    // 00:30 UTC is 8:30 in Manila — not 12:30.
    expect(formatClock(new Date('2026-10-07T00:30:00.000Z'))).toBe('8:30');
    expect(formatClock(null)).toBeNull();
  });
});
