import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hoursForAttendance } from '../common/attendance-hours';
import {
  formatDateOnly,
  manilaToday,
  startOfUtcDay,
  toUtcDateOnly,
} from '../common/dates';
import {
  computeProgress,
  WEEKDAY_BY_JS_DAY,
  ZERO_ASSIGNMENT_PROGRESS,
} from '../common/assignment-progress';
import {
  buildObjectPath,
  deleteFile,
  getSignedUrl,
  uploadFile,
} from '../common/storage';

interface SubmitAttendanceInput {
  date: string;
  timeInAM?: string;
  timeOutAM?: string;
  timeInPM?: string;
  timeOutPM?: string;
  remarks?: string;
}

interface UpdateProfileInput {
  /** `null` = explicitly cleared; `undefined` = not supplied, leave unchanged. */
  contactNumber?: string | null;
  address?: string | null;
}

interface UploadDocumentInput {
  name: string;
}

interface UploadCredentialInput {
  type: string;
}

/** Exported so the client's dropdown offers exactly these — no Prisma enum, no migration. */
export const CREDENTIAL_TYPES = [
  'RESUME',
  'ENDORSEMENT_LETTER',
  'MEDICAL_CERTIFICATE',
  'PARENTAL_CONSENT',
  'INSURANCE',
  'CERTIFICATE_OF_REGISTRATION',
  'OTHER',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

const PROFILE_INCLUDE = {
  user: { select: { id: true, email: true, name: true } },
  establishment: { select: { id: true, name: true } },
} as const;

/** Shared with `coordinator.service.ts` — the reviewer's cross-establishment list. */
export const DOCUMENT_INCLUDE = {
  student: {
    select: {
      id: true,
      studentIdNumber: true,
      user: { select: { name: true } },
      establishment: { select: { id: true, name: true } },
    },
  },
  reviewedBy: {
    select: { id: true, user: { select: { name: true } } },
  },
} as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Removes a storage object after its row is already gone.
   *
   * Non-fatal by design: an orphaned file wastes a few KB and can be swept up
   * later, while failing the request here would report an error for a delete
   * that actually succeeded.
   */
  private async deleteStoredObject(path: string, label: string) {
    try {
      await deleteFile(path);
    } catch (err) {
      this.logger.error(
        `${label} row was deleted but its storage object "${path}" was not: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  private async getStudentByUserId(userId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { userId },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
  }

  async getDashboard(userId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        establishment: {
          select: {
            id: true,
            name: true,
            industryType: true,
            coordinatorFirstName: true,
            coordinatorLastName: true,
            coordinatorContact: true,
            coordinatorEmail: true,
          },
        },
        // All-time, across every assignment the student has ever had — this
        // is a raw activity log, not a progress figure, so it is left
        // unscoped. The hour/progress figures below are scoped to the ACTIVE
        // assignment only, per-assignment, the same as every other progress
        // figure in the app now is.
        attendances: { orderBy: { date: 'desc' } },
        trainingAssignments: {
          where: { status: 'ACTIVE' },
          take: 1,
          select: { id: true },
        },
        _count: { select: { documents: true, credentials: true } },
      },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    const { attendances, trainingAssignments, ...profile } = student;
    const activeAssignment = trainingAssignments[0] ?? null;
    // Zeroed, with the flag below, rather than crashing — a student between
    // placements (or never yet placed) still has a dashboard to load.
    const progress = activeAssignment
      ? await computeProgress(this.prisma.client, activeAssignment.id)
      : ZERO_ASSIGNMENT_PROGRESS;

    return {
      ...profile,
      stats: {
        hasActiveAssignment: activeAssignment !== null,
        completedHours: progress.approvedHours,
        pendingHours: progress.pendingHours,
        requiredHours: progress.requiredHours,
        remainingHours: progress.remainingHours,
        percentComplete: progress.percentComplete,
        expectedDutyDaysToDate: progress.expectedDutyDaysToDate,
        daysWithApprovedAttendance: progress.daysWithApprovedAttendance,
        totalLogs: attendances.length,
        approvedCount: attendances.filter((a) => a.status === 'APPROVED')
          .length,
        pendingCount: attendances.filter((a) => a.status === 'PENDING').length,
        declinedCount: attendances.filter((a) => a.status === 'DECLINED')
          .length,
      },
      recentAttendance: attendances.slice(0, 5).map(withHours),
    };
  }

  async submitAttendance(userId: string, data: SubmitAttendanceInput) {
    const student = await this.getStudentByUserId(userId);

    const date = startOfUtcDay(data.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('date is not a valid date');
    }

    // Completion is determined by hours, not the calendar — a student who
    // hasn't met requiredHours by their scheduled endDate keeps logging past
    // it, so endDate is NOT a bound here. Only status COMPLETED closes
    // logging.
    if (student.status === 'COMPLETED') {
      throw new BadRequestException(
        'Your OJT is complete. Attendance can no longer be logged.',
      );
    }

    // No establishment means no supervisor can see the row: the approval queue
    // is scoped to an establishment, so an unassigned student's submissions
    // would sit PENDING forever as unbankable hours. `establishmentId` is
    // nullable and the establishment cascade nulls it (CLAUDE.md §6), so this
    // is a reachable state, not a theoretical one.
    if (!student.establishmentId) {
      throw new BadRequestException(
        'You are not assigned to an establishment yet. Contact your coordinator.',
      );
    }

    // The stricter, TrainingAssignment-based version of the check above:
    // `establishmentId` is mirrored from the ACTIVE assignment at placement
    // time (CoordinatorService.createPlacement) but is not cleared when an
    // assignment is later marked COMPLETED/CANCELLED via
    // PATCH /coordinator/assignments/:id — a student can fail this even while
    // the check above passes, and every new attendance row needs a live
    // assignment to attach to regardless.
    const activeAssignment =
      await this.prisma.client.trainingAssignment.findFirst({
        where: { studentId: student.id, status: 'ACTIVE' },
      });
    if (!activeAssignment) {
      throw new BadRequestException('You have no active training placement.');
    }

    // The submitted date must fall within the ACTIVE assignment's own
    // window, not the deprecated Student.startDate/endDate mirror: the
    // mirror is only ever written at placement time
    // (CoordinatorService.createPlacement) and never updated again, while
    // `endDate` on the assignment itself CAN change afterwards
    // (PATCH /coordinator/assignments/:id) — checking the live assignment is
    // the only way an early end date actually stops new logging.
    //
    // Compared as calendar dates, never timestamps, against Manila's
    // calendar day rather than the server's (the server may run in UTC,
    // where an early-morning Manila (UTC+8) submission can already be
    // "tomorrow" while the server still reads "today"). Each bound gets its
    // own message — a combined "between X and Y" range reads as inverted
    // nonsense when, e.g., an OJT period that hasn't started yet has
    // startDate > today.
    const today = manilaToday();
    const assignmentStart = toUtcDateOnly(activeAssignment.startDate);
    if (date.getTime() < assignmentStart.getTime()) {
      throw new BadRequestException(
        `Your current placement starts on ${formatDateOnly(assignmentStart)}. You cannot log attendance before then.`,
      );
    }
    if (activeAssignment.endDate) {
      const assignmentEnd = toUtcDateOnly(activeAssignment.endDate);
      if (date.getTime() >= assignmentEnd.getTime()) {
        throw new BadRequestException(
          `Your current placement ended on ${formatDateOnly(assignmentEnd)}. You cannot log attendance on or after then.`,
        );
      }
    }
    if (date.getTime() > today.getTime()) {
      throw new BadRequestException(
        'Attendance cannot be logged for a future date.',
      );
    }

    // Non-duty days are excluded from attendance (thesis rule): a Wed-Fri
    // assignment is never "absent" on Mon/Tue, so those days are not
    // loggable at all, not merely unpenalised.
    const submittedWeekday = WEEKDAY_BY_JS_DAY[date.getUTCDay()];
    if (!activeAssignment.dutyDays.includes(submittedWeekday)) {
      const scheduled = [...activeAssignment.dutyDays]
        .sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))
        .map((day) => WEEKDAY_LABELS[day])
        .join(', ');
      throw new BadRequestException(
        `${WEEKDAY_LABELS[submittedWeekday]} is not one of your scheduled duty days (${scheduled}).`,
      );
    }

    const times = {
      timeInAM: parseTime(data.timeInAM),
      timeOutAM: parseTime(data.timeOutAM),
      timeInPM: parseTime(data.timeInPM),
      timeOutPM: parseTime(data.timeOutPM),
    };

    // A log with no complete session is meaningless — it would contribute zero
    // hours and just sit in the supervisor's approval queue.
    const hasAmSession = !!times.timeInAM && !!times.timeOutAM;
    const hasPmSession = !!times.timeInPM && !!times.timeOutPM;
    if (!hasAmSession && !hasPmSession) {
      throw new BadRequestException(
        'Provide a complete AM or PM session (both a time in and a time out)',
      );
    }

    // hoursForAttendance's total-only check would let an inverted session
    // (timeOut before timeIn) through silently scored as 0 as long as the
    // other session is positive — validate each supplied session on its own.
    if (
      hasAmSession &&
      times.timeOutAM!.getTime() <= times.timeInAM!.getTime()
    ) {
      throw new BadRequestException(
        'Morning time out must be later than time in',
      );
    }
    if (
      hasPmSession &&
      times.timeOutPM!.getTime() <= times.timeInPM!.getTime()
    ) {
      throw new BadRequestException(
        'Afternoon time out must be later than time in',
      );
    }

    const existing = await this.prisma.client.attendance.findUnique({
      where: { studentId_date: { studentId: student.id, date } },
    });
    // APPROVED is the only status that blocks a resubmission — approved hours
    // must never change after the fact. PENDING is allowed through as well as
    // DECLINED: the supervisor hasn't acted on it yet, so a typo the student
    // notices before review should still be fixable.
    if (existing && existing.status === 'APPROVED') {
      throw new ConflictException(
        'This date has already been approved and cannot be resubmitted',
      );
    }

    // A PENDING or DECLINED row is corrected in place rather than blocked —
    // otherwise the student would permanently lose those hours with no way to
    // fix the log.
    const record = existing
      ? await this.prisma.client.attendance.update({
          where: { id: existing.id },
          data: {
            ...times,
            remarks: data.remarks,
            status: 'PENDING',
            declineReason: null,
            approvedById: null,
            // A DECLINED row being corrected back to PENDING is re-pointed at
            // whichever assignment is ACTIVE now, matching a fresh create —
            // it may not be the one it was originally logged against if the
            // student was reassigned in between.
            trainingAssignmentId: activeAssignment.id,
            // This *is* the (re)submission — reset the 21-day overdue clock
            // (common/attendance-overdue.ts) so a corrected entry starts its
            // wait over rather than inheriting however old the original row
            // already was. `createdAt` stays untouched (Prisma only writes
            // fields present here), which is deliberate — see submittedAt's
            // schema comment.
            submittedAt: new Date(),
          },
        })
      : await this.prisma.client.attendance.create({
          data: {
            studentId: student.id,
            date,
            ...times,
            remarks: data.remarks,
            status: 'PENDING',
            trainingAssignmentId: activeAssignment.id,
          },
        });

    return withHours(record);
  }

  async getAttendanceHistory(userId: string) {
    const student = await this.getStudentByUserId(userId);

    const attendances = await this.prisma.client.attendance.findMany({
      where: { studentId: student.id },
      orderBy: { date: 'desc' },
    });

    return attendances.map(withHours);
  }

  async getProfile(userId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    if (!student) {
      throw new NotFoundException('Student profile not found');
    }
    return student;
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const student = await this.getStudentByUserId(userId);
    return this.prisma.client.student.update({
      where: { id: student.id },
      data,
      include: PROFILE_INCLUDE,
    });
  }

  async uploadDocument(
    userId: string,
    data: UploadDocumentInput,
    file: Express.Multer.File | undefined,
  ) {
    const student = await this.getStudentByUserId(userId);
    assertValidDocumentFile(file);

    // Nullable, and deliberately not required: the thesis has students
    // uploading an application letter/resume BEFORE they are placed anywhere,
    // so a document must still be uploadable with no ACTIVE assignment to
    // attach to.
    const activeAssignment =
      await this.prisma.client.trainingAssignment.findFirst({
        where: { studentId: student.id, status: 'ACTIVE' },
        select: { id: true },
      });

    const path = buildObjectPath('documents', student.id, file.originalname);
    await uploadFile(path, file.buffer, file.mimetype);

    const created = await this.prisma.client.document.create({
      data: {
        studentId: student.id,
        name: data.name,
        fileUrl: path,
        status: 'PENDING',
        trainingAssignmentId: activeAssignment?.id,
      },
    });

    return withSignedUrl(created);
  }

  async getMyDocuments(userId: string) {
    const student = await this.getStudentByUserId(userId);

    const documents = await this.prisma.client.document.findMany({
      where: { studentId: student.id },
      orderBy: { uploadedAt: 'desc' },
    });

    return Promise.all(documents.map(withSignedUrl));
  }

  async deleteDocument(userId: string, documentId: string) {
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
    // student was given) should stay put rather than silently disappear.
    if (document.status !== 'PENDING') {
      throw new ConflictException(
        'Only a document still pending review can be deleted',
      );
    }

    // Row first, then the object — the same order the cascade deletes use
    // (CLAUDE.md §6). Reversed, a storage success followed by a failed row
    // delete leaves a row pointing at nothing, which is the state that used to
    // 500 the whole documents list.
    await this.prisma.client.document.delete({ where: { id: documentId } });
    await this.deleteStoredObject(document.fileUrl, `document ${documentId}`);

    return { id: documentId, deleted: true };
  }

  async uploadCredential(
    userId: string,
    data: UploadCredentialInput,
    file: Express.Multer.File | undefined,
  ) {
    const student = await this.getStudentByUserId(userId);
    assertValidDocumentFile(file);

    const path = buildObjectPath('credentials', student.id, file.originalname);
    await uploadFile(path, file.buffer, file.mimetype);

    const created = await this.prisma.client.credential.create({
      data: {
        studentId: student.id,
        type: data.type,
        fileUrl: path,
      },
    });

    return withSignedUrl(created);
  }

  async getMyCredentials(userId: string) {
    const student = await this.getStudentByUserId(userId);

    const credentials = await this.prisma.client.credential.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(credentials.map(withSignedUrl));
  }

  async deleteCredential(userId: string, credentialId: string) {
    const student = await this.getStudentByUserId(userId);

    const credential = await this.prisma.client.credential.findUnique({
      where: { id: credentialId },
    });
    if (!credential) {
      throw new NotFoundException('Credential not found');
    }
    if (credential.studentId !== student.id) {
      throw new ForbiddenException('This credential does not belong to you');
    }

    // No review state to guard on — a credential is uploaded and listed,
    // that's the whole lifecycle, so the student may delete any of their own.
    // Row first, then the object — see deleteDocument.
    await this.prisma.client.credential.delete({
      where: { id: credentialId },
    });
    await this.deleteStoredObject(
      credential.fileUrl,
      `credential ${credentialId}`,
    );

    return { id: credentialId, deleted: true };
  }
}

/** Replaces the stored object path with a freshly minted signed URL. */
/**
 * Swaps a stored object path for a short-lived signed URL.
 *
 * Never throws. A missing object yields `fileUrl: null` so the row still
 * renders as "unavailable" — these run under `Promise.all` across a whole list
 * (`getMyDocuments`, `getMyCredentials`, the coordinator's `getDocuments`), and
 * a throw there took out the entire page for every student rather than the one
 * bad row. The likeliest cause is a storage object deleted out from under the
 * row, so it is logged loudly and left for someone to clean up.
 */
export async function withSignedUrl<T extends { fileUrl: string }>(
  record: T,
): Promise<T & { fileUrl: string | null }> {
  try {
    return { ...record, fileUrl: await getSignedUrl(record.fileUrl) };
  } catch (err) {
    storageLogger.error(
      `No signed URL for stored object "${record.fileUrl}" — the row survives with fileUrl: null: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return { ...record, fileUrl: null };
  }
}

/** Module-scope: `withSignedUrl` is a free function, not part of the service. */
const storageLogger = new Logger('StorageSignedUrl');

/** Canonical Mon-first week order, for sorting `dutyDays` into a readable message. */
const WEEK_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const WEEKDAY_LABELS: Record<string, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

function assertValidDocumentFile(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('A file is required');
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException('Only PDF, PNG or JPEG files are accepted');
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new BadRequestException('File must be 10MB or smaller');
  }
}

/** Adds the derived hours so the client never recomputes them. */
function withHours<T extends Parameters<typeof hoursForAttendance>[0]>(
  record: T,
) {
  return {
    ...record,
    hours: Math.round(hoursForAttendance(record) * 100) / 100,
  };
}

function parseTime(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`"${value}" is not a valid time`);
  }
  return parsed;
}
