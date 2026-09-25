import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, NotificationType } from '../../generated/prisma/client';

type Client = Prisma.TransactionClient | PrismaService['client'];

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  /** See `notify`'s own comment for the convention every call site follows. */
  dedupeKey?: string;
}

const PAGE_SIZE = 20;

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  /**
   * The one function every feature calls to raise a notification (goal 2).
   * Takes an explicit Prisma client rather than always using `this.prisma`
   * so a caller already inside a `$transaction` (e.g. `createPlacement`) can
   * pass its `tx` and get the notification committed atomically with the
   * write that caused it, while a caller outside one (e.g. the overdue
   * sweep) just passes `this.prisma.client`.
   *
   * `createMany({ skipDuplicates: true })` against
   * `@@unique([userId, dedupeKey])` is what makes a *re-run of the same
   * trigger* idempotent (the overdue sweep firing twice, a double-clicked
   * approve) without swallowing a genuinely new event for the same record —
   * `[userId, type, entityId]` would have deduped both alike, which is wrong:
   * a second decline after a resubmission, or a resubmitted entry going
   * overdue again, are new events that must still notify.
   *
   * **Convention for `dedupeKey` (event + entity + version)** — every call
   * site should follow this shape rather than inventing its own:
   *   `${eventTag}:${entityId}` or `${eventTag}:${entityId}:${versionMarker}`
   * `eventTag` is a short, stable name for what happened — often but not
   * required to be the literal `type` value (`ATTENDANCE_APPROVED`'s and
   * `ATTENDANCE_DECLINED`'s dedupeKeys use `type` itself since the event and
   * the type already coincide 1:1; `ATTENDANCE_OVERDUE`'s uses the shorter
   * `overdue` and `PLACEMENT_RECORDED`'s uses `placement`, since either full
   * type name would be needlessly long here). `versionMarker`, when present,
   * is whatever on the entity changes when it's genuinely a new cycle — a
   * re-submission's new `submittedAt`, for instance — and is omitted
   * entirely when the entity id alone is already a fresh version (a new
   * TrainingAssignment row per placement, so there's nothing to append for
   * `PLACEMENT_RECORDED`). Omit `dedupeKey` altogether only for a
   * notification type that can never legitimately repeat for the same
   * recipient+entity in a way worth collapsing (none yet, but the field
   * stays optional for that case — see the schema's own comment on why NULL
   * is never deduped).
   */
  async notify(client: Client, input: NotifyInput): Promise<void> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return;

    await client.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey,
      })),
      skipDuplicates: true,
    });
  }

  /** Own notifications only — `userId` always comes from the JWT, never a param. */
  async list(userId: string, opts: { unreadOnly?: boolean; cursor?: string }) {
    const rows = await this.prisma.client.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.client.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.client.notification.findUnique({
      where: { id },
    });
    // Same 404 whether it doesn't exist or belongs to someone else — a 403
    // would confirm the id is real, which leaks that another user has it.
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.readAt) return notification;

    return this.prisma.client.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ marked: true }> {
    await this.prisma.client.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: true };
  }
}
