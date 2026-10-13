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
  ZERO_ASSIGNMENT_PROGRESS,
} from '../common/assignment-progress';
import { assertDutyDay } from '../common/duty-days';
import {
  buildStorageName,
  MAX_UPLOAD_SIZE_BYTES,
  validateUpload,
} from '../common/file-upload';
import { buildObjectPath, deleteFile, uploadFile } from '../common/storage';
import { extensionOf, withSignedUrl } from '../common/signed-url';
import { GRADED_BY_SELECT } from '../common/assignment-grade';
import { withAge } from '../common/age';
import { assertValidAddress } from '../common/ph-address';
import {
  EVALUATION_INCLUDE,
  withSectionTotals,
} from '../supervisor/supervisor.service';

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
  region?: string | null;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
  streetAddress?: string | null;
  postalCode?: string | null;
}

interface UploadCredentialInput {
  type: string;
}

const ADDRESS_KEYS = [
  'region',
  'province',
  'cityMunicipality',
  'barangay',
  'postalCode',
] as const;

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
  enrolledCourse: { select: { id: true, code: true, name: true } },
  block: { select: { id: true, name: true } },
} as const;

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
      // `user.name` is the fallback surname for a credential's conventional
      // filename when `lastName` is null (rows predating that column).
      include: { user: { select: { name: true } } },
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
      ...withAge(profile),
      assessment: await this.getAssessment(student.id),
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

  /**
   * The student's two-part assessment, across every placement they have had.
   *
   * `grades` is one row per placement the coordinator has graded — absent, not
   * a zero, until then. They are not limited to the ACTIVE assignment like the
   * hour figures above: a grade is usually recorded after the placement has
   * closed, which is exactly when it stops being the active one.
   *
   * `evaluations` lists the supervisor's sheets by total only; the full sheet
   * is `getEvaluation`. Kept flat rather than nested under a placement because
   * a legacy sheet has no assignment to hang from.
   */
  private async getAssessment(studentId: string) {
    const grades = await this.prisma.client.trainingAssignment.findMany({
      where: { studentId, coordinatorGrade: { not: null } },
      select: {
        id: true,
        academicYear: true,
        status: true,
        startDate: true,
        endDate: true,
        coordinatorGrade: true,
        coordinatorGradeRemarks: true,
        gradedAt: true,
        gradedBy: GRADED_BY_SELECT,
        establishment: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    const evaluations = await this.prisma.client.evaluation.findMany({
      where: { studentId },
      select: {
        id: true,
        trainingAssignmentId: true,
        totalRating: true,
        maxTotalRating: true,
        trainingEmployedAt: true,
        evaluatorName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { grades, evaluations };
  }

  /**
   * One of the student's own evaluation sheets in full, for the print view.
   *
   * Rendered from the template version it was signed on, the same as the
   * supervisor's and coordinator's reads (`EVALUATION_INCLUDE`). Ownership is
   * re-derived from the JWT — the id in the path proves nothing.
   */
  async getEvaluation(userId: string, evaluationId: string) {
    const student = await this.getStudentByUserId(userId);

    const evaluation = await this.prisma.client.evaluation.findUnique({
      where: { id: evaluationId },
      include: EVALUATION_INCLUDE,
    });
    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }
    if (evaluation.studentId !== student.id) {
      throw new ForbiddenException('This evaluation does not belong to you');
    }

    return { ...withSectionTotals(evaluation), canModify: false };
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

    // Non-duty days are excluded from attendance (thesis rule) — the check and
    // its wording are shared with journal entries, see common/duty-days.ts.
    assertDutyDay(date, activeAssignment.dutyDays);

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
    // `age` is derived from the date of birth here, read-only — it is not a
    // column and cannot be sent back.
    return withAge(student);
  }

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const student = await this.getStudentByUserId(userId);

    // Checked as the address will stand after this update — see
    // CoordinatorService.updateStudent for the same merge.
    if (ADDRESS_KEYS.some((key) => data[key] !== undefined)) {
      assertValidAddress(
        Object.fromEntries(
          ADDRESS_KEYS.map((key) => [
            key,
            data[key] === undefined ? student[key] : data[key],
          ]),
        ),
      );
    }

    const updated = await this.prisma.client.student.update({
      where: { id: student.id },
      data,
      include: PROFILE_INCLUDE,
    });
    return withAge(updated);
  }

  /**
   * Stores one credential.
   *
   * Credentials stay student-level and outside the Table 3 checklist (they have
   * no review lifecycle and no per-assignment rule), but they now share the
   * documents' two file rules: the real type comes from the content signature,
   * and the stored name follows the school's convention so a download is
   * identifiable without opening it.
   */
  async uploadCredential(
    userId: string,
    data: UploadCredentialInput,
    file: Express.Multer.File | undefined,
  ) {
    const student = await this.getStudentByUserId(userId);
    const validated = validateUpload(file?.buffer, {
      allowed: ['pdf', 'jpg', 'png'],
      maxBytes: MAX_UPLOAD_SIZE_BYTES,
    });

    const path = buildObjectPath(
      'credentials',
      student.id,
      credentialFileName(student, data.type, validated.ext),
    );
    await uploadFile(path, file!.buffer, validated.mimeType);

    const created = await this.prisma.client.credential.create({
      data: {
        studentId: student.id,
        type: data.type,
        fileUrl: path,
      },
    });

    return withSignedUrl(created, credentialDownloadName(student, created));
  }

  async getMyCredentials(userId: string) {
    const student = await this.getStudentByUserId(userId);

    const credentials = await this.prisma.client.credential.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      credentials.map((credential) =>
        withSignedUrl(credential, credentialDownloadName(student, credential)),
      ),
    );
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

/**
 * The conventional name for a credential: `StudentNo_TYPE_SURNAME.ext`, the same
 * convention Table 3 documents follow, with the credential's own type as the
 * code (`2022-00145_MEDICAL_CERTIFICATE_MUNDO.pdf`).
 */
function credentialFileName(
  student: {
    studentIdNumber: string;
    lastName: string | null;
    user?: { name: string };
  },
  type: string,
  ext: string,
): string {
  return buildStorageName({
    studentNumber: student.studentIdNumber,
    code: type,
    surname: credentialSurname(student),
    ext,
  });
}

/**
 * What a credential download saves as. Derived from the stored path's extension
 * rather than a column — `Credential` has no `mimeType`, and rows written before
 * the content check exists only carry the extension in their path.
 */
function credentialDownloadName(
  student: {
    studentIdNumber: string;
    lastName: string | null;
    user?: { name: string };
  },
  credential: { type: string; fileUrl: string },
): string {
  return credentialFileName(
    student,
    credential.type,
    extensionOf(credential.fileUrl),
  );
}

/** `Student.lastName` is nullable, so fall back to the display name's last word. */
function credentialSurname(student: {
  lastName: string | null;
  user?: { name: string };
}): string {
  const explicit = student.lastName?.trim();
  if (explicit) return explicit;
  const parts = (student.user?.name ?? '').trim().split(/\s+/);
  return parts[parts.length - 1] || 'STUDENT';
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
