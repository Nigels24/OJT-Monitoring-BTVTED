import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { formatDateOnly, manilaToday, startOfUtcDay } from '../common/dates';
import {
  buildStorageName,
  MAX_UPLOAD_SIZE_BYTES,
  validateUpload,
} from '../common/file-upload';
import { buildObjectPath, deleteFile, uploadFile } from '../common/storage';
import { signedUrlOrNull } from '../common/signed-url';
import {
  MAX_TASK_PHOTOS,
  assertCanMarkDone,
  assertCanUndo,
  assertDueDate,
  assertEditable,
  assertRatable,
  ratingChanged,
  resolveWeek,
  summariseWeek,
  weekStartOf,
} from '../common/weekly-tasks';

/** Where proof photos live inside the shared private bucket. */
const STORAGE_PREFIX = 'weekly-tasks';

/** The CODE segment of the system-applied filename (`..._TASK_...`). */
const STORAGE_CODE = 'TASK';

export interface CreateWeeklyTaskInput {
  assignmentId: string;
  /** Any day of the week the task belongs to; stored as that week's Monday. */
  weekStart: string;
  title: string;
  description?: string;
  dueDate: string;
}

export interface UpdateWeeklyTaskInput {
  title?: string;
  /** `null` = explicitly cleared; `undefined` = not supplied, leave unchanged. */
  description?: string | null;
  dueDate?: string;
}

const PHOTO_SELECT = {
  id: true,
  storagePath: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  sortOrder: true,
  uploadedAt: true,
} as const;

/** A task as every role's week view renders it. */
const TASK_INCLUDE = {
  supervisor: { select: { id: true, user: { select: { name: true } } } },
  photos: { select: PHOTO_SELECT, orderBy: { sortOrder: 'asc' } },
} as const;

/**
 * The placement a week of tasks belongs to, with everything the printed
 * report's header needs: who the trainee is, their program, year level and
 * block, and where they are placed.
 */
const ASSIGNMENT_SELECT = {
  id: true,
  studentId: true,
  establishmentId: true,
  status: true,
  academicYear: true,
  yearLevel: true,
  startDate: true,
  endDate: true,
  establishment: { select: { id: true, name: true } },
  block: { select: { id: true, name: true } },
  student: {
    select: {
      id: true,
      userId: true,
      studentIdNumber: true,
      lastName: true,
      course: true,
      user: { select: { name: true } },
      enrolledCourse: { select: { code: true, name: true } },
      block: { select: { id: true, name: true } },
    },
  },
} as const;

/**
 * Weekly tasks for all three roles: the supervisor assigns and rates, the
 * student marks done with proof, the coordinator reads.
 *
 * One service behind three role-prefixed controllers, the same shape as
 * `JournalService` — a task is the same record whoever is looking at it, so its
 * ownership and status rules live in one place. The status and week rules
 * themselves are the pure functions in `common/weekly-tasks.ts`.
 *
 * Nothing here reads or writes `Evaluation` or `TrainingAssignment
 * .coordinatorGrade`: a weekly rating is its own figure (CLAUDE.md §14).
 */
@Injectable()
export class WeeklyTaskService {
  private readonly logger = new Logger(WeeklyTaskService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /* ---------------------------------------------------------------------
   * Supervisor
   * ------------------------------------------------------------------ */

  /**
   * One trainee's week, for a placement at this supervisor's establishment.
   *
   * Any status of assignment, not only ACTIVE: a trainee who has since
   * transferred or finished still has the weeks they worked here, and the
   * supervisor who assigned them must be able to rate and print those.
   */
  async listForSupervisor(userId: string, assignmentId: string, week?: string) {
    const supervisor = await this.getSupervisorByUserId(userId);
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    this.assertAtEstablishment(assignment, supervisor.establishmentId);
    return this.buildWeek(assignment, week);
  }

  /**
   * Assigns one task for one week. Only for an ACTIVE placement at the
   * supervisor's own establishment — a closed placement has no upcoming week
   * to assign work for.
   */
  async create(userId: string, data: CreateWeeklyTaskInput) {
    const supervisor = await this.getSupervisorByUserId(userId);
    const assignment = await this.getAssignmentOrThrow(data.assignmentId);
    this.assertAtEstablishment(assignment, supervisor.establishmentId);
    this.assertActive(assignment);

    const weekStart = weekStartOf(data.weekStart);
    if (Number.isNaN(weekStart.getTime())) {
      throw new BadRequestException('weekStart is not a valid date');
    }
    const dueDate = startOfUtcDay(data.dueDate);
    assertDueDate(dueDate, weekStart, assignment.startDate);

    const created = await this.prisma.client.$transaction(async (tx) => {
      const task = await tx.weeklyTask.create({
        data: {
          trainingAssignmentId: assignment.id,
          studentId: assignment.studentId,
          supervisorId: supervisor.id,
          weekStart,
          title: data.title,
          description: data.description,
          dueDate,
        },
        include: TASK_INCLUDE,
      });

      // Committed with the task: a notification for a task that then rolled
      // back would send the student to nothing.
      await this.notifications.notify(tx, {
        userIds: [assignment.student.userId],
        type: 'WEEKLY_TASK_ASSIGNED',
        title: 'New weekly task assigned',
        body: `Your supervisor assigned "${task.title}", due ${formatDateOnly(dueDate)}.`,
        link: `/student/weekly-tasks?week=${dateKey(weekStart)}`,
        entityType: 'WeeklyTask',
        entityId: task.id,
        // Each task is its own new row, so the id alone is already a fresh
        // event — the same call as PLACEMENT_RECORDED's dedupeKey. An edit
        // does not notify again.
        dedupeKey: `WEEKLY_TASK_ASSIGNED:${task.id}`,
      });

      return task;
    });

    return this.toTask(created);
  }

  /** Edits a task the trainee has not acted on yet. */
  async update(userId: string, taskId: string, data: UpdateWeeklyTaskInput) {
    const supervisor = await this.getSupervisorByUserId(userId);
    const task = await this.getTaskOrThrow(taskId);
    this.assertAtEstablishment(
      task.trainingAssignment,
      supervisor.establishmentId,
    );
    this.assertActive(task.trainingAssignment);
    assertEditable(task.status);

    const dueDate =
      data.dueDate === undefined ? undefined : startOfUtcDay(data.dueDate);
    if (dueDate) {
      assertDueDate(
        dueDate,
        startOfUtcDay(task.weekStart),
        task.trainingAssignment.startDate,
      );
    }

    const updated = await this.prisma.client.weeklyTask.update({
      where: { id: taskId },
      data: {
        title: data.title,
        description: data.description,
        dueDate,
      },
      include: TASK_INCLUDE,
    });
    return this.toTask(updated);
  }

  /** Deletes a task the trainee has not acted on yet. */
  async remove(userId: string, taskId: string) {
    const supervisor = await this.getSupervisorByUserId(userId);
    const task = await this.getTaskOrThrow(taskId);
    this.assertAtEstablishment(
      task.trainingAssignment,
      supervisor.establishmentId,
    );
    this.assertActive(task.trainingAssignment);
    assertEditable(task.status);

    // An ASSIGNED task has no photos (undoing "done" removes them), but the
    // rows are deleted explicitly anyway: WeeklyTaskPhoto has no
    // onDelete: Cascade, so a stray one would abort the delete below.
    await this.prisma.client.$transaction(async (tx) => {
      await tx.weeklyTaskPhoto.deleteMany({ where: { weeklyTaskId: taskId } });
      await tx.weeklyTask.delete({ where: { id: taskId } });
    });
    await this.deleteStoredObjects(task.photos.map((p) => p.storagePath));

    return { id: taskId, deleted: true };
  }

  /**
   * Rates a task the trainee has marked done, 1-5 with an optional comment —
   * or corrects a rating already given.
   *
   * Not limited to ACTIVE placements, unlike assigning: work done before a
   * transfer can still be waiting for its rating, and only this establishment
   * can give it (the same reasoning as stranded PENDING attendance).
   *
   * A repeat of the stored rating and comment changes nothing and notifies no
   * one; a real change restamps `ratedAt` and notifies the student again.
   */
  async rate(
    userId: string,
    taskId: string,
    data: { rating: number; comment?: string | null },
  ) {
    const supervisor = await this.getSupervisorByUserId(userId);
    const task = await this.getTaskOrThrow(taskId);
    this.assertAtEstablishment(
      task.trainingAssignment,
      supervisor.establishmentId,
    );
    assertRatable(task.status);

    // `undefined` = comment not in the request, leave it as it is.
    const comment =
      data.comment === undefined ? task.ratingComment : data.comment;
    const isCorrection = task.status === 'RATED';
    if (
      isCorrection &&
      !ratingChanged(task, { rating: data.rating, comment })
    ) {
      // Re-read in the list's own shape rather than returning the row above,
      // which carries the whole assignment for the checks.
      return this.toTask(
        await this.prisma.client.weeklyTask.findUniqueOrThrow({
          where: { id: taskId },
          include: TASK_INCLUDE,
        }),
      );
    }

    const ratedAt = new Date();
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const saved = await tx.weeklyTask.update({
        where: { id: taskId },
        data: {
          status: 'RATED',
          rating: data.rating,
          ratingComment: comment,
          ratedAt,
        },
        include: TASK_INCLUDE,
      });

      await this.notifications.notify(tx, {
        userIds: [task.trainingAssignment.student.userId],
        type: 'WEEKLY_TASK_RATED',
        title: isCorrection
          ? 'Weekly task rating updated'
          : 'Weekly task rated',
        body: `Your supervisor ${isCorrection ? 'updated the rating for' : 'rated'} "${task.title}": ${data.rating} out of 5.`,
        link: `/student/weekly-tasks?week=${dateKey(task.weekStart)}`,
        entityType: 'WeeklyTask',
        entityId: taskId,
        // `ratedAt` only moves on a real change (see `ratingChanged` above),
        // so a double-clicked save never reaches here, while a correction is
        // a new event and notifies again.
        dedupeKey: `WEEKLY_TASK_RATED:${taskId}:${ratedAt.toISOString()}`,
      });

      return saved;
    });

    return this.toTask(updated);
  }

  /* ---------------------------------------------------------------------
   * Student
   * ------------------------------------------------------------------ */

  /**
   * The student's own tasks for one week.
   *
   * Defaults to the ACTIVE placement, falling back to the most recent one so a
   * student whose placement has closed can still read and print their weeks.
   * `assignmentId` looks back at an earlier placement, which they still own.
   */
  async listForStudent(
    userId: string,
    filters: { assignmentId?: string; week?: string },
  ) {
    const student = await this.getStudentByUserId(userId);

    const assignment = filters.assignmentId
      ? await this.getAssignmentOrThrow(filters.assignmentId)
      : ((await this.prisma.client.trainingAssignment.findFirst({
          where: { studentId: student.id, status: 'ACTIVE' },
          select: ASSIGNMENT_SELECT,
        })) ??
        (await this.prisma.client.trainingAssignment.findFirst({
          where: { studentId: student.id },
          select: ASSIGNMENT_SELECT,
          orderBy: { startDate: 'desc' },
        })));

    if (assignment && assignment.studentId !== student.id) {
      throw new ForbiddenException('That placement is not yours');
    }
    if (!assignment) {
      // Never placed: an empty week to render, not an error to recover from.
      const week = resolveWeek(filters.week);
      return {
        assignment: null,
        student: null,
        week,
        tasks: [],
        summary: summariseWeek([]),
        supervisorName: null,
      };
    }
    return this.buildWeek(assignment, filters.week);
  }

  /**
   * Marks an ASSIGNED task done, with an optional note and proof photos.
   *
   * Photos follow the journal's rules exactly (`common/file-upload.ts`): JPG or
   * PNG decided from the file's own bytes, 10MB each, stored in the private
   * bucket under a system-applied name. Storage is not transactional, so the
   * objects are written first and removed again if the row write fails.
   */
  async markDone(
    userId: string,
    taskId: string,
    data: { note?: string },
    photos: Express.Multer.File[],
  ) {
    const student = await this.getStudentByUserId(userId);
    const task = await this.getTaskOrThrow(taskId);
    if (task.studentId !== student.id) {
      throw new ForbiddenException('That task is not yours');
    }
    assertCanMarkDone(task.status);

    if (photos.length > MAX_TASK_PHOTOS) {
      throw new BadRequestException(
        `A task can have at most ${MAX_TASK_PHOTOS} proof photos.`,
      );
    }

    const uploaded = await this.uploadPhotos(
      task.trainingAssignment.student,
      photos,
    );

    const doneAt = new Date();
    const recipients = await this.supervisorRecipients(task);
    const updated = await this.prisma.client
      .$transaction(async (tx) => {
        const saved = await tx.weeklyTask.update({
          where: { id: taskId },
          data: {
            status: 'DONE',
            doneAt,
            studentNote: data.note ?? null,
            photos: { create: uploaded.rows },
          },
          include: TASK_INCLUDE,
        });

        await this.notifications.notify(tx, {
          userIds: recipients,
          type: 'WEEKLY_TASK_DONE',
          title: 'Weekly task marked done',
          body: `${task.trainingAssignment.student.user.name} marked "${task.title}" as done. It is ready to be rated.`,
          link: `/supervisor/weekly-tasks?assignment=${task.trainingAssignmentId}&week=${dateKey(task.weekStart)}`,
          entityType: 'WeeklyTask',
          entityId: taskId,
          // `doneAt` is the version marker: undoing and marking done again is
          // a genuinely new event with a new `doneAt`, while a repeated click
          // is refused above before it gets this far.
          dedupeKey: `WEEKLY_TASK_DONE:${taskId}:${doneAt.toISOString()}`,
        });

        return saved;
      })
      .catch(async (err: unknown) => {
        await this.deleteStoredObjects(uploaded.paths);
        throw err;
      });

    return this.toTask(updated);
  }

  /**
   * Takes a DONE task back to ASSIGNED — allowed until the supervisor rates it.
   *
   * The note and the proof photos go with it: they described the submission
   * being withdrawn, and marking the task done again attaches fresh ones.
   */
  async undoDone(userId: string, taskId: string) {
    const student = await this.getStudentByUserId(userId);
    const task = await this.getTaskOrThrow(taskId);
    if (task.studentId !== student.id) {
      throw new ForbiddenException('That task is not yours');
    }
    assertCanUndo(task.status);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.weeklyTaskPhoto.deleteMany({ where: { weeklyTaskId: taskId } });
      return tx.weeklyTask.update({
        where: { id: taskId },
        data: { status: 'ASSIGNED', doneAt: null, studentNote: null },
        include: TASK_INCLUDE,
      });
    });
    // After the commit — an orphaned object is recoverable, a row pointing at
    // a deleted file is not.
    await this.deleteStoredObjects(task.photos.map((p) => p.storagePath));

    return this.toTask(updated);
  }

  /* ---------------------------------------------------------------------
   * Coordinator (read-only)
   * ------------------------------------------------------------------ */

  /**
   * Any placement's week, read-only.
   *
   * Not block-scoped, like every other coordinator read of one record
   * (`getForCoordinator` on a journal, `listAssignments`): "My Block" is a view
   * default on the lists that lead here, not an authorization boundary
   * (CLAUDE.md §2).
   */
  async listForCoordinator(assignmentId: string, week?: string) {
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    return this.buildWeek(assignment, week);
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  /**
   * One placement's week: its tasks with signed photo URLs, the counts and the
   * week's average rating. Every role's list returns this same shape, and it is
   * also everything the printed Weekly Task Report shows — so the screen and
   * the printout can never disagree.
   */
  private async buildWeek(
    assignment: Awaited<ReturnType<WeeklyTaskService['getAssignmentOrThrow']>>,
    weekParam?: string,
  ) {
    const week = resolveWeek(weekParam);
    const rows = await this.prisma.client.weeklyTask.findMany({
      where: { trainingAssignmentId: assignment.id, weekStart: week.start },
      include: TASK_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const tasks = await Promise.all(rows.map((row) => this.toTask(row)));

    const { student, establishmentId, studentId, ...placement } = assignment;
    void establishmentId;
    void studentId;
    return {
      assignment: {
        ...placement,
        // An assignment's own block is nullable; the student's is the fallback,
        // the same either-side rule the coordinator's block scope uses.
        block: placement.block ?? student.block,
      },
      student: {
        id: student.id,
        studentIdNumber: student.studentIdNumber,
        name: student.user.name,
        program: student.enrolledCourse?.name ?? student.course,
        programCode: student.enrolledCourse?.code ?? null,
      },
      week,
      tasks,
      summary: summariseWeek(rows),
      // For the report's signature line: whoever assigned this week's work.
      // `null` when the week is empty or that supervisor's account is gone.
      supervisorName:
        rows.find((row) => row.supervisor)?.supervisor?.user.name ?? null,
    };
  }

  /**
   * A task row as the client reads it: who assigned it, and each photo's
   * stored path swapped for short-lived signed URLs.
   *
   * Two URLs per photo, as on a journal entry: `url` serves it inline for an
   * `<img>`, `downloadUrl` saves it under the system-applied name. Signing
   * never throws — a missing object yields `null`, so one lost photo renders
   * as unavailable instead of failing the week (CLAUDE.md §8).
   */
  private async toTask<
    T extends {
      supervisorId: string | null;
      supervisor: { id: string; user: { name: string } } | null;
      photos: { id: string; storagePath: string; originalName: string }[];
    },
  >(task: T) {
    const { supervisor, supervisorId, photos, ...rest } = task;
    void supervisorId;
    return {
      ...rest,
      assignedBy: supervisor
        ? { id: supervisor.id, name: supervisor.user.name }
        : null,
      photos: await Promise.all(
        photos.map(async ({ storagePath, ...photo }) => ({
          ...photo,
          url: await signedUrlOrNull(storagePath),
          downloadUrl: await signedUrlOrNull(storagePath, photo.originalName),
        })),
      ),
    };
  }

  /**
   * Validates and stores each proof photo, returning the rows to create and
   * the paths written (so a failed row write can clean them up).
   */
  private async uploadPhotos(
    student: {
      id: string;
      studentIdNumber: string;
      lastName: string | null;
      user: { name: string };
    },
    photos: Express.Multer.File[],
  ) {
    const surname = resolveSurname(student);
    // The day it was marked done, on the school's calendar.
    const datePart = dateKey(manilaToday()).replace(/-/g, '');
    const rows: {
      storagePath: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      sortOrder: number;
    }[] = [];
    const paths: string[] = [];

    for (const [index, photo] of photos.entries()) {
      let validated: ReturnType<typeof validateUpload>;
      try {
        validated = validateUpload(photo.buffer, {
          allowed: ['jpg', 'png'],
          maxBytes: MAX_UPLOAD_SIZE_BYTES,
        });
      } catch (err) {
        // One bad file refuses the whole submission, so nothing already
        // uploaded for it may be left behind.
        await this.deleteStoredObjects(paths);
        if (err instanceof BadRequestException && photos.length > 1) {
          throw new BadRequestException(`Photo ${index + 1}: ${err.message}`);
        }
        throw err;
      }
      const originalName = buildStorageName({
        studentNumber: student.studentIdNumber,
        code: STORAGE_CODE,
        surname,
        suffix: `${datePart}_${index + 1}`,
        ext: validated.ext,
      });
      // The bucket key stays uuid-based; `originalName` is the auditable name.
      const storagePath = buildObjectPath(
        STORAGE_PREFIX,
        student.id,
        originalName,
      );

      try {
        await uploadFile(storagePath, photo.buffer, validated.mimeType);
      } catch (err) {
        await this.deleteStoredObjects(paths);
        throw err;
      }

      paths.push(storagePath);
      rows.push({
        storagePath,
        originalName,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        sortOrder: index,
      });
    }

    return { rows, paths };
  }

  /**
   * Who hears that a task was marked done: the supervisor who assigned it, or —
   * when that account no longer exists — every supervisor at the placement's
   * establishment, since any of them can rate it.
   */
  private async supervisorRecipients(task: {
    supervisor: { id: string; userId: string } | null;
    trainingAssignment: { establishmentId: string };
  }): Promise<string[]> {
    if (task.supervisor) return [task.supervisor.userId];
    const supervisors = await this.prisma.client.supervisor.findMany({
      where: { establishmentId: task.trainingAssignment.establishmentId },
      select: { userId: true },
    });
    return supervisors.map((supervisor) => supervisor.userId);
  }

  /**
   * Supervisor scope is the assignment's own establishment — never
   * `Student.establishmentId`, which is overwritten on transfer (CLAUDE.md §2).
   */
  private assertAtEstablishment(
    assignment: { establishmentId: string },
    establishmentId: string,
  ) {
    if (assignment.establishmentId !== establishmentId) {
      throw new ForbiddenException(
        'This trainee is placed at a different establishment',
      );
    }
  }

  private assertActive(assignment: { status: string }) {
    if (assignment.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Tasks can only be assigned or changed for an active placement.',
      );
    }
  }

  private async getAssignmentOrThrow(assignmentId: string) {
    const assignment = await this.prisma.client.trainingAssignment.findUnique({
      where: { id: assignmentId },
      select: ASSIGNMENT_SELECT,
    });
    if (!assignment) {
      throw new NotFoundException('Training assignment not found');
    }
    return assignment;
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.client.weeklyTask.findUnique({
      where: { id: taskId },
      include: {
        supervisor: {
          select: { id: true, userId: true, user: { select: { name: true } } },
        },
        photos: { select: PHOTO_SELECT, orderBy: { sortOrder: 'asc' } },
        trainingAssignment: { select: ASSIGNMENT_SELECT },
      },
    });
    if (!task) {
      throw new NotFoundException('Weekly task not found');
    }
    return task;
  }

  private async getStudentByUserId(userId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
  }

  private async getSupervisorByUserId(userId: string) {
    const supervisor = await this.prisma.client.supervisor.findUnique({
      where: { userId },
      select: { id: true, establishmentId: true },
    });
    if (!supervisor) {
      throw new NotFoundException('Supervisor profile not found');
    }
    return supervisor;
  }

  /** Best-effort: an orphaned object wastes a few KB, a failed request costs more. */
  private async deleteStoredObjects(paths: string[]) {
    await Promise.all(
      paths.map(async (path) => {
        try {
          await deleteFile(path);
        } catch (err) {
          this.logger.error(
            `Weekly task photo row is gone but its storage object "${path}" was not deleted: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }),
    );
  }
}

/** `2026-10-12` — a date-only value as a query parameter or filename segment. */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The surname for the stored filename. `Student.lastName` is nullable, so fall
 * back to the last word of the display name — the same rule journal photos use.
 */
function resolveSurname(student: {
  lastName: string | null;
  user: { name: string };
}): string {
  const explicit = student.lastName?.trim();
  if (explicit) return explicit;
  const parts = student.user.name.trim().split(/\s+/);
  return parts[parts.length - 1] || 'STUDENT';
}
