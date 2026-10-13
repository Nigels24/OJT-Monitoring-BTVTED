import {
  SummaryAttendanceRow,
  buildAttendanceSummary,
} from './attendance-summary';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);
const entry = (date: string, status: string): SummaryAttendanceRow => ({
  date: day(date),
  status,
  timeInAM: at(date, '08:00'),
  timeOutAM: at(date, '12:00'),
  timeInPM: null,
  timeOutPM: null,
});

// 2026-10-05 is a Monday. Duty: Wed, Thu, Fri.
const placement = {
  startDate: day('2026-10-07'),
  endDate: null,
  dutyDays: ['WED', 'THU', 'FRI'],
};
const range = { from: day('2026-10-05'), to: day('2026-10-11') };
const today = day('2026-10-09');

describe('buildAttendanceSummary', () => {
  const summary = buildAttendanceSummary(
    range,
    [entry('2026-10-07', 'APPROVED'), entry('2026-10-08', 'PENDING')],
    placement,
    today,
  );

  it('lists each expected day with its status', () => {
    expect(summary.days.map((d) => [d.date, d.status])).toEqual([
      ['2026-10-07', 'APPROVED'],
      ['2026-10-08', 'PENDING'],
      // A duty day, already here, with nothing logged.
      ['2026-10-09', 'MISSING_LOG'],
    ]);
  });

  it('leaves out days before the placement started and days still to come', () => {
    const dates = summary.days.map((d) => d.date);
    expect(dates).not.toContain('2026-10-05');
    expect(dates).not.toContain('2026-10-10');
  });

  it('marks a non-duty weekday inside the placement as Not a Duty Day', () => {
    const result = buildAttendanceSummary(
      { from: day('2026-10-07'), to: day('2026-10-13') },
      [],
      placement,
      day('2026-10-13'),
    );
    expect(result.days.map((d) => [d.weekday, d.status])).toEqual([
      ['WED', 'MISSING_LOG'],
      ['THU', 'MISSING_LOG'],
      ['FRI', 'MISSING_LOG'],
      ['SAT', 'NOT_DUTY_DAY'],
      ['SUN', 'NOT_DUTY_DAY'],
      ['MON', 'NOT_DUTY_DAY'],
      ['TUE', 'NOT_DUTY_DAY'],
    ]);
  });

  it('totals by status, and counts only approved hours as rendered', () => {
    expect(summary.totals).toEqual({
      APPROVED: 1,
      PENDING: 1,
      DECLINED: 0,
      MISSING_LOG: 1,
      NOT_DUTY_DAY: 0,
    });
    expect(summary.approvedHours).toBe(4);
    expect(summary.pendingHours).toBe(4);
  });

  it('shows a logged entry even on a non-duty day, and ignores rows outside the range', () => {
    const result = buildAttendanceSummary(
      range,
      [entry('2026-10-06', 'DECLINED'), entry('2026-09-30', 'APPROVED')],
      placement,
      today,
    );
    expect(result.days[0]).toMatchObject({
      date: '2026-10-06',
      status: 'DECLINED',
      amArrival: '8:00',
    });
    expect(result.approvedHours).toBe(0);
  });

  it('expects nothing on or after the placement’s end date', () => {
    const result = buildAttendanceSummary(
      { from: day('2026-10-07'), to: day('2026-10-09') },
      [],
      { ...placement, endDate: day('2026-10-08') },
      day('2026-10-20'),
    );
    expect(result.days.map((d) => d.date)).toEqual(['2026-10-07']);
  });
});
