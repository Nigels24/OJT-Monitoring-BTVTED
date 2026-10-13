import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ConcernCategory,
  ConcernStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

export interface CoordinatorConcernFilters {
  scope?: 'block' | 'all';
  status?: ConcernStatus;
  /** One placement's history — the Student Details dialog. */
  assignmentId?: string;
}

const CATEGORY_LABEL: Record<ConcernCategory, string> = {
  CONDUCT: 'conduct',
  PERFORMANCE: 'performance',
  ATTENDANCE: 'attendance',
  OTHER: 'other',
};

/** What every list and detail view of a concern shows. */
const CONCERN_INCLUDE = {
  student: {
    select: {
      id: true,
      studentIdNumber: true,
      user: { select: { name: true } },
    },
  },
  trainingAssignment: {
    select: {
      id: true,
      status: true,
      academicYear: true,
      establishment: { select: { id: true, name: true } },
      block: { select: { id: true, name: true } },
    },
  },
  respondedBy: { select: { id: true, user: { select: { name: true } } } },
} as const;

/**
 * A supervisor's concern about a trainee, raised to the coordinator and
 * recorded against the placement.
 *
 * A concern is a record, not a chat message: it has a category, a status and a
 * coordinator's response, it is never touched by the 30-day message retention
 * sweep, and there is no delete route. The student has no endpoint that reads
 * one — there is no student controller in this module at all.
 */
@Injectable()
export class ConcernService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /* ---------------------------------------------------------------------
   * Supervisor
   * ------------------------------------------------------------------ */

  /**
   * Raises a concern about a trainee placed at the supervisor's own
   * establishment.
   *
   * Scoped by the *assignment's* establishment, never the student's current
   * one (CLAUDE.md §2), and not limited to ACTIVE placements: something that
   * comes to light just after a trainee leaves is still about their time here.
   */
  async raise(
    userId: string,
    data: {
      assignmentId: string;
      category: ConcernCategory;
      description: string;
    },
  ) {
    const supervisor = await this.prisma.client.supervisor.findUnique({
      where: { userId },
      select: {
        id: true,
        establishmentId: true,
        user: { select: { name: true } },
      },
    });
    if (!supervisor) {
      throw new NotFoundException('Supervisor profile not found');
    }

    const assignment = await this.prisma.client.trainingAssignment.findUnique({
      where: { id: data.assignmentId },
      select: {
        id: true,
        studentId: true,
        establishmentId: true,
        blockId: true,
        student: {
          select: { blockId: true, user: { select: { name: true } } },
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Training assignment not found');
    }
    if (assignment.establishmentId !== supervisor.establishmentId) {
      throw new ForbiddenException(
        'This trainee is placed at a different establishment',
      );
    }

    const recipients = await this.coordinatorRecipients(
      assignment.blockId ?? assignment.student.blockId,
    );

    const created = await this.prisma.client.$transaction(async (tx) => {
      const concern = await tx.concern.create({
        data: {
          trainingAssignmentId: assignment.id,
          studentId: assignment.studentId,
          raisedById: supervisor.id,
          raisedByName: supervisor.user.name,
          category: data.category,
          description: data.description,
        },
        include: CONCERN_INCLUDE,
      });

      // Committed with the concern, so a coordinator is never sent to one
      // that rolled back.
      await this.notifications.notify(tx, {
        userIds: recipients,
        type: 'CONCERN_RAISED',
        title: 'New concern raised',
        body: `${supervisor.user.name} raised a ${CATEGORY_LABEL[data.category]} concern about ${assignment.student.user.name}.`,
        link: '/coordinator/concerns',
        entityType: 'Concern',
        entityId: concern.id,
        // Each concern is its own new row, so the id alone is a fresh event.
        dedupeKey: `CONCERN_RAISED:${concern.id}`,
      });

      return concern;
    });

    return created;
  }

  /**
   * The concerns this supervisor raised, newest first, with the coordinator's
   * status and response. Authorship, not establishment: a colleague's concern
   * is between them and the coordinator.
   */
  async listMine(userId: string) {
    const supervisor = await this.prisma.client.supervisor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!supervisor) {
      throw new NotFoundException('Supervisor profile not found');
    }

    return this.prisma.client.concern.findMany({
      where: { raisedById: supervisor.id },
      include: CONCERN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /* ---------------------------------------------------------------------
   * Coordinator
   * ------------------------------------------------------------------ */

  /**
   * Every concern, newest first. `scope: 'block'` (the default) narrows to the
   * coordinator's own blocks and falls back to the whole programme with
   * `noBlocksAssigned` — a view default, not an authorization boundary
   * (CLAUDE.md §2). Asking for one placement's history ignores the scope: the
   * coordinator is already looking at that placement.
   */
  async listForCoordinator(userId: string, filters: CoordinatorConcernFilters) {
    const { where, noBlocksAssigned } = await this.coordinatorWhere(
      userId,
      filters.assignmentId ? { ...filters, scope: 'all' } : filters,
    );

    const concerns = await this.prisma.client.concern.findMany({
      where: {
        ...where,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.assignmentId
          ? { trainingAssignmentId: filters.assignmentId }
          : {}),
      },
      include: CONCERN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return { noBlocksAssigned, concerns };
  }

  /** The dashboard tile: concerns still OPEN, in the same scope as the list. */
  async countOpen(userId: string, scope: 'block' | 'all') {
    const { where, noBlocksAssigned } = await this.coordinatorWhere(userId, {
      scope,
    });
    const count = await this.prisma.client.concern.count({
      where: { ...where, status: 'OPEN' },
    });
    return { count, noBlocksAssigned };
  }

  /**
   * Acknowledges or resolves a concern, with an optional written response.
   *
   * Any coordinator may respond, as with every other coordinator write (§2).
   * A concern never goes back to OPEN. Saving the same status and response
   * again changes nothing and notifies no one; a real change restamps
   * `respondedById`/`respondedAt` and notifies the supervisor who raised it.
   */
  async respond(
    userId: string,
    concernId: string,
    data: { status: 'ACKNOWLEDGED' | 'RESOLVED'; response?: string | null },
  ) {
    const coordinator = await this.prisma.client.coordinator.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!coordinator) {
      throw new NotFoundException('Coordinator profile not found');
    }

    const concern = await this.prisma.client.concern.findUnique({
      where: { id: concernId },
      include: {
        ...CONCERN_INCLUDE,
        raisedBy: { select: { userId: true } },
      },
    });
    if (!concern) {
      throw new NotFoundException('Concern not found');
    }

    // `undefined` = response not in the request, leave it as it is.
    const response =
      data.response === undefined ? concern.coordinatorResponse : data.response;
    const { raisedBy, ...current } = concern;
    if (
      concern.status === data.status &&
      concern.coordinatorResponse === response
    ) {
      return current;
    }

    const respondedAt = new Date();
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.concern.update({
        where: { id: concernId },
        data: {
          status: data.status,
          coordinatorResponse: response,
          respondedById: coordinator.id,
          respondedAt,
        },
        include: CONCERN_INCLUDE,
      });

      // Nobody to tell if the supervisor's account has since been deleted.
      if (raisedBy) {
        await this.notifications.notify(tx, {
          userIds: [raisedBy.userId],
          type: 'CONCERN_RESPONDED',
          title:
            data.status === 'RESOLVED'
              ? 'Your concern was resolved'
              : 'Your concern was acknowledged',
          body: `The coordinator ${data.status === 'RESOLVED' ? 'resolved' : 'acknowledged'} your concern about ${concern.student.user.name}.${response ? ` Response: ${response}` : ''}`,
          link: '/supervisor/dashboard',
          entityType: 'Concern',
          entityId: concernId,
          // `respondedAt` only moves on a real change (see the no-op above),
          // so a repeated save never reaches here, while a later status
          // change or a corrected response is a new event.
          dedupeKey: `CONCERN_RESPONDED:${concernId}:${respondedAt.toISOString()}`,
        });
      }

      return updated;
    });
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  /**
   * Who hears about a new concern: the coordinator of the trainee's block, or
   * every coordinator when the placement has no block or the block has no
   * coordinator — the same routing `OverdueSweepService` uses.
   */
  private async coordinatorRecipients(
    blockId: string | null,
  ): Promise<string[]> {
    if (blockId) {
      const block = await this.prisma.client.block.findUnique({
        where: { id: blockId },
        select: { coordinator: { select: { userId: true } } },
      });
      if (block?.coordinator) return [block.coordinator.userId];
    }
    const coordinators = await this.prisma.client.coordinator.findMany({
      select: { userId: true },
    });
    return coordinators.map((coordinator) => coordinator.userId);
  }

  /** The block scope, matching either side that may carry the block (§2). */
  private async coordinatorWhere(
    userId: string,
    filters: { scope?: 'block' | 'all' },
  ): Promise<{ where: Prisma.ConcernWhereInput; noBlocksAssigned: boolean }> {
    const coordinator = await this.prisma.client.coordinator.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!coordinator) {
      throw new NotFoundException('Coordinator profile not found');
    }
    if (filters.scope === 'all') {
      return { where: {}, noBlocksAssigned: false };
    }

    const ownBlocks = await this.prisma.client.block.findMany({
      where: { coordinatorId: coordinator.id },
      select: { id: true },
    });
    if (ownBlocks.length === 0) {
      return { where: {}, noBlocksAssigned: true };
    }
    const blockIds = ownBlocks.map((block) => block.id);
    return {
      noBlocksAssigned: false,
      where: {
        OR: [
          { trainingAssignment: { blockId: { in: blockIds } } },
          { student: { blockId: { in: blockIds } } },
        ],
      },
    };
  }
}
