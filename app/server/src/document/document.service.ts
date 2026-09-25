import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentStage, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { DOCUMENT_STAGES } from '../common/document-requirements';
import {
  buildStorageName,
  MAX_UPLOAD_SIZE_BYTES,
  validateUpload,
} from '../common/file-upload';
import { buildObjectPath, deleteFile, uploadFile } from '../common/storage';
import { extensionOf, withSignedUrl } from '../common/signed-url';

/** What a document upload accepts — PDF or a photo of a signed page. */
const ALLOWED_UPLOAD_KINDS = ['pdf', 'jpg', 'png'] as const;

/** Where documents live inside the shared private bucket (CLAUDE.md §7). */
const STORAGE_PREFIX = 'documents';

/**
 * A cell in the coordinator's status matrix.
 *
 * `DECLINED` is the matrix's word for what `Document.status` stores as
 * `REJECTED` — the column keeps its existing value (nothing migrates a live
 * status string for a rename), and every UI that reads a *cell* says DECLINED,
 * matching how attendance already talks about a declined submission.
 *
 * `NOT_APPLICABLE` is a per-assignment requirement for a student with no ACTIVE
 * placement: it is not missing, there is simply nothing for it to attach to yet.
 */
export type RequirementState =
  'MISSING' | 'PENDING' | 'APPROVED' | 'DECLINED' | 'NOT_APPLICABLE';

export interface StatusFilters {
  scope?: 'block' | 'all';
  courseId?: string;
  yearLevel?: number;
  blockId?: string;
  establishmentId?: string;
  stage?: DocumentStage;
}

/** The reviewer/uploader columns every document response carries. */
const DOCUMENT_INCLUDE = {
  student: {
    select: {
      id: true,
      studentIdNumber: true,
      user: { select: { name: true } },
      establishment: { select: { id: true, name: true } },
    },
  },
  requirement: {
    select: {
      id: true,
      code: true,
      name: true,
      stage: true,
      perAssignment: true,
    },
  },
  reviewedBy: { select: { id: true, user: { select: { name: true } } } },
  uploadedBy: { select: { id: true, name: true, role: true } },
} as const;

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /* ---------------------------------------------------------------------
   * Requirements
   * ------------------------------------------------------------------ */

  /** The live checklist definition — active requirements, in stage then sort order. */
  async listRequirements() {
    return this.prisma.client.documentRequirement.findMany({
      where: { isActive: true },
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /* ---------------------------------------------------------------------
   * Student
   * ------------------------------------------------------------------ */

  /**
   * The student's own checklist: every active requirement with its current
   * state, plus anything uploaded before the checklist existed.
   *
   * One endpoint rather than a requirements list the client joins to a documents
   * list — the per-assignment rule (which assignment a requirement is satisfied
   * *for*) is server-side knowledge, and duplicating it in the client is how the
   * two drift.
   */
  async getChecklistForStudent(userId: string) {
    const student = await this.getStudentByUserId(userId);
    return this.buildChecklist(student);
  }

  /** The same checklist, for the coordinator looking at one student. */
  async getChecklistForCoordinator(studentId: string) {
    const student = await this.getStudentOrThrow(studentId);
    return this.buildChecklist(student);
  }

  private async buildChecklist(student: StudentForUpload) {
    const [requirements, documents, activeAssignment] = await Promise.all([
      this.listRequirements(),
      this.prisma.client.document.findMany({
        where: { studentId: student.id },
        include: DOCUMENT_INCLUDE,
        orderBy: { uploadedAt: 'desc' },
      }),
      this.findActiveAssignment(student.id),
    ]);

    const matchedIds = new Set<string>();
    const rows = await Promise.all(
      requirements.map(async (requirement) => {
        const match = this.matchDocument(
          documents,
          requirement,
          activeAssignment?.id ?? null,
        );
        if (match) matchedIds.add(match.id);
        const applicable = !requirement.perAssignment || !!activeAssignment;
        return {
          requirement,
          applicable,
          state: cellState(match?.status, applicable),
          document: match ? await this.presentDocument(match) : null,
        };
      }),
    );

    // Everything the checklist above does not already show: rows the backfill
    // could not map, and rows a requirement *has* but that are not the one
    // counting for it (two legacy uploads the backfill mapped to the same code,
    // or a previous placement's MOA). Kept visible rather than silently hidden —
    // a file the student already submitted should never just disappear.
    const otherUploads = await Promise.all(
      documents
        .filter((document) => !matchedIds.has(document.id))
        .map((document) => this.presentDocument(document)),
    );

    return {
      hasActiveAssignment: activeAssignment !== null,
      establishment: activeAssignment?.establishment ?? null,
      stages: DOCUMENT_STAGES.map((stage) => ({
        stage,
        requirements: rows.filter((row) => row.requirement.stage === stage),
      })),
      otherUploads,
    };
  }

  /**
   * Deletes a student's own upload while it is still unreviewed.
   *
   * A replaced requirement is *updated* rather than deleted (see `upload`), so
   * this is only for withdrawing something entirely — including a legacy row
   * with no requirement.
   */
  async deleteOwnDocument(userId: string, documentId: string) {
    const student = await this.getStudentByUserId(userId);
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.studentId !== student.id) {
      throw new ForbiddenException('This document does not belong to you');
    }
    // Once a coordinator has acted on it, the review record (and any note the
    // student was given) stays put rather than silently disappearing.
    if (document.status !== 'PENDING') {
      throw new ConflictException(
        'Only a document still pending review can be deleted',
      );
    }

    // Row first, then the object — the same order the cascades use (CLAUDE.md
    // §6). Reversed, a storage success followed by a failed row delete leaves a
    // row pointing at nothing.
    await this.prisma.client.document.delete({ where: { id: documentId } });
    await this.deleteStoredObject(document.fileUrl, `document ${documentId}`);

    return { id: documentId, deleted: true };
  }

  /* ---------------------------------------------------------------------
   * Upload — one method for both roles
   * ------------------------------------------------------------------ */

  /**
   * Stores a file against a Table 3 requirement, for the student themselves or
   * for a coordinator uploading on their behalf.
   *
   * One method for both paths deliberately: the naming convention, the
   * per-assignment rule, the real-type check and the replace-vs-conflict rule
   * are identical whoever uploads, and the only differences are the two
   * parameters below.
   *
   * - `uploadedByUserId` records who actually produced the file (audit).
   * - `reviewedByCoordinatorId`, when set, means the school produced this
   *   document itself (the MOA, the endorsement letter), so it is stored already
   *   APPROVED and attributed to that coordinator. A student upload starts
   *   PENDING with no reviewer.
   */
  /**
   * A student uploading their own document. The student is re-derived from the
   * JWT here, never taken from the request — an id in a body must never imply
   * ownership (CLAUDE.md §2).
   */
  async uploadAsStudent(
    userId: string,
    requirementId: string,
    file: Express.Multer.File | undefined,
  ) {
    const student = await this.getStudentByUserId(userId);
    return this.upload({
      studentId: student.id,
      requirementId,
      file,
      uploadedByUserId: userId,
    });
  }

  /**
   * A coordinator uploading on a student's behalf — the school produces the
   * endorsement letter, MOA and waiver itself, so these are stored already
   * approved and attributed to the uploading coordinator.
   */
  async uploadForStudent(
    userId: string,
    studentId: string,
    requirementId: string,
    file: Express.Multer.File | undefined,
  ) {
    const coordinator = await this.getCoordinatorByUserId(userId);
    return this.upload({
      studentId,
      requirementId,
      file,
      uploadedByUserId: userId,
      reviewedByCoordinatorId: coordinator.id,
    });
  }

  private async upload(params: {
    studentId: string;
    requirementId: string;
    file: Express.Multer.File | undefined;
    uploadedByUserId: string;
    reviewedByCoordinatorId?: string;
  }) {
    const student = await this.getStudentOrThrow(params.studentId);
    const requirement = await this.prisma.client.documentRequirement.findUnique(
      {
        where: { id: params.requirementId },
      },
    );
    if (!requirement || !requirement.isActive) {
      throw new BadRequestException(
        'requirementId does not match an active document requirement',
      );
    }

    // The file's real type, from its leading bytes — the filename and the
    // browser-declared Content-Type are both ignored (common/file-upload.ts).
    const validated = validateUpload(params.file?.buffer, {
      allowed: [...ALLOWED_UPLOAD_KINDS],
      maxBytes: MAX_UPLOAD_SIZE_BYTES,
    });

    // A per-assignment requirement has nowhere to attach without a placement,
    // and filing it against the student in general would make it survive a
    // transfer it should not.
    let trainingAssignmentId: string | null = null;
    if (requirement.perAssignment) {
      const assignment = await this.findActiveAssignment(student.id);
      if (!assignment) {
        throw new BadRequestException(
          `Record a placement before uploading the ${requirement.name}`,
        );
      }
      trainingAssignmentId = assignment.id;
    }

    const existing = await this.prisma.client.document.findFirst({
      where: {
        studentId: student.id,
        requirementId: requirement.id,
        // Per-student requirements are matched across every assignment (there is
        // only ever one such document); per-assignment ones only within the
        // placement being uploaded for, so a transferred student's previous MOA
        // is left alone rather than overwritten.
        ...(requirement.perAssignment ? { trainingAssignmentId } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
    });
    if (existing?.status === 'APPROVED') {
      throw new ConflictException(
        `Your ${requirement.name} has already been approved; ask your coordinator to reopen it.`,
      );
    }

    // The auditable name. Built from the requirement's code and the student's
    // own number and surname, never from what the client called the file, and
    // with the extension the content check derived.
    const storageName = buildStorageName({
      studentNumber: student.studentIdNumber,
      code: requirement.code,
      surname: resolveSurname(student),
      ext: validated.ext,
    });
    const path = buildObjectPath(STORAGE_PREFIX, student.id, storageName);
    await uploadFile(path, params.file!.buffer, validated.mimeType);

    const approved = params.reviewedByCoordinatorId !== undefined;
    const data = {
      name: storageName,
      fileUrl: path,
      status: approved ? 'APPROVED' : 'PENDING',
      requirementId: requirement.id,
      trainingAssignmentId,
      uploadedByUserId: params.uploadedByUserId,
      reviewedById: params.reviewedByCoordinatorId ?? null,
      reviewedAt: approved ? new Date() : null,
      // A replacement is a new submission: any note from the last review no
      // longer applies to this file, and the queue should treat it as new work.
      reviewNote: null,
      uploadedAt: new Date(),
    };

    // `.catch` rather than a try/catch around a `let`: the handler only ever
    // throws, so the write's own return type survives inference.
    const saved = await (
      existing
        ? this.prisma.client.document.update({
            where: { id: existing.id },
            data,
            include: DOCUMENT_INCLUDE,
          })
        : this.prisma.client.document.create({
            data: { studentId: student.id, ...data },
            include: DOCUMENT_INCLUDE,
          })
    ).catch(async (err: unknown) => {
      // Nothing references the object now, so leave no orphan behind.
      await this.deleteStoredObject(path, 'document');
      throw err;
    });

    // Only after the row points at the new file — storage is not transactional,
    // and an orphaned object is recoverable where a row pointing at a deleted
    // file is not.
    if (existing) {
      await this.deleteStoredObject(
        existing.fileUrl,
        `replaced document ${existing.id}`,
      );
    }

    return this.presentDocument(saved);
  }

  /* ---------------------------------------------------------------------
   * Coordinator review queue
   * ------------------------------------------------------------------ */

  /** Every document across every establishment — read/review oversight. */
  async listForCoordinator() {
    const documents = await this.prisma.client.document.findMany({
      include: DOCUMENT_INCLUDE,
      orderBy: { uploadedAt: 'desc' },
    });
    return Promise.all(
      documents.map((document) => this.presentDocument(document)),
    );
  }

  /**
   * Approves or rejects one document, and tells the student.
   *
   * `reviewNote` is cleared on approval: an approved document should not still
   * carry the reason it was once rejected.
   */
  async review(
    userId: string,
    documentId: string,
    status: 'APPROVED' | 'REJECTED',
    reviewNote?: string,
  ) {
    const coordinator = await this.getCoordinatorByUserId(userId);
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: {
        student: { select: { userId: true } },
        requirement: { select: { name: true } },
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const updated = await this.prisma.client.document.update({
      where: { id: documentId },
      data: {
        status,
        reviewNote: status === 'REJECTED' ? reviewNote : null,
        reviewedById: coordinator.id,
        reviewedAt: new Date(),
      },
      include: DOCUMENT_INCLUDE,
    });

    const label = document.requirement?.name ?? document.name;
    const approved = status === 'APPROVED';
    await this.notifications.notify(this.prisma.client, {
      userIds: [document.student.userId],
      type: 'DOCUMENT_REVIEWED',
      title: approved ? 'Document approved' : 'Document needs changes',
      body: approved
        ? `Your ${label} was approved.`
        : `Your ${label} was returned: ${reviewNote}`,
      link: '/student/documents',
      entityType: 'Document',
      entityId: documentId,
      // Keyed on uploadedAt, not the id alone: a double-clicked decision is a
      // no-op, but re-reviewing after the student replaces the file (which
      // refreshes uploadedAt) is a new cycle that must notify again. Same
      // convention as ATTENDANCE_APPROVED and the journal review.
      dedupeKey: `DOCUMENT_REVIEWED:${documentId}:${updated.uploadedAt.toISOString()}`,
    });

    return this.presentDocument(updated);
  }

  /* ---------------------------------------------------------------------
   * Coordinator status matrix
   * ------------------------------------------------------------------ */

  /**
   * Who is missing what, across a whole block, without opening each student.
   *
   * `scope: 'block'` (the default) narrows to the requesting coordinator's own
   * blocks and falls back to the whole programme with `noBlocksAssigned` set
   * when they have none — a view default, not an authorization boundary, exactly
   * as `listStudents` and the journal queue do.
   *
   * Three flat queries and an in-memory join, never one query per student or per
   * cell: the batch-then-group shape `batchAssignmentProgress` uses.
   */
  async getStatusMatrix(userId: string, filters: StatusFilters) {
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

    const where: Prisma.StudentWhereInput = {
      ...(blockScopeIds ? { blockId: { in: blockScopeIds } } : {}),
      ...(filters.blockId ? { blockId: filters.blockId } : {}),
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.yearLevel !== undefined
        ? { courseYearLevel: filters.yearLevel }
        : {}),
      // Filtered through the ACTIVE assignment, not the deprecated
      // Student.establishmentId mirror, so a student whose placement has since
      // been closed out is not still counted against that establishment.
      ...(filters.establishmentId
        ? {
            trainingAssignments: {
              some: {
                status: 'ACTIVE',
                establishmentId: filters.establishmentId,
              },
            },
          }
        : {}),
    };

    const students = await this.prisma.client.student.findMany({
      where,
      select: {
        id: true,
        studentIdNumber: true,
        user: { select: { name: true } },
        block: { select: { id: true, name: true } },
        trainingAssignments: {
          where: { status: 'ACTIVE' },
          take: 1,
          select: {
            id: true,
            establishment: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const allRequirements = await this.listRequirements();
    const requirements = filters.stage
      ? allRequirements.filter(
          (requirement) => requirement.stage === filters.stage,
        )
      : allRequirements;

    const studentIds = students.map((student) => student.id);
    const documents = studentIds.length
      ? await this.prisma.client.document.findMany({
          where: {
            studentId: { in: studentIds },
            requirementId: { in: requirements.map((r) => r.id) },
          },
          select: {
            id: true,
            studentId: true,
            requirementId: true,
            trainingAssignmentId: true,
            status: true,
            uploadedAt: true,
          },
        })
      : [];

    const byStudent = new Map<string, typeof documents>();
    for (const document of documents) {
      const list = byStudent.get(document.studentId) ?? [];
      list.push(document);
      byStudent.set(document.studentId, list);
    }

    const rows = students.map((student) => {
      const activeAssignment = student.trainingAssignments[0] ?? null;
      const own = byStudent.get(student.id) ?? [];

      const cells = requirements.map((requirement) => {
        const applicable = !requirement.perAssignment || !!activeAssignment;
        const match = this.matchDocument(
          own,
          requirement,
          activeAssignment?.id ?? null,
        );
        return {
          requirementId: requirement.id,
          code: requirement.code,
          state: cellState(match?.status, applicable),
          documentId: match?.id,
          submittedAt: match?.uploadedAt,
        };
      });

      const applicableCells = cells.filter(
        (cell) => cell.state !== 'NOT_APPLICABLE',
      );
      return {
        student: {
          id: student.id,
          studentIdNumber: student.studentIdNumber,
          name: student.user.name,
          block: student.block,
          establishment: activeAssignment?.establishment ?? null,
          hasActiveAssignment: activeAssignment !== null,
        },
        cells,
        approvedCount: applicableCells.filter(
          (cell) => cell.state === 'APPROVED',
        ).length,
        applicableCount: applicableCells.length,
      };
    });

    return {
      noBlocksAssigned,
      requirements,
      stages: DOCUMENT_STAGES.filter((stage) =>
        requirements.some((requirement) => requirement.stage === stage),
      ),
      rows,
    };
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  /**
   * The document satisfying `requirement`, if any.
   *
   * A per-assignment requirement is only satisfied by a document filed against
   * the assignment in question — the same MOA cannot count for a placement it
   * was not written for. Per-student requirements ignore the assignment
   * entirely.
   */
  private matchDocument<
    T extends {
      requirementId: string | null;
      trainingAssignmentId: string | null;
      uploadedAt: Date;
    },
  >(
    documents: T[],
    requirement: { id: string; perAssignment: boolean },
    activeAssignmentId: string | null,
  ): T | undefined {
    const candidates = documents.filter(
      (document) =>
        document.requirementId === requirement.id &&
        (!requirement.perAssignment ||
          document.trainingAssignmentId === activeAssignmentId),
    );
    if (candidates.length <= 1) return candidates[0];
    // Only reachable for rows written before the replace-in-place rule (or a
    // legacy backfilled duplicate): the newest upload is the one that counts.
    return [...candidates].sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    )[0];
  }

  /**
   * Swaps the stored path for a signed URL that downloads under the document's
   * own conventional name.
   *
   * A legacy row's `name` is free text with no extension, so the stored object's
   * extension is appended — otherwise the browser would save an extensionless
   * file that nothing opens.
   */
  private async presentDocument<T extends { name: string; fileUrl: string }>(
    document: T,
  ) {
    return withSignedUrl(document, downloadNameFor(document));
  }

  private async findActiveAssignment(studentId: string) {
    return this.prisma.client.trainingAssignment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      select: {
        id: true,
        establishment: { select: { id: true, name: true } },
      },
    });
  }

  private async getStudentByUserId(userId: string): Promise<StudentForUpload> {
    const student = await this.prisma.client.student.findUnique({
      where: { userId },
      select: STUDENT_SELECT,
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
  }

  private async getStudentOrThrow(
    studentId: string,
  ): Promise<StudentForUpload> {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: STUDENT_SELECT,
    });
    if (!student) {
      throw new NotFoundException('Student not found');
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

  /** Best-effort: an orphaned object wastes a few KB, a failed request costs more. */
  private async deleteStoredObject(path: string, label: string) {
    try {
      await deleteFile(path);
    } catch (err) {
      this.logger.error(
        `${label} no longer references storage object "${path}" but it was not deleted: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}

const STUDENT_SELECT = {
  id: true,
  studentIdNumber: true,
  lastName: true,
  user: { select: { name: true } },
} as const;

type StudentForUpload = {
  id: string;
  studentIdNumber: string;
  lastName: string | null;
  user: { name: string };
};

/**
 * `Document.status` (or its absence) as a matrix/checklist state.
 *
 * Kept as one function so the student's checklist and the coordinator's matrix
 * can never disagree about what an unsubmitted or rejected requirement looks
 * like.
 */
function cellState(
  status: string | undefined,
  applicable: boolean,
): RequirementState {
  if (!applicable) return 'NOT_APPLICABLE';
  if (!status) return 'MISSING';
  if (status === 'APPROVED') return 'APPROVED';
  if (status === 'REJECTED') return 'DECLINED';
  return 'PENDING';
}

/**
 * What a download should save the file as.
 *
 * For anything uploaded against a requirement this is already the conventional
 * name (`2022-00145_MOA_MUNDO.pdf`). A legacy row's free-text title gets the
 * stored object's extension appended when it has none, so the saved file still
 * opens.
 */
function downloadNameFor(document: { name: string; fileUrl: string }): string {
  const ext = extensionOf(document.fileUrl);
  if (!ext || document.name.toLowerCase().endsWith(ext.toLowerCase())) {
    return document.name;
  }
  return `${document.name}${ext}`;
}

/**
 * The surname for the conventional filename. `Student.lastName` is nullable
 * (every row predating that column has none), so fall back to the last word of
 * the display name rather than producing `2022-00145_MOA_.pdf`.
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
