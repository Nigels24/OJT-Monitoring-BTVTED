import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeProgress } from '../common/assignment-progress';
import { loadCompletionChecklist } from '../common/assignment-completion';
import { buildAttendanceSummary } from '../common/attendance-summary';
import { isOverdue } from '../common/attendance-overdue';
import { resolveBlockScope } from '../common/coordinator-scope';
import { MS_PER_DAY, manilaToday, startOfUtcDay } from '../common/dates';
import { buildDtrMonth, monthRange } from '../common/dtr';
import { formatDutyDays } from '../common/duty-days';
import { formatLastFirst } from '../common/person-name';
import { signedUrlOrNull } from '../common/signed-url';
import {
  StudentFilters,
  buildStudentWhere,
  trainingStatusOf,
} from '../common/student-filters';

export interface ReportUser {
  userId: string;
  role: string;
}

/** The longest range one attendance summary may cover. */
const MAX_SUMMARY_DAYS = 400;

const ATTENDANCE_SELECT = {
  date: true,
  status: true,
  timeInAM: true,
  timeOutAM: true,
  timeInPM: true,
  timeOutPM: true,
} as const;

/** A placement with everything a report header prints. */
const PLACEMENT_SELECT = {
  id: true,
  studentId: true,
  establishmentId: true,
  status: true,
  academicYear: true,
  yearLevel: true,
  requiredHours: true,
  dutyDays: true,
  startDate: true,
  endDate: true,
  coordinatorGrade: true,
  coordinatorGradeRemarks: true,
  gradedAt: true,
  gradedBy: { select: { user: { select: { name: true } } } },
  establishment: { select: { id: true, name: true } },
  block: { select: { id: true, name: true } },
  student: {
    select: {
      id: true,
      userId: true,
      studentIdNumber: true,
      firstName: true,
      lastName: true,
      middleName: true,
      course: true,
      user: { select: { name: true } },
      enrolledCourse: { select: { code: true, name: true } },
      block: { select: { id: true, name: true } },
    },
  },
} as const;

/**
 * The printable reports: the Form 48 daily time record, attendance summary,
 * progress report, compiled journal and assessment record for one placement,
 * and the coordinator's program/block summary.
 *
 * Read-only. Every figure comes from a helper that already owns it — hours
 * from `attendance-hours.ts`, progress from `assignment-progress.ts`, the
 * month grid from `dtr.ts` — so a report can never disagree with the screen
 * it was printed from.
 *
 * **Access is decided in `resolvePlacement`**, once, for every placement
 * report: a student reads their own placements, a supervisor those at their
 * establishment, a coordinator any. The role comes from the JWT and the
 * placement's owner from the database — never from the request.
 */
@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  /* ---------------------------------------------------------------------
   * Placement reports
   * ------------------------------------------------------------------ */

  /**
   * The daily time record for one month, in the shape of Civil Service Form
   * No. 48: every calendar day with its four clock times, **approved entries
   * only**, and the month's total.
   */
  async dtr(user: ReportUser, assignmentId: string | undefined, month: string) {
    const placement = await this.resolvePlacement(user, assignmentId);
    const { start, end } = monthRange(month);

    const rows = await this.prisma.client.attendance.findMany({
      where: {
        trainingAssignmentId: placement.id,
        // Narrowed here for the query's sake; `buildDtrMonth` applies the
        // same two rules itself and does not rely on this.
        status: 'APPROVED',
        date: { gte: start, lt: end },
      },
      select: {
        ...ATTENDANCE_SELECT,
        approvedBy: { select: { user: { select: { name: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    return {
      ...this.header(placement),
      ...buildDtrMonth(month, rows, placement.dutyDays),
      // Who verified it — the "In-Charge" line.
      supervisorName: await this.inChargeName(
        user,
        placement.establishmentId,
        rows.map((row) => row.approvedBy?.user.name ?? null),
      ),
    };
  }

  /**
   * Every day of a date range with its entry or its absence, and totals.
   * Defaults to the whole placement so far.
   */
  async attendanceSummary(
    user: ReportUser,
    assignmentId: string | undefined,
    range: { from?: string; to?: string },
  ) {
    const placement = await this.resolvePlacement(user, assignmentId);
    const today = manilaToday();
    const placementStart = startOfUtcDay(placement.startDate);
    const placementEnd = placement.endDate
      ? startOfUtcDay(placement.endDate)
      : null;

    const from = range.from ? startOfUtcDay(range.from) : placementStart;
    const to = range.to
      ? startOfUtcDay(range.to)
      : new Date(
          Math.min(
            today.getTime(),
            placementEnd ? placementEnd.getTime() - MS_PER_DAY : Infinity,
          ),
        );
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from and to must be valid dates');
    }
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException(
        'The end of the range is before its start.',
      );
    }
    if ((to.getTime() - from.getTime()) / MS_PER_DAY > MAX_SUMMARY_DAYS) {
      throw new BadRequestException(
        `An attendance summary can cover at most ${MAX_SUMMARY_DAYS} days.`,
      );
    }

    const rows = await this.prisma.client.attendance.findMany({
      where: {
        trainingAssignmentId: placement.id,
        date: { gte: from, lte: to },
      },
      select: ATTENDANCE_SELECT,
      orderBy: { date: 'asc' },
    });

    return {
      ...this.header(placement),
      range: { from, to },
      ...buildAttendanceSummary(
        { from, to },
        rows,
        {
          startDate: placementStart,
          endDate: placementEnd,
          dutyDays: placement.dutyDays,
        },
        today,
      ),
    };
  }

  /** Required, completed and remaining hours, and the completion checklist. */
  async progress(user: ReportUser, assignmentId: string | undefined) {
    const placement = await this.resolvePlacement(user, assignmentId);
    return {
      ...this.header(placement),
      progress: await computeProgress(this.prisma.client, placement.id),
      completion: await loadCompletionChecklist(
        this.prisma.client,
        placement.id,
      ),
    };
  }

  /**
   * The compiled journal: the placement's ACCEPTED entries in date order,
   * with their photos. An entry the coordinator has not accepted is not part
   * of the compiled record. The coordinator's remarks are not selected at
   * all — they are review notes, not journal content, and a supervisor may
   * not read them (CLAUDE.md §12).
   */
  async journal(user: ReportUser, assignmentId: string | undefined) {
    const placement = await this.resolvePlacement(user, assignmentId);
    const entries = await this.prisma.client.journalEntry.findMany({
      where: { trainingAssignmentId: placement.id, status: 'ACCEPTED' },
      select: {
        id: true,
        entryDate: true,
        activities: true,
        learnings: true,
        photos: {
          select: { id: true, storagePath: true, originalName: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { entryDate: 'asc' },
    });

    return {
      ...this.header(placement),
      supervisorName: await this.inChargeName(
        user,
        placement.establishmentId,
        [],
      ),
      entries: await Promise.all(
        entries.map(async ({ photos, ...entry }) => ({
          ...entry,
          // Signing never throws: a missing object is a `null` URL, so one
          // lost photo does not fail the whole journal (CLAUDE.md §8).
          photos: await Promise.all(
            photos.map(async ({ storagePath, ...photo }) => ({
              ...photo,
              url: await signedUrlOrNull(storagePath),
            })),
          ),
        })),
      ),
    };
  }

  /**
   * The two-part assessment on one page: the supervisor's evaluation sheets
   * (totals only — the full sheet has its own print view) and the
   * coordinator's grade. The two are listed side by side and never combined
   * (CLAUDE.md §13). A supervisor gets the grade but not its remarks.
   */
  async assessment(user: ReportUser, assignmentId: string | undefined) {
    const placement = await this.resolvePlacement(user, assignmentId);
    const evaluations = await this.prisma.client.evaluation.findMany({
      where: { trainingAssignmentId: placement.id },
      select: {
        id: true,
        totalRating: true,
        maxTotalRating: true,
        evaluatorName: true,
        evaluatorPosition: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...this.header(placement),
      evaluations,
      coordinatorGrade: {
        grade: placement.coordinatorGrade,
        remarks:
          user.role === 'SUPERVISOR' ? null : placement.coordinatorGradeRemarks,
        gradedAt: placement.gradedAt,
        gradedByName: placement.gradedBy?.user.name ?? null,
      },
    };
  }

  /* ---------------------------------------------------------------------
   * Coordinator summary
   * ------------------------------------------------------------------ */

  /**
   * The program/block summary for a filter selection: how many trainees are
   * active and completed, which establishments have unverified attendance
   * waiting, and which students are missing required documents.
   *
   * The students are selected by `buildStudentWhere` — the same query builder
   * the Students list uses — so the counts here are the counts of that list.
   * Three flat queries, grouped in memory (CLAUDE.md §8).
   */
  async summary(
    userId: string,
    filters: StudentFilters & { scope?: 'block' | 'all' },
  ) {
    const { blockScopeIds, noBlocksAssigned } = await resolveBlockScope(
      this.prisma.client,
      userId,
      filters.scope,
    );

    const students = await this.prisma.client.student.findMany({
      where: buildStudentWhere(filters, blockScopeIds),
      select: {
        id: true,
        studentIdNumber: true,
        firstName: true,
        lastName: true,
        middleName: true,
        user: { select: { name: true } },
        establishment: { select: { id: true, name: true } },
        trainingAssignments: {
          select: {
            id: true,
            status: true,
            establishment: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const studentIds = students.map((student) => student.id);

    const [pendingAttendance, requirements, documents] =
      studentIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.prisma.client.attendance.findMany({
              where: { studentId: { in: studentIds }, status: 'PENDING' },
              select: {
                studentId: true,
                status: true,
                submittedAt: true,
                trainingAssignment: {
                  select: {
                    establishment: { select: { id: true, name: true } },
                  },
                },
              },
            }),
            this.prisma.client.documentRequirement.findMany({
              where: { isActive: true },
              select: { id: true, code: true, name: true, perAssignment: true },
              orderBy: { sortOrder: 'asc' },
            }),
            this.prisma.client.document.findMany({
              where: { studentId: { in: studentIds } },
              select: {
                studentId: true,
                requirementId: true,
                trainingAssignmentId: true,
                status: true,
              },
            }),
          ]);

    /* ---- trainee counts ---- */
    const counts = {
      total: students.length,
      ACTIVE: 0,
      COMPLETED: 0,
      ENDED: 0,
      NONE: 0,
    };
    for (const student of students) {
      counts[
        trainingStatusOf(student.trainingAssignments.map((a) => a.status))
      ] += 1;
    }

    /* ---- unverified attendance, by establishment ---- */
    const studentById = new Map(students.map((s) => [s.id, s]));
    const byEstablishment = new Map<
      string,
      { id: string | null; name: string; pending: number; overdue: number }
    >();
    for (const row of pendingAttendance) {
      // The entry's own placement first; a legacy row with none falls back to
      // the student's current establishment (the same rule as §2).
      const establishment =
        row.trainingAssignment?.establishment ??
        studentById.get(row.studentId)?.establishment ??
        null;
      const key = establishment?.id ?? 'none';
      const bucket = byEstablishment.get(key) ?? {
        id: establishment?.id ?? null,
        name: establishment?.name ?? 'No establishment',
        pending: 0,
        overdue: 0,
      };
      bucket.pending += 1;
      if (isOverdue(row)) bucket.overdue += 1;
      byEstablishment.set(key, bucket);
    }

    /* ---- missing required documents ---- */
    const missingDocuments = students
      .map((student) => {
        const active = student.trainingAssignments.find(
          (a) => a.status === 'ACTIVE',
        );
        const own = documents.filter((d) => d.studentId === student.id);
        const missing = requirements.filter((requirement) => {
          // A per-placement document is only due while there is a placement.
          if (requirement.perAssignment && !active) return false;
          const submitted = own.find(
            (d) =>
              d.requirementId === requirement.id &&
              (!requirement.perAssignment ||
                d.trainingAssignmentId === active?.id),
          );
          // Missing = nothing on file, or returned and not yet replaced.
          return !submitted || submitted.status === 'REJECTED';
        });
        return {
          id: student.id,
          studentIdNumber: student.studentIdNumber,
          name: formatLastFirst(student) || student.user.name,
          missing: missing.map((r) => ({ code: r.code, name: r.name })),
        };
      })
      .filter((student) => student.missing.length > 0);

    return {
      generatedAt: new Date(),
      noBlocksAssigned,
      counts: {
        totalStudents: counts.total,
        activeTrainees: counts.ACTIVE,
        completedTrainees: counts.COMPLETED,
        endedOrCancelled: counts.ENDED,
        noPlacement: counts.NONE,
      },
      unverifiedAttendance: {
        pending: pendingAttendance.length,
        overdue: [...byEstablishment.values()].reduce(
          (sum, e) => sum + e.overdue,
          0,
        ),
        byEstablishment: [...byEstablishment.values()].sort(
          (a, b) => b.overdue - a.overdue || b.pending - a.pending,
        ),
      },
      missingDocuments,
    };
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  /**
   * The placement a report is about, after checking the caller may read it.
   *
   * - STUDENT: one of their own. With no id, the placement in progress, or
   *   the most recent one if none is.
   * - SUPERVISOR: one at their own establishment — the *assignment's*
   *   establishment, not the student's current one, so a trainee's months
   *   here stay printable after a transfer (CLAUDE.md §2).
   * - COORDINATOR: any (§2 — "My Block" is not an authorization boundary).
   */
  private async resolvePlacement(user: ReportUser, assignmentId?: string) {
    if (user.role === 'STUDENT') {
      const student = await this.prisma.client.student.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });
      if (!student) throw new NotFoundException('Student profile not found');

      const placement = assignmentId
        ? await this.prisma.client.trainingAssignment.findUnique({
            where: { id: assignmentId },
            select: PLACEMENT_SELECT,
          })
        : ((await this.prisma.client.trainingAssignment.findFirst({
            where: { studentId: student.id, status: 'ACTIVE' },
            select: PLACEMENT_SELECT,
          })) ??
          (await this.prisma.client.trainingAssignment.findFirst({
            where: { studentId: student.id },
            select: PLACEMENT_SELECT,
            orderBy: { startDate: 'desc' },
          })));
      if (!placement) {
        throw new NotFoundException(
          assignmentId
            ? 'Training assignment not found'
            : 'You have no training placement yet.',
        );
      }
      if (placement.studentId !== student.id) {
        throw new ForbiddenException('That placement is not yours');
      }
      return placement;
    }

    if (!assignmentId) {
      throw new BadRequestException('assignmentId is required');
    }
    const placement = await this.prisma.client.trainingAssignment.findUnique({
      where: { id: assignmentId },
      select: PLACEMENT_SELECT,
    });
    if (!placement) {
      throw new NotFoundException('Training assignment not found');
    }

    if (user.role === 'SUPERVISOR') {
      const supervisor = await this.prisma.client.supervisor.findUnique({
        where: { userId: user.userId },
        select: { establishmentId: true },
      });
      if (!supervisor) {
        throw new NotFoundException('Supervisor profile not found');
      }
      if (placement.establishmentId !== supervisor.establishmentId) {
        throw new ForbiddenException(
          'This trainee is placed at a different establishment',
        );
      }
    } else if (user.role !== 'COORDINATOR') {
      throw new ForbiddenException('You may not read this report');
    }
    return placement;
  }

  /** What every placement report prints at the top. */
  private header(
    placement: Awaited<ReturnType<ReportService['resolvePlacement']>>,
  ) {
    const { student } = placement;
    return {
      generatedAt: new Date(),
      placement: {
        id: placement.id,
        status: placement.status,
        academicYear: placement.academicYear,
        yearLevel: placement.yearLevel,
        requiredHours: placement.requiredHours,
        dutyDays: placement.dutyDays,
        dutyDaysLabel: formatDutyDays(placement.dutyDays),
        startDate: placement.startDate,
        endDate: placement.endDate,
        establishment: placement.establishment,
        // The placement's own block, else the student's — either may carry it.
        block: placement.block ?? student.block,
      },
      student: {
        id: student.id,
        studentIdNumber: student.studentIdNumber,
        name: student.user.name,
        nameLastFirst: formatLastFirst(student) || student.user.name,
        program: student.enrolledCourse?.name ?? student.course,
        programCode: student.enrolledCourse?.code ?? null,
      },
    };
  }

  /**
   * The company supervisor to print as "In-Charge": whoever approved most of
   * the entries shown; failing that the supervisor printing it; failing that
   * the establishment's supervisor when there is exactly one. `null` leaves
   * the line blank to be written in — a name is never guessed among several.
   */
  private async inChargeName(
    user: ReportUser,
    establishmentId: string,
    approverNames: readonly (string | null)[],
  ): Promise<string | null> {
    const tally = new Map<string, number>();
    for (const name of approverNames) {
      if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    const mostFrequent = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (mostFrequent) return mostFrequent[0];

    const supervisors = await this.prisma.client.supervisor.findMany({
      where: { establishmentId },
      select: { userId: true, user: { select: { name: true } } },
    });
    const self = supervisors.find((s) => s.userId === user.userId);
    if (self) return self.user.name;
    return supervisors.length === 1 ? supervisors[0].user.name : null;
  }
}
