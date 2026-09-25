import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { JournalStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { assertDutyDay, formatDutyDays } from '../common/duty-days';
import {
  formatDateOnly,
  manilaToday,
  startOfUtcDay,
  toUtcDateOnly,
} from '../common/dates';
import {
  buildStorageName,
  MAX_UPLOAD_SIZE_BYTES,
  validateUpload,
} from '../common/file-upload';
import {
  buildObjectPath,
  deleteFile,
  getSignedUrl,
  uploadFile,
} from '../common/storage';
import { journalEstablishmentWhere } from '../common/supervisor-scope';

/** A journal entry may carry at most this many photographs. */
export const MAX_JOURNAL_PHOTOS = 5;

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Where journal photos live inside the shared private bucket. */
const STORAGE_PREFIX = 'journals';

/** The CODE segment of the system-applied filename (`..._JOURNAL_...`). */
const STORAGE_CODE = 'JOURNAL';

export interface CreateJournalInput {
  entryDate: string;
  activities: string;
  learnings?: string;
}

export interface UpdateJournalInput {
  activities?: string;
  learnings?: string | null;
  /** Ids of this entry's existing photos to drop. */
  removePhotoIds?: string[];
}

export interface CoordinatorJournalFilters {
  scope?: 'block' | 'all';
  status?: JournalStatus;
  courseId?: string;
  yearLevel?: number;
  blockId?: string;
  establishmentId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** The student/establishment columns every role's list and detail views show. */
const ENTRY_INCLUDE = {
  student: {
    select: {
      id: true,
      studentIdNumber: true,
      firstName: true,
      lastName: true,
      user: { select: { id: true, name: true } },
    },
  },
  trainingAssignment: {
    select: {
      id: true,
      status: true,
      academicYear: true,
      dutyDays: true,
      startDate: true,
      endDate: true,
      establishment: { select: { id: true, name: true } },
      block: { select: { id: true, name: true } },
    },
  },
  reviewedBy: { select: { id: true, user: { select: { name: true } } } },
} as const;

const PHOTO_SELECT = {
  id: true,
  storagePath: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  caption: true,
  sortOrder: true,
  createdAt: true,
} as const;

@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /* ---------------------------------------------------------------------
   * Student
   * ------------------------------------------------------------------ */

  /**
   * Writes one duty day up.
   *
   * The entry attaches to the student's ACTIVE assignment — a journal belongs
   * to a placement, not to the student in general — and the date is checked
   * against that assignment's own window and duty days, reusing the same rule
   * and wording attendance uses (`common/duty-days.ts`), so a student is never
   * told two different things about the same schedule.
   */
  async createEntry(
    userId: string,
    data: CreateJournalInput,
    photos: Express.Multer.File[],
  ) {
    const student = await this.getStudentByUserId(userId);
    const assignment = await this.getActiveAssignment(student.id);
    const entryDate = this.resolveEntryDate(data.entryDate, assignment);

    if (photos.length > MAX_JOURNAL_PHOTOS) {
      throw new BadRequestException(
        `A journal entry can have at most ${MAX_JOURNAL_PHOTOS} photos.`,
      );
    }

    const existing = await this.prisma.client.journalEntry.findUnique({
      where: {
        trainingAssignmentId_entryDate: {
          trainingAssignmentId: assignment.id,
          entryDate,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `You already have a journal entry for ${formatDateOnly(entryDate)}. Open it to edit or add photos instead.`,
      );
    }

    // Uploaded before the row exists, so a storage failure means no entry at
    // all rather than an entry whose photos are missing. The reverse order
    // would need compensating deletes on every failure path.
    const uploaded = await this.uploadPhotos(student, entryDate, photos, 0);

    try {
      const created = await this.prisma.client.journalEntry.create({
        data: {
          trainingAssignmentId: assignment.id,
          studentId: student.id,
          entryDate,
          activities: data.activities,
          learnings: data.learnings,
          status: 'SUBMITTED',
          photos: { create: uploaded.rows },
        },
        include: { ...ENTRY_INCLUDE, photos: { select: PHOTO_SELECT } },
      });
      return this.withSignedPhotos(created, { canEdit: true });
    } catch (err) {
      // Nothing references these objects now, so leave no orphans behind.
      await this.deleteStoredObjects(uploaded.paths, 'journal photo');
      throw err;
    }
  }

  /**
   * The student's own entries for one assignment, newest day first.
   *
   * Defaults to the ACTIVE assignment; `assignmentId` lets them look back at a
   * previous placement's journal, which they still own. Photos come back as
   * counts here and as signed URLs in the detail view — a list of 60 entries
   * should not mint 300 signed URLs.
   */
  async listMyEntries(userId: string, assignmentId?: string) {
    const student = await this.getStudentByUserId(userId);

    const assignment = assignmentId
      ? await this.prisma.client.trainingAssignment.findUnique({
          where: { id: assignmentId },
          select: ASSIGNMENT_SELECT,
        })
      : await this.prisma.client.trainingAssignment.findFirst({
          where: { studentId: student.id, status: 'ACTIVE' },
          select: ASSIGNMENT_SELECT,
        });

    if (assignmentId && !assignment) {
      throw new NotFoundException('Training assignment not found');
    }
    if (assignment && assignment.studentId !== student.id) {
      throw new ForbiddenException('That placement is not yours');
    }

    // No placement at all is a normal, loadable state — the page explains it
    // rather than erroring, the same way the attendance form does.
    if (!assignment) {
      return { assignment: null, entries: [] };
    }

    const entries = await this.prisma.client.journalEntry.findMany({
      where: { trainingAssignmentId: assignment.id },
      include: { _count: { select: { photos: true } } },
      orderBy: { entryDate: 'desc' },
    });

    return {
      assignment: {
        id: assignment.id,
        status: assignment.status,
        academicYear: assignment.academicYear,
        dutyDays: assignment.dutyDays,
        dutyDaysLabel: formatDutyDays(assignment.dutyDays),
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        establishment: assignment.establishment,
      },
      entries: entries.map(({ _count, ...entry }) => ({
        ...entry,
        photoCount: _count.photos,
        canEdit: isEditable(entry.status),
        canDelete: entry.status === 'SUBMITTED' && entry.reviewedAt === null,
      })),
    };
  }

  async getMyEntry(userId: string, entryId: string) {
    const student = await this.getStudentByUserId(userId);
    const entry = await this.findEntryOrThrow(entryId);
    if (entry.studentId !== student.id) {
      throw new ForbiddenException('That journal entry is not yours');
    }
    return this.withSignedPhotos(entry, { canEdit: isEditable(entry.status) });
  }

  /**
   * Edits an entry's text and photos.
   *
   * Allowed while SUBMITTED (not yet reviewed) or RETURNED (sent back for
   * changes); an ACCEPTED entry is signed off and frozen. Editing a RETURNED
   * entry puts it back in the queue as SUBMITTED with a fresh `submittedAt` —
   * which is also the review notification's version marker, so the next
   * decision notifies again rather than being deduped against the last one.
   * `coordinatorRemarks` is deliberately left in place so the student can still
   * read what they were asked to fix until it is reviewed again.
   */
  async updateEntry(
    userId: string,
    entryId: string,
    data: UpdateJournalInput,
    photos: Express.Multer.File[],
  ) {
    const student = await this.getStudentByUserId(userId);
    const entry = await this.findEntryOrThrow(entryId);
    if (entry.studentId !== student.id) {
      throw new ForbiddenException('That journal entry is not yours');
    }
    if (!isEditable(entry.status)) {
      throw new ConflictException(
        'This entry has already been accepted and can no longer be edited.',
      );
    }

    const removeIds = new Set(data.removePhotoIds ?? []);
    const doomed = entry.photos.filter((photo) => removeIds.has(photo.id));
    if (doomed.length !== removeIds.size) {
      throw new BadRequestException(
        'One of the photos you asked to remove is not on this entry.',
      );
    }

    const keptCount = entry.photos.length - doomed.length;
    if (keptCount + photos.length > MAX_JOURNAL_PHOTOS) {
      throw new BadRequestException(
        `A journal entry can have at most ${MAX_JOURNAL_PHOTOS} photos — this one would have ${keptCount + photos.length}.`,
      );
    }

    const nextSortOrder =
      entry.photos.reduce((max, photo) => Math.max(max, photo.sortOrder), -1) +
      1;
    const uploaded = await this.uploadPhotos(
      student,
      toUtcDateOnly(entry.entryDate),
      photos,
      nextSortOrder,
    );

    // `.catch` rather than a try/catch around a `let`: the handler only ever
    // throws, so the transaction's own return type survives inference.
    const updated = await this.prisma.client
      .$transaction(async (tx) => {
        if (doomed.length > 0) {
          await tx.journalPhoto.deleteMany({
            where: { id: { in: doomed.map((photo) => photo.id) } },
          });
        }
        if (uploaded.rows.length > 0) {
          await tx.journalPhoto.createMany({
            data: uploaded.rows.map((row) => ({
              ...row,
              journalEntryId: entryId,
            })),
          });
        }
        return tx.journalEntry.update({
          where: { id: entryId },
          data: {
            activities: data.activities,
            learnings: data.learnings,
            // Resubmission only matters for an entry that was sent back; a
            // still-unreviewed SUBMITTED entry keeps its original submittedAt
            // so its wait in the queue is not reset by a typo fix.
            ...(entry.status === 'RETURNED'
              ? { status: 'SUBMITTED' as const, submittedAt: new Date() }
              : {}),
          },
          include: { ...ENTRY_INCLUDE, photos: { select: PHOTO_SELECT } },
        });
      })
      .catch(async (err: unknown) => {
        await this.deleteStoredObjects(uploaded.paths, 'journal photo');
        throw err;
      });

    // After the commit — storage is not transactional, and an orphaned object
    // is recoverable where a row pointing at nothing is not (CLAUDE.md §6).
    await this.deleteStoredObjects(
      doomed.map((photo) => photo.storagePath),
      'journal photo',
    );

    return this.withSignedPhotos(updated, {
      canEdit: isEditable(updated.status),
    });
  }

  /** Deletes an entry the coordinator has never acted on, and its photos. */
  async deleteEntry(userId: string, entryId: string) {
    const student = await this.getStudentByUserId(userId);
    const entry = await this.findEntryOrThrow(entryId);
    if (entry.studentId !== student.id) {
      throw new ForbiddenException('That journal entry is not yours');
    }
    // Reviewed at all — accepted, or returned and then resubmitted — means the
    // coordinator's record of it stays put rather than silently vanishing.
    if (entry.status !== 'SUBMITTED' || entry.reviewedAt !== null) {
      throw new ConflictException(
        'Only an entry that has never been reviewed can be deleted.',
      );
    }

    // Row first, then the objects — the same order the document delete and the
    // cascades use. Photos go with the entry via JournalPhoto's onDelete.
    await this.prisma.client.journalEntry.delete({ where: { id: entryId } });
    await this.deleteStoredObjects(
      entry.photos.map((photo) => photo.storagePath),
      'journal photo',
    );

    return { id: entryId, deleted: true };
  }

  /* ---------------------------------------------------------------------
   * Coordinator
   * ------------------------------------------------------------------ */

  /**
   * The review queue, oldest-waiting first is *not* the default — newest
   * `submittedAt` first is, matching the documents queue.
   *
   * `scope: 'block'` (the default) narrows to the requesting coordinator's own
   * blocks, exactly as `CoordinatorService.listStudents` does: a view default,
   * not an authorization boundary, and a coordinator with no blocks assigned
   * falls back to the whole programme with `noBlocksAssigned` set rather than
   * seeing an empty queue that reads as "nothing to review".
   */
  async listForCoordinator(userId: string, filters: CoordinatorJournalFilters) {
    const { where, noBlocksAssigned } = await this.coordinatorWhere(
      userId,
      filters,
    );

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, filters.pageSize ?? PAGE_SIZE),
    );

    const [total, awaitingReview, rows] = await Promise.all([
      this.prisma.client.journalEntry.count({ where }),
      // Deliberately overrides any `status` filter: the tile above the table
      // answers "how much is left to review in this scope", which should not
      // change just because the coordinator is currently looking at accepted
      // entries.
      this.prisma.client.journalEntry.count({
        where: { ...where, status: 'SUBMITTED' },
      }),
      this.prisma.client.journalEntry.findMany({
        where,
        include: { ...ENTRY_INCLUDE, _count: { select: { photos: true } } },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      noBlocksAssigned,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      awaitingReview,
      rows: rows.map(({ _count, ...entry }) => ({
        ...toListRow(entry),
        photoCount: _count.photos,
      })),
    };
  }

  /**
   * Just the SUBMITTED count, for the dashboard tile. A separate, tiny query
   * rather than a field on `getDashboard` — that endpoint has no scope concept
   * and flipping this tile's scope should not refetch the whole dashboard, the
   * same call `getOverdueVerifications` makes.
   */
  async countAwaitingReview(userId: string, scope: 'block' | 'all') {
    const { where, noBlocksAssigned } = await this.coordinatorWhere(userId, {
      scope,
    });
    const count = await this.prisma.client.journalEntry.count({
      where: { ...where, status: 'SUBMITTED' },
    });
    return { count, noBlocksAssigned };
  }

  async getForCoordinator(entryId: string) {
    const entry = await this.findEntryOrThrow(entryId);
    return this.withSignedPhotos(entry, { canEdit: false });
  }

  /**
   * Accepts an entry, or returns it with written comments.
   *
   * Remarks are required on RETURN — a returned entry with no explanation
   * gives the student nothing to act on, the same rule attendance's decline
   * reason and the document review note follow. An ACCEPT clears any remarks
   * from a previous return: an accepted entry should not still carry the
   * reason it was once sent back.
   */
  async review(
    userId: string,
    entryId: string,
    decision: 'ACCEPT' | 'RETURN',
    remarks?: string,
  ) {
    const coordinator = await this.getCoordinatorByUserId(userId);
    const entry = await this.findEntryOrThrow(entryId);

    const accepted = decision === 'ACCEPT';
    const updated = await this.prisma.client.journalEntry.update({
      where: { id: entryId },
      data: {
        status: accepted ? 'ACCEPTED' : 'RETURNED',
        coordinatorRemarks: accepted ? null : remarks,
        reviewedById: coordinator.id,
        reviewedAt: new Date(),
      },
      include: { ...ENTRY_INCLUDE, photos: { select: PHOTO_SELECT } },
    });

    const dateLabel = formatDateOnly(toUtcDateOnly(updated.entryDate));
    await this.notifications.notify(this.prisma.client, {
      userIds: [entry.student.user.id],
      type: accepted ? 'JOURNAL_ACCEPTED' : 'JOURNAL_RETURNED',
      title: accepted ? 'Journal entry accepted' : 'Journal entry returned',
      body: accepted
        ? `Your journal entry for ${dateLabel} was accepted.`
        : `Your journal entry for ${dateLabel} was returned: ${remarks}`,
      link: '/student/journal',
      entityType: 'JournalEntry',
      entityId: entryId,
      // Keyed on submittedAt, not the id alone: a double-clicked decision is a
      // no-op, but reviewing again after the student edits and resubmits (a new
      // submittedAt) is a genuinely new event that must still notify. Same
      // convention as ATTENDANCE_APPROVED/DECLINED.
      dedupeKey: `${accepted ? 'JOURNAL_ACCEPTED' : 'JOURNAL_RETURNED'}:${entryId}:${updated.submittedAt.toISOString()}`,
    });

    return this.withSignedPhotos(updated, { canEdit: false });
  }

  /* ---------------------------------------------------------------------
   * Supervisor (read-only)
   * ------------------------------------------------------------------ */

  /**
   * Journals written at this supervisor's establishment — read-only.
   *
   * Scoped through the entry's assignment (`journalEstablishmentWhere`), never
   * `Student.establishmentId`: a trainee who transfers away takes their new
   * establishment's journal with them, and the days they wrote up *here* stay
   * visible to the supervisor who witnessed them.
   */
  async listForSupervisor(
    userId: string,
    filters: { studentId?: string; from?: string; to?: string },
  ) {
    const supervisor = await this.getSupervisorByUserId(userId);

    const entries = await this.prisma.client.journalEntry.findMany({
      where: {
        ...journalEstablishmentWhere(supervisor.establishmentId),
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        ...dateRangeWhere(filters.from, filters.to),
      },
      include: { ...ENTRY_INCLUDE, _count: { select: { photos: true } } },
      orderBy: { entryDate: 'desc' },
    });

    return entries.map(({ _count, ...entry }) => ({
      ...toListRow(entry),
      photoCount: _count.photos,
    }));
  }

  async getForSupervisor(userId: string, entryId: string) {
    const supervisor = await this.getSupervisorByUserId(userId);
    const entry = await this.findEntryOrThrow(entryId);
    if (
      entry.trainingAssignment.establishment.id !== supervisor.establishmentId
    ) {
      throw new ForbiddenException(
        'That journal entry belongs to a different establishment',
      );
    }
    return this.withSignedPhotos(entry, { canEdit: false });
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  private async getStudentByUserId(userId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { userId },
      select: {
        id: true,
        studentIdNumber: true,
        status: true,
        lastName: true,
        user: { select: { name: true } },
      },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
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

  private async getActiveAssignment(studentId: string) {
    const assignment = await this.prisma.client.trainingAssignment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      select: ASSIGNMENT_SELECT,
    });
    if (!assignment) {
      throw new BadRequestException(
        'You have no active training placement, so there is nothing to journal against yet.',
      );
    }
    return assignment;
  }

  /**
   * The entry date, checked against the assignment it will attach to.
   *
   * Mirrors `StudentService.submitAttendance` bound for bound — each bound gets
   * its own message rather than a combined range (which reads as inverted
   * nonsense when a placement has not started yet), "today" is Manila's, and
   * the duty-day rule comes from the shared helper.
   */
  private resolveEntryDate(
    value: string,
    assignment: { dutyDays: string[]; startDate: Date; endDate: Date | null },
  ): Date {
    const entryDate = startOfUtcDay(value);
    if (Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException('entryDate is not a valid date');
    }

    const start = toUtcDateOnly(assignment.startDate);
    if (entryDate.getTime() < start.getTime()) {
      throw new BadRequestException(
        `Your current placement starts on ${formatDateOnly(start)}. You cannot journal a day before then.`,
      );
    }
    if (assignment.endDate) {
      const end = toUtcDateOnly(assignment.endDate);
      if (entryDate.getTime() >= end.getTime()) {
        throw new BadRequestException(
          `Your current placement ended on ${formatDateOnly(end)}. You cannot journal a day on or after then.`,
        );
      }
    }
    if (entryDate.getTime() > manilaToday().getTime()) {
      throw new BadRequestException(
        'A journal entry cannot be written for a future date.',
      );
    }

    assertDutyDay(entryDate, assignment.dutyDays);
    return entryDate;
  }

  private async findEntryOrThrow(entryId: string) {
    const entry = await this.prisma.client.journalEntry.findUnique({
      where: { id: entryId },
      include: { ...ENTRY_INCLUDE, photos: { select: PHOTO_SELECT } },
    });
    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }
    return entry;
  }

  /**
   * The block scope and the plain filters, shared by the coordinator's list and
   * its dashboard count so the two can never disagree about what "my block"
   * means.
   */
  private async coordinatorWhere(
    userId: string,
    filters: CoordinatorJournalFilters,
  ): Promise<{
    where: Prisma.JournalEntryWhereInput;
    noBlocksAssigned: boolean;
  }> {
    const coordinator = await this.getCoordinatorByUserId(userId);

    let blockScopeIds: string[] | null = null;
    let noBlocksAssigned = false;
    if (filters.scope !== 'all') {
      const ownBlocks = await this.prisma.client.block.findMany({
        where: { coordinatorId: coordinator.id },
        select: { id: true },
      });
      if (ownBlocks.length > 0) {
        blockScopeIds = ownBlocks.map((block) => block.id);
      } else {
        noBlocksAssigned = true;
      }
    }

    // Built as one object per relation, never spread key-by-key: three separate
    // `{ trainingAssignment: ... }` spreads would silently overwrite each other
    // and drop every filter but the last.
    const assignmentWhere: Prisma.TrainingAssignmentWhereInput = {
      ...(filters.blockId ? { blockId: filters.blockId } : {}),
      ...(filters.establishmentId
        ? { establishmentId: filters.establishmentId }
        : {}),
      ...(filters.yearLevel !== undefined
        ? { yearLevel: filters.yearLevel }
        : {}),
    };

    return {
      noBlocksAssigned,
      where: {
        ...(blockScopeIds
          ? {
              // Either side may carry the block: an assignment's blockId is
              // nullable, so a student of this coordinator's block whose
              // placement was recorded without one would otherwise be missed.
              // Same shape as `getOverdueVerifications`.
              OR: [
                { trainingAssignment: { blockId: { in: blockScopeIds } } },
                { student: { blockId: { in: blockScopeIds } } },
              ],
            }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(Object.keys(assignmentWhere).length > 0
          ? { trainingAssignment: assignmentWhere }
          : {}),
        ...(filters.courseId
          ? { student: { courseId: filters.courseId } }
          : {}),
        ...dateRangeWhere(filters.from, filters.to),
      },
    };
  }

  /**
   * Validates and stores each photo, returning the rows to create and the paths
   * that were written (so a failed write can clean them up).
   *
   * The file's real type comes from its magic bytes — the browser's
   * Content-Type and the phone's filename are both ignored — and the stored
   * name is the school's convention, `StudentNo_JOURNAL_<date>_<n>_SURNAME.ext`.
   */
  private async uploadPhotos(
    student: {
      id: string;
      studentIdNumber: string;
      lastName: string | null;
      user: { name: string };
    },
    entryDate: Date,
    photos: Express.Multer.File[],
    sortOrderFrom: number,
  ) {
    const surname = resolveSurname(student);
    const datePart = compactDate(entryDate);
    const rows: {
      storagePath: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      sortOrder: number;
    }[] = [];
    const paths: string[] = [];

    for (const [index, photo] of photos.entries()) {
      const validated = validateUpload(photo.buffer, {
        allowed: ['jpg', 'png'],
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
      const originalName = buildStorageName({
        studentNumber: student.studentIdNumber,
        code: STORAGE_CODE,
        surname,
        suffix: `${datePart}_${sortOrderFrom + index + 1}`,
        ext: validated.ext,
      });
      // The bucket key stays uuid-based (collision-free whatever the student
      // re-uploads); `originalName` above is the auditable name the compiled
      // journal prints.
      const storagePath = buildObjectPath(
        STORAGE_PREFIX,
        student.id,
        originalName,
      );

      try {
        await uploadFile(storagePath, photo.buffer, validated.mimeType);
      } catch (err) {
        await this.deleteStoredObjects(paths, 'journal photo');
        throw err;
      }

      paths.push(storagePath);
      rows.push({
        storagePath,
        originalName,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        sortOrder: sortOrderFrom + index,
      });
    }

    return { rows, paths };
  }

  /**
   * Swaps each photo's stored path for a short-lived signed URL.
   *
   * Never throws: a missing object yields `url: null` so that one photo renders
   * as unavailable instead of taking the whole entry down — the same rule
   * `withSignedUrl` follows for documents (CLAUDE.md §8).
   */
  private async withSignedPhotos<
    T extends {
      photos: { id: string; storagePath: string }[];
    },
  >(entry: T, extra: { canEdit: boolean }) {
    const photos = await Promise.all(
      entry.photos.map(async ({ storagePath, ...photo }) => ({
        ...photo,
        url: await this.signedUrlOrNull(storagePath),
      })),
    );
    return { ...entry, photos, ...extra };
  }

  private async signedUrlOrNull(path: string): Promise<string | null> {
    try {
      return await getSignedUrl(path);
    } catch (err) {
      this.logger.error(
        `No signed URL for journal photo "${path}" — the row survives with url: null: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return null;
    }
  }

  /** Best-effort: an orphaned object wastes a few KB, a failed request costs more. */
  private async deleteStoredObjects(paths: string[], label: string) {
    await Promise.all(
      paths.map(async (path) => {
        try {
          await deleteFile(path);
        } catch (err) {
          this.logger.error(
            `${label} row is gone but its storage object "${path}" was not deleted: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }),
    );
  }
}

const ASSIGNMENT_SELECT = {
  id: true,
  studentId: true,
  status: true,
  academicYear: true,
  dutyDays: true,
  startDate: true,
  endDate: true,
  establishment: { select: { id: true, name: true } },
} as const;

/** SUBMITTED and RETURNED are the student's to change; ACCEPTED is signed off. */
function isEditable(status: JournalStatus): boolean {
  return status === 'SUBMITTED' || status === 'RETURNED';
}

/** `20260915` — the date segment of the system-applied filename. */
function compactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * The surname for the stored filename. `Student.lastName` is nullable (every
 * row predating that column has none), so fall back to the last word of the
 * display name rather than writing a file called `..._.jpg`.
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

/**
 * An inclusive `entryDate` range. Both bounds are optional and each is
 * normalised to UTC midnight, matching how the column is written.
 */
function dateRangeWhere(
  from?: string,
  to?: string,
): Prisma.JournalEntryWhereInput {
  if (!from && !to) return {};
  const gte = from ? startOfUtcDay(from) : undefined;
  const lte = to ? startOfUtcDay(to) : undefined;
  if (gte && Number.isNaN(gte.getTime())) {
    throw new BadRequestException('from is not a valid date');
  }
  if (lte && Number.isNaN(lte.getTime())) {
    throw new BadRequestException('to is not a valid date');
  }
  return { entryDate: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

/** The row shape the coordinator's queue and the supervisor's list both render. */
function toListRow(entry: {
  id: string;
  entryDate: Date;
  activities: string;
  status: JournalStatus;
  coordinatorRemarks: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  student: {
    id: string;
    studentIdNumber: string;
    user: { name: string };
  };
  trainingAssignment: {
    id: string;
    academicYear: string;
    establishment: { id: string; name: string };
    block: { id: string; name: string } | null;
  };
  reviewedBy: { id: string; user: { name: string } } | null;
}) {
  return {
    id: entry.id,
    entryDate: entry.entryDate,
    // Enough to recognise the entry in a table without shipping the whole
    // write-up to a list view.
    excerpt: entry.activities.slice(0, 160),
    status: entry.status,
    coordinatorRemarks: entry.coordinatorRemarks,
    submittedAt: entry.submittedAt,
    reviewedAt: entry.reviewedAt,
    student: {
      id: entry.student.id,
      studentIdNumber: entry.student.studentIdNumber,
      name: entry.student.user.name,
    },
    assignmentId: entry.trainingAssignment.id,
    academicYear: entry.trainingAssignment.academicYear,
    establishment: entry.trainingAssignment.establishment,
    block: entry.trainingAssignment.block,
    reviewedBy: entry.reviewedBy
      ? { id: entry.reviewedBy.id, name: entry.reviewedBy.user.name }
      : null,
  };
}
