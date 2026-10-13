import {
  MESSAGE_RETENTION_DAYS,
  expiredMessagesWhere,
  messageRetentionCutoff,
} from './message-retention';

describe('message retention', () => {
  const now = new Date('2026-10-31T16:30:00.000Z');

  it('keeps messages for 30 days', () => {
    expect(MESSAGE_RETENTION_DAYS).toBe(30);
  });

  it('puts the cutoff exactly 30 days before now, to the millisecond', () => {
    expect(messageRetentionCutoff(now).toISOString()).toBe(
      '2026-10-01T16:30:00.000Z',
    );
  });

  it('crosses month and year boundaries by elapsed time, not calendar months', () => {
    expect(
      messageRetentionCutoff(
        new Date('2027-01-15T00:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-12-16T00:00:00.000Z');
    expect(
      messageRetentionCutoff(
        new Date('2028-03-15T00:00:00.000Z'),
      ).toISOString(),
    ).toBe('2028-02-14T00:00:00.000Z');
  });

  it('defaults to the current time', () => {
    const before = Date.now();
    const cutoff = messageRetentionCutoff().getTime();
    const after = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(cutoff).toBeGreaterThanOrEqual(before - thirtyDays);
    expect(cutoff).toBeLessThanOrEqual(after - thirtyDays);
  });

  describe('expiredMessagesWhere', () => {
    it('selects messages created strictly before the cutoff', () => {
      expect(expiredMessagesWhere(now)).toEqual({
        createdAt: { lt: new Date('2026-10-01T16:30:00.000Z') },
      });
    });

    it('filters on createdAt and nothing else, so every conversation is treated alike', () => {
      const where = expiredMessagesWhere(now);
      expect(Object.keys(where)).toEqual(['createdAt']);
      expect(Object.keys(where.createdAt as object)).toEqual(['lt']);
    });

    /** The same comparison Postgres makes for `createdAt < cutoff`. */
    const wouldDelete = (createdAt: string) =>
      new Date(createdAt).getTime() <
      (expiredMessagesWhere(now).createdAt as { lt: Date }).lt.getTime();

    it('deletes a message older than 30 days', () => {
      expect(wouldDelete('2026-10-01T16:29:59.999Z')).toBe(true);
      expect(wouldDelete('2026-08-01T00:00:00.000Z')).toBe(true);
    });

    it('keeps a message exactly 30 days old, and anything newer', () => {
      expect(wouldDelete('2026-10-01T16:30:00.000Z')).toBe(false);
      expect(wouldDelete('2026-10-02T00:00:00.000Z')).toBe(false);
      expect(wouldDelete('2026-10-31T16:30:00.000Z')).toBe(false);
    });
  });
});
