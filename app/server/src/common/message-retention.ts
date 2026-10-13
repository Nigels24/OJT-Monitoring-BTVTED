import { Prisma } from '../../generated/prisma/client';
import { MS_PER_DAY } from './dates';

/**
 * How long a chat message is kept. The one place the period is written down:
 * the nightly sweep, its cutoff and its `where` all read it from here.
 *
 * This covers `Message` rows only — 1:1 and placement-thread alike. Feedback
 * that lives on a record (an attendance decline reason, a journal's
 * coordinator remarks, a weekly task's rating comment), concerns and
 * announcements are not messages, are stored in their own tables, and are
 * never deleted by retention.
 */
export const MESSAGE_RETENTION_DAYS = 30;

/**
 * The instant before which a message has outlived its retention period.
 *
 * A duration between two real instants, so — like the overdue window in
 * `attendance-overdue.ts` — no Asia/Manila conversion applies: 30 days is the
 * same length everywhere.
 */
export function messageRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MESSAGE_RETENTION_DAYS * MS_PER_DAY);
}

/**
 * Exactly what the retention sweep deletes: messages created strictly before
 * the cutoff, and nothing narrower or wider.
 *
 * Deliberately a filter on `createdAt` alone. No conversation, sender or
 * `isGroup` condition appears here, so retention applies identically to every
 * conversation for every participant — and because this is the sweep's whole
 * `where`, the unit test of this function is a test of what gets deleted.
 */
export function expiredMessagesWhere(
  now: Date = new Date(),
): Prisma.MessageWhereInput {
  return { createdAt: { lt: messageRetentionCutoff(now) } };
}
