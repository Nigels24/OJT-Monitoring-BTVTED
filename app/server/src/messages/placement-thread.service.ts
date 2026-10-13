import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = Prisma.TransactionClient | PrismaService['client'];

/**
 * `Conversation.createdBy` for a placement thread. The column is a plain
 * string, not a foreign key, and no person starts these threads — recording a
 * placement does.
 */
const SYSTEM_CREATOR = 'system';

/** "<Student name> — <Establishment>", derived at read time so renames show. */
export function placementThreadName(
  studentName: string,
  establishmentName: string,
): string {
  return `${studentName} — ${establishmentName}`;
}

/**
 * The group thread every placement has: one `Conversation` per
 * `TrainingAssignment` (`trainingAssignmentId` is unique), in which the
 * student, every supervisor at the establishment and every coordinator take
 * part and all see every message.
 *
 * This service only decides that a thread exists and who is in it. Reading and
 * sending go through `MessagesService` like any other conversation, which is
 * also where participation is checked and where a thread whose placement has
 * ended refuses new messages.
 *
 * Membership is kept in step three ways:
 * - `createForAssignment` — called inside `createPlacement`'s transaction, so a
 *   placement and its thread commit together.
 * - `addSupervisor` — called when a supervisor account is created.
 * - `syncAll` — on every boot, idempotently. It is the backfill for placements
 *   that predate this table, and the only hook for a coordinator account,
 *   which is created by the seed/CLI scripts outside the running app.
 *
 * Removal needs nothing here: deleting a supervisor or student already removes
 * their participant rows (`cascade-delete.ts`).
 */
@Injectable()
export class PlacementThreadService implements OnModuleInit {
  private readonly logger = new Logger(PlacementThreadService.name);

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    void this.syncAll();
  }

  /**
   * Creates the thread for a placement that has just been recorded. Takes the
   * caller's `tx` so the two cannot commit apart. Queries are sequential — an
   * interactive transaction is one connection (CLAUDE.md §6).
   */
  async createForAssignment(
    tx: Client,
    assignment: { id: string; studentUserId: string; establishmentId: string },
  ): Promise<void> {
    const supervisors = await tx.supervisor.findMany({
      where: { establishmentId: assignment.establishmentId },
      select: { userId: true },
    });
    const coordinators = await tx.coordinator.findMany({
      select: { userId: true },
    });
    const userIds = [
      ...new Set([
        assignment.studentUserId,
        ...supervisors.map((s) => s.userId),
        ...coordinators.map((c) => c.userId),
      ]),
    ];

    await tx.conversation.create({
      data: {
        isGroup: true,
        createdBy: SYSTEM_CREATOR,
        trainingAssignmentId: assignment.id,
        participants: { create: userIds.map((userId) => ({ userId })) },
      },
    });
  }

  /**
   * Adds a newly created supervisor to the threads of every ACTIVE placement
   * at their establishment. Ended placements are left alone — their threads
   * are read-only history the new supervisor was never part of.
   */
  async addSupervisor(
    client: Client,
    supervisor: { userId: string; establishmentId: string },
  ): Promise<void> {
    const threads = await client.conversation.findMany({
      where: {
        trainingAssignment: {
          status: 'ACTIVE',
          establishmentId: supervisor.establishmentId,
        },
      },
      select: { id: true },
    });
    if (threads.length === 0) return;

    await client.conversationParticipant.createMany({
      data: threads.map((thread) => ({
        conversationId: thread.id,
        userId: supervisor.userId,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Makes sure every ACTIVE placement has its thread and that each thread has
   * everyone who should be in it. Additive and idempotent: a thread that
   * exists is never recreated (the unique `trainingAssignmentId` guarantees
   * it even if two instances boot at once), and participants are added with
   * `skipDuplicates`.
   *
   * Never throws — it runs unattended at boot, and a failed sync must not stop
   * the server starting. It is retried on the next boot.
   */
  async syncAll(): Promise<void> {
    try {
      const assignments = await this.prisma.client.trainingAssignment.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          establishmentId: true,
          student: { select: { userId: true } },
          conversation: { select: { id: true } },
        },
      });
      if (assignments.length === 0) return;

      const [supervisors, coordinators] = await Promise.all([
        this.prisma.client.supervisor.findMany({
          select: { userId: true, establishmentId: true },
        }),
        this.prisma.client.coordinator.findMany({ select: { userId: true } }),
      ]);
      const coordinatorUserIds = coordinators.map((c) => c.userId);
      const supervisorUserIdsByEstablishment = new Map<string, string[]>();
      for (const supervisor of supervisors) {
        const list =
          supervisorUserIdsByEstablishment.get(supervisor.establishmentId) ??
          [];
        list.push(supervisor.userId);
        supervisorUserIdsByEstablishment.set(supervisor.establishmentId, list);
      }
      const expectedUserIds = (assignment: (typeof assignments)[number]) => [
        ...new Set([
          assignment.student.userId,
          ...(supervisorUserIdsByEstablishment.get(
            assignment.establishmentId,
          ) ?? []),
          ...coordinatorUserIds,
        ]),
      ];

      let created = 0;
      const memberships: { conversationId: string; userId: string }[] = [];
      for (const assignment of assignments) {
        const userIds = expectedUserIds(assignment);
        if (assignment.conversation) {
          for (const userId of userIds) {
            memberships.push({
              conversationId: assignment.conversation.id,
              userId,
            });
          }
          continue;
        }
        try {
          await this.prisma.client.conversation.create({
            data: {
              isGroup: true,
              createdBy: SYSTEM_CREATOR,
              trainingAssignmentId: assignment.id,
              participants: { create: userIds.map((userId) => ({ userId })) },
            },
          });
          created += 1;
        } catch (err) {
          // Most likely another instance created it first (unique violation);
          // either way one placement must not stop the rest.
          this.logger.warn(
            `Placement thread for assignment ${assignment.id} was not created: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }

      const added =
        memberships.length > 0
          ? (
              await this.prisma.client.conversationParticipant.createMany({
                data: memberships,
                skipDuplicates: true,
              })
            ).count
          : 0;

      if (created > 0 || added > 0) {
        this.logger.log(
          `Placement thread sync: created ${created} thread(s), added ${added} missing participant(s).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Placement thread sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
