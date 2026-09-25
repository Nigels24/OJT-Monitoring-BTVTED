import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import {
  overdueAttendanceWhere,
  daysPending,
} from '../common/attendance-overdue';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Finds every PENDING attendance record that has crossed the 21-day overdue
 * threshold and raises it to whoever should follow up (thesis Obj 8): the
 * coordinator of the student's block (or every coordinator, if the block has
 * no coordinator or the row has no block at all), and the supervisors at the
 * establishment sitting on it.
 *
 * Runs on a plain `setInterval`, not `@nestjs/schedule` (no new deps allowed)
 * — both on server start and every six hours after. It is also triggered
 * from `CoordinatorService.getDashboard` on every request: a free/serverless
 * host can sleep this process between requests, in which case the interval
 * timer simply never fires, but the *read-time* overdue flag
 * (`isOverdue`/`overdueAttendanceWhere`) stays correct regardless — this
 * sweep only affects whether a notification row exists, never whether
 * something displays as overdue. Both triggers call the same idempotent
 * `runSweep()`, so running it twice for the same stale row is harmless
 * (`NotificationService.notify`'s `skipDuplicates`).
 */
@Injectable()
export class OverdueSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OverdueSweepService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  onModuleInit() {
    void this.runSweep();
    this.timer = setInterval(() => {
      void this.runSweep();
    }, SIX_HOURS_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runSweep(): Promise<void> {
    try {
      const overdueRows = await this.prisma.client.attendance.findMany({
        where: overdueAttendanceWhere(),
        select: {
          id: true,
          submittedAt: true,
          student: {
            select: {
              blockId: true,
              establishmentId: true,
              user: { select: { name: true } },
            },
          },
          trainingAssignment: {
            select: { blockId: true, establishmentId: true },
          },
        },
      });
      if (overdueRows.length === 0) return;

      const [coordinators, blocks, supervisors] = await Promise.all([
        this.prisma.client.coordinator.findMany({
          select: { id: true, userId: true },
        }),
        this.prisma.client.block.findMany({
          select: { id: true, coordinatorId: true },
        }),
        this.prisma.client.supervisor.findMany({
          select: { userId: true, establishmentId: true },
        }),
      ]);

      const allCoordinatorUserIds = coordinators.map((c) => c.userId);
      const coordinatorUserIdById = new Map(
        coordinators.map((c) => [c.id, c.userId]),
      );
      const blockCoordinatorId = new Map(
        blocks.map((b) => [b.id, b.coordinatorId]),
      );
      const supervisorUserIdsByEstablishment = new Map<string, string[]>();
      for (const s of supervisors) {
        const list =
          supervisorUserIdsByEstablishment.get(s.establishmentId) ?? [];
        list.push(s.userId);
        supervisorUserIdsByEstablishment.set(s.establishmentId, list);
      }

      for (const row of overdueRows) {
        const blockId = row.trainingAssignment?.blockId ?? row.student.blockId;
        const establishmentId =
          row.trainingAssignment?.establishmentId ??
          row.student.establishmentId;
        const days = daysPending(row);
        const studentName = row.student.user.name;
        // Keyed on submittedAt: re-running the sweep for the same still-open
        // overdue row is a no-op (same key, same recipients), but a row that
        // was resubmitted (new submittedAt) and later goes overdue again
        // gets a fresh key and alerts again, rather than being silently
        // swallowed by the first, now-stale alert's row.
        const dedupeKey = `overdue:${row.id}:${row.submittedAt.toISOString()}`;

        const blockCoordinatorRowId = blockId
          ? blockCoordinatorId.get(blockId)
          : undefined;
        const coordinatorUserIds = blockCoordinatorRowId
          ? [coordinatorUserIdById.get(blockCoordinatorRowId)].filter(
              (id): id is string => !!id,
            )
          : allCoordinatorUserIds;

        if (coordinatorUserIds.length > 0) {
          await this.notifications.notify(this.prisma.client, {
            userIds: coordinatorUserIds,
            type: 'ATTENDANCE_OVERDUE',
            title: 'Attendance verification overdue',
            body: `${studentName}'s attendance entry has been pending for ${days} days. Follow up with the establishment.`,
            link: '/coordinator/attendance',
            entityType: 'Attendance',
            entityId: row.id,
            dedupeKey,
          });
        }

        const supervisorUserIds = establishmentId
          ? (supervisorUserIdsByEstablishment.get(establishmentId) ?? [])
          : [];
        if (supervisorUserIds.length > 0) {
          await this.notifications.notify(this.prisma.client, {
            userIds: supervisorUserIds,
            type: 'ATTENDANCE_OVERDUE',
            title: 'Attendance entry overdue',
            body: `${studentName}'s attendance entry has been waiting ${days} days for review.`,
            link: '/supervisor/attendance',
            entityType: 'Attendance',
            entityId: row.id,
            dedupeKey,
          });
        }
      }

      this.logger.log(
        `Overdue sweep: ${overdueRows.length} PENDING attendance record(s) past ${overdueRows.length === 1 ? 'its' : 'their'} 21-day window.`,
      );
    } catch (err) {
      // Never let a failed sweep take the caller down with it — both the
      // interval timer and the dashboard request that also triggers this
      // must keep working regardless.
      this.logger.error(
        `Overdue sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
