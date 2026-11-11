import { declineSnapshot, isNewDecline } from './attendance-declines';
import { overdueDedupeKey } from './attendance-overdue';

const SUBMITTED = new Date('2026-11-02T01:00:00.000Z');

describe('isNewDecline', () => {
  it('records the first decline', () => {
    expect(isNewDecline(null, { submittedAt: SUBMITTED }, 'Wrong times')).toBe(
      true,
    );
  });

  it('treats the same reason again in the same review cycle as a double-click', () => {
    const latest = {
      reason: 'Wrong times',
      declinedAt: new Date('2026-11-03T00:00:00.000Z'),
    };
    expect(
      isNewDecline(latest, { submittedAt: SUBMITTED }, 'Wrong times'),
    ).toBe(false);
  });

  it('records a different reason in the same cycle', () => {
    const latest = {
      reason: 'Wrong times',
      declinedAt: new Date('2026-11-03T00:00:00.000Z'),
    };
    expect(
      isNewDecline(latest, { submittedAt: SUBMITTED }, 'No signature'),
    ).toBe(true);
  });

  it('records the same reason again after a resubmission (a new cycle)', () => {
    const latest = {
      reason: 'Wrong times',
      declinedAt: new Date('2026-11-01T00:00:00.000Z'),
    };
    expect(
      isNewDecline(latest, { submittedAt: SUBMITTED }, 'Wrong times'),
    ).toBe(true);
  });
});

describe('declineSnapshot', () => {
  it('copies the entry and its hours as they stood', () => {
    const entry = {
      date: new Date('2026-11-06T00:00:00.000Z'),
      timeInAM: new Date('2026-11-06T00:00:00.000Z'),
      timeOutAM: new Date('2026-11-06T04:00:00.000Z'),
      timeInPM: new Date('2026-11-06T05:00:00.000Z'),
      timeOutPM: new Date('2026-11-06T06:30:00.000Z'),
      remarks: 'note',
    };
    expect(declineSnapshot(entry)).toEqual({ ...entry, hours: 5.5 });
  });
});

describe('overdueDedupeKey', () => {
  const row = { id: 'attendance-1', submittedAt: SUBMITTED };

  it('stays the same across a PENDING edit, so no second overdue alert', () => {
    // A PENDING edit sets lastEditedAt and leaves submittedAt alone.
    const edited = { ...row, lastEditedAt: new Date('2026-11-20T00:00:00Z') };
    expect(overdueDedupeKey(edited)).toBe(overdueDedupeKey(row));
  });

  it('changes on a resubmission after a decline — a new cycle on purpose', () => {
    const resubmitted = {
      ...row,
      submittedAt: new Date('2026-11-25T00:00:00Z'),
    };
    expect(overdueDedupeKey(resubmitted)).not.toBe(overdueDedupeKey(row));
  });
});
