import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AnnouncementAudience } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  AnnouncementTarget,
  AnnouncementViewer,
  announcementWhereFor,
  distinctIds,
  isAnnouncementVisibleTo,
} from '../common/announcement-audience';

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  /** `null` = not limited by block / program. */
  blockId?: string | null;
  courseId?: string | null;
}

const ANNOUNCEMENT_INCLUDE = {
  block: { select: { id: true, name: true } },
  course: { select: { id: true, code: true, name: true } },
  postedBy: { select: { id: true, user: { select: { name: true } } } },
} as const;

/**
 * Coordinator announcements to students, supervisors or both, optionally
 * limited to a block and/or a program.
 *
 * Not messages: an announcement is kept until a coordinator deletes it and is
 * never touched by the message retention sweep. Who one reaches is the single
 * rule in `common/announcement-audience.ts`, used here both to filter what a
 * viewer lists and to pick who is notified when one is posted.
 */
@Injectable()
export class AnnouncementService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /* ---------------------------------------------------------------------
   * Coordinator
   * ------------------------------------------------------------------ */

  /** Every announcement, newest first, with how many people have read each. */
  async listForCoordinator() {
    const announcements = await this.prisma.client.announcement.findMany({
      include: { ...ANNOUNCEMENT_INCLUDE, _count: { select: { reads: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return announcements.map(({ _count, ...announcement }) => ({
      ...announcement,
      readCount: _count.reads,
    }));
  }

  /**
   * Posts an announcement and notifies everyone it targets, once.
   *
   * The notification is committed with the announcement. Its dedupeKey is the
   * announcement id alone, so editing an announcement later never notifies
   * again — and a user who only comes into its audience afterwards still sees
   * it in their list, just without a bell.
   */
  async create(userId: string, data: AnnouncementInput) {
    const coordinator = await this.getCoordinatorByUserId(userId);
    const target = await this.resolveTarget(data);
    const recipients = await this.recipientUserIds(target);

    return this.prisma.client.$transaction(async (tx) => {
      const announcement = await tx.announcement.create({
        data: {
          title: data.title,
          body: data.body,
          ...target,
          postedById: coordinator.id,
        },
        include: ANNOUNCEMENT_INCLUDE,
      });

      const notification = {
        type: 'ANNOUNCEMENT_POSTED' as const,
        title: 'New announcement',
        body: announcement.title,
        entityType: 'Announcement',
        entityId: announcement.id,
        dedupeKey: `ANNOUNCEMENT_POSTED:${announcement.id}`,
      };
      // Two calls, not one: a student and a supervisor land on different
      // role-gated routes, so `link` cannot be shared.
      await this.notifications.notify(tx, {
        ...notification,
        userIds: recipients.students,
        link: '/student/dashboard',
      });
      await this.notifications.notify(tx, {
        ...notification,
        userIds: recipients.supervisors,
        link: '/supervisor/dashboard',
      });

      return { ...announcement, readCount: 0 };
    });
  }

  /**
   * Edits an announcement. Changing the audience changes who lists it from
   * now on; nobody is notified again, and existing read receipts are kept.
   */
  async update(announcementId: string, data: Partial<AnnouncementInput>) {
    const existing = await this.prisma.client.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    const target = await this.resolveTarget({
      audience: data.audience ?? existing.audience,
      blockId: data.blockId === undefined ? existing.blockId : data.blockId,
      courseId: data.courseId === undefined ? existing.courseId : data.courseId,
    });

    const updated = await this.prisma.client.announcement.update({
      where: { id: announcementId },
      data: { title: data.title, body: data.body, ...target },
      include: { ...ANNOUNCEMENT_INCLUDE, _count: { select: { reads: true } } },
    });
    const { _count, ...announcement } = updated;
    return { ...announcement, readCount: _count.reads };
  }

  /**
   * Deletes an announcement. Its read receipts go first and explicitly —
   * `AnnouncementRead` has no `onDelete: Cascade` (CLAUDE.md §6).
   */
  async remove(announcementId: string) {
    const existing = await this.prisma.client.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.announcementRead.deleteMany({ where: { announcementId } });
      await tx.announcement.delete({ where: { id: announcementId } });
    });
    return { id: announcementId, deleted: true };
  }

  /* ---------------------------------------------------------------------
   * Students and supervisors
   * ------------------------------------------------------------------ */

  /**
   * The announcements addressed to the caller, newest first, each flagged
   * read or unread. Filtered in the query by their role and their own block
   * and program — never by anything the request sends.
   */
  async listForViewer(userId: string, role: string) {
    const viewer = await this.getViewer(userId, role);
    const announcements = await this.prisma.client.announcement.findMany({
      where: announcementWhereFor(viewer),
      include: {
        ...ANNOUNCEMENT_INCLUDE,
        reads: { where: { userId }, select: { readAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = announcements.map(({ reads, ...announcement }) => ({
      ...announcement,
      readAt: reads[0]?.readAt ?? null,
    }));
    return {
      unreadCount: items.filter((item) => item.readAt === null).length,
      items,
    };
  }

  /**
   * Marks one announcement read. 404 unless it is addressed to the caller —
   * the same answer whether it does not exist or is for someone else, so an
   * id cannot be probed.
   */
  async markRead(userId: string, role: string, announcementId: string) {
    const viewer = await this.getViewer(userId, role);
    const announcement = await this.prisma.client.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true, audience: true, blockId: true, courseId: true },
    });
    if (!announcement || !isAnnouncementVisibleTo(announcement, viewer)) {
      throw new NotFoundException('Announcement not found');
    }

    // Idempotent: a second click leaves the first read time in place.
    const read = await this.prisma.client.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId },
      update: {},
    });
    return { id: announcementId, readAt: read.readAt };
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  /** Checks the optional block/program exist and normalises absent to `null`. */
  private async resolveTarget(data: {
    audience: AnnouncementAudience;
    blockId?: string | null;
    courseId?: string | null;
  }): Promise<AnnouncementTarget> {
    const blockId = data.blockId ?? null;
    const courseId = data.courseId ?? null;

    if (blockId) {
      const block = await this.prisma.client.block.findUnique({
        where: { id: blockId },
        select: { courseId: true },
      });
      if (!block) {
        throw new BadRequestException('blockId does not match a block');
      }
      // Both filters must match, so a block outside the chosen program would
      // be an announcement nobody can ever receive.
      if (courseId && block.courseId !== courseId) {
        throw new BadRequestException(
          'That block does not belong to the selected program',
        );
      }
    }
    if (courseId) {
      const course = await this.prisma.client.course.findUnique({
        where: { id: courseId },
        select: { id: true },
      });
      if (!course) {
        throw new BadRequestException('courseId does not match a program');
      }
    }

    return { audience: data.audience, blockId, courseId };
  }

  /**
   * The caller as the audience rule sees them. A student's blocks are their
   * own record's and their active placement's; a supervisor's are those of the
   * trainees actively placed at their establishment.
   */
  private async getViewer(
    userId: string,
    role: string,
  ): Promise<AnnouncementViewer> {
    if (role === 'STUDENT') {
      const student = await this.prisma.client.student.findUnique({
        where: { userId },
        select: {
          blockId: true,
          courseId: true,
          trainingAssignments: {
            where: { status: 'ACTIVE' },
            select: { blockId: true },
          },
        },
      });
      if (!student) {
        throw new NotFoundException('Student profile not found');
      }
      return {
        role: 'STUDENT',
        blockIds: distinctIds([
          student.blockId,
          ...student.trainingAssignments.map((a) => a.blockId),
        ]),
        courseIds: distinctIds([student.courseId]),
      };
    }

    const supervisor = await this.prisma.client.supervisor.findUnique({
      where: { userId },
      select: { establishmentId: true },
    });
    if (!supervisor) {
      throw new NotFoundException('Supervisor profile not found');
    }
    const trainees = await this.prisma.client.trainingAssignment.findMany({
      where: { establishmentId: supervisor.establishmentId, status: 'ACTIVE' },
      select: TRAINEE_SELECT,
    });
    return supervisorViewer(trainees);
  }

  /**
   * Everyone an announcement targets, as user ids split by role — decided by
   * the same `isAnnouncementVisibleTo` the lists are filtered with. Two flat
   * queries per role, grouped in memory (CLAUDE.md §8).
   */
  private async recipientUserIds(target: AnnouncementTarget) {
    const students =
      target.audience === 'SUPERVISORS'
        ? []
        : await this.prisma.client.student.findMany({
            select: {
              userId: true,
              blockId: true,
              courseId: true,
              trainingAssignments: {
                where: { status: 'ACTIVE' },
                select: { blockId: true },
              },
            },
          });

    const supervisors =
      target.audience === 'STUDENTS'
        ? []
        : await this.prisma.client.supervisor.findMany({
            select: { userId: true, establishmentId: true },
          });
    const trainees =
      supervisors.length === 0
        ? []
        : await this.prisma.client.trainingAssignment.findMany({
            where: { status: 'ACTIVE' },
            select: { ...TRAINEE_SELECT, establishmentId: true },
          });
    const traineesByEstablishment = new Map<string, typeof trainees>();
    for (const trainee of trainees) {
      const list = traineesByEstablishment.get(trainee.establishmentId) ?? [];
      list.push(trainee);
      traineesByEstablishment.set(trainee.establishmentId, list);
    }

    return {
      students: students
        .filter((student) =>
          isAnnouncementVisibleTo(target, {
            role: 'STUDENT',
            blockIds: distinctIds([
              student.blockId,
              ...student.trainingAssignments.map((a) => a.blockId),
            ]),
            courseIds: distinctIds([student.courseId]),
          }),
        )
        .map((student) => student.userId),
      supervisors: supervisors
        .filter((supervisor) =>
          isAnnouncementVisibleTo(
            target,
            supervisorViewer(
              traineesByEstablishment.get(supervisor.establishmentId) ?? [],
            ),
          ),
        )
        .map((supervisor) => supervisor.userId),
    };
  }

  private async getCoordinatorByUserId(userId: string) {
    const coordinator = await this.prisma.client.coordinator.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!coordinator) {
      throw new NotFoundException('Coordinator profile not found');
    }
    return coordinator;
  }
}

/** What a supervisor's audience match needs from each active trainee. */
const TRAINEE_SELECT = {
  blockId: true,
  student: { select: { blockId: true, courseId: true } },
} as const;

function supervisorViewer(
  trainees: ReadonlyArray<{
    blockId: string | null;
    student: { blockId: string | null; courseId: string | null };
  }>,
): AnnouncementViewer {
  return {
    role: 'SUPERVISOR',
    blockIds: distinctIds(
      trainees.flatMap((trainee) => [trainee.blockId, trainee.student.blockId]),
    ),
    courseIds: distinctIds(trainees.map((trainee) => trainee.student.courseId)),
  };
}
