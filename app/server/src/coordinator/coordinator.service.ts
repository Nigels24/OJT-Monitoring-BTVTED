import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, Weekday } from '../../generated/prisma/client';
import { totalHours } from '../common/attendance-hours';
import {
  MS_PER_DAY,
  manilaToday,
  startOfUtcDay,
  formatDateOnly,
} from '../common/dates';
import {
  computeProgress,
  progressFromRows,
  ZERO_ASSIGNMENT_PROGRESS,
} from '../common/assignment-progress';
import { GRADED_BY_SELECT, gradeEligibility } from '../common/assignment-grade';
import {
  EVALUATION_INCLUDE,
  withSectionTotals,
} from '../supervisor/supervisor.service';
import { MAX_SCORE } from '../common/evaluation-scoring';
import {
  evaluationPdfFilename,
  renderEvaluationPdf,
} from '../common/evaluation-pdf';
import {
  CASCADE_TRANSACTION_OPTIONS,
  deleteStudentCascade,
  deleteSupervisorCascade,
} from '../common/cascade-delete';
import { deleteFile } from '../common/storage';
import { withAge } from '../common/age';
import {
  StudentFilters,
  buildStudentWhere,
  trainingStatusOf,
} from '../common/student-filters';
import { resolveBlockScope } from '../common/coordinator-scope';
import {
  loadCompletionChecklist,
  syncAssignmentCompletion,
} from '../common/assignment-completion';
import { formatFullName } from '../common/person-name';
import { assertValidAddress } from '../common/ph-address';
import { generateTemporaryPassword } from '../common/temp-password';
import { NotificationService } from '../notification/notification.service';
import { OverdueSweepService } from '../notification/overdue-sweep.service';
import { PlacementThreadService } from '../messages/placement-thread.service';
import { CredentialsEmailService } from '../mail/credentials-email.service';
import { MailResult, isDeliverableEmail } from '../mail/mail.service';
import {
  daysPending,
  overdueAttendanceWhere,
  OVERDUE_DAYS,
} from '../common/attendance-overdue';

/** Fields the coordinator can set on a student, shared by create and update. */
/**
 * On the nullable fields, `null` and `undefined` mean different things:
 * `null` = the coordinator emptied the box, clear the column; `undefined` =
 * the field wasn't in the request at all, leave the column alone. The DTO's
 * `EmptyToNull`/`ToNullableNumber` transforms are what produce that split.
 * `requiredHours` and `status` are NOT NULL, so they stay undefined-only.
 */
export interface StudentDetails {
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  /** "Sex" on the form and in the Excel import: Male or Female. */
  gender?: string | null;
  dateOfBirth?: string | null;
  contactNumber?: string | null;
  region?: string | null;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
  streetAddress?: string | null;
  postalCode?: string | null;
  course?: string | null;
  yearLevel?: string | null;
  courseId?: string | null;
  blockId?: string | null;
  courseYearLevel?: number | null;
  establishmentId?: string | null;
  requiredHours?: number;
  startDate?: string | null;
  status?: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'INACTIVE';
}

/**
 * Where `resolveCourseFields` looks a course, requirement or block up.
 *
 * Adding one student asks the database (`databaseCourseLookup`). The Excel
 * import adds hundreds at once, so it loads those three small tables once and
 * answers from memory — the *checks and the derived values are the same code*
 * either way; only where the rows come from differs.
 */
export interface CourseLookup {
  course(id: string): Promise<{ name: string } | null>;
  hasRequirement(courseId: string, yearLevel: number): Promise<boolean>;
  block(id: string): Promise<{ courseId: string; yearLevel: number } | null>;
}

/** What the single-add form and an import row both supply for a new student. */
export type NewStudentInput = StudentDetails & {
  email: string;
  /** `null` for an imported student, who signs in with their email. */
  username: string | null;
  /** Coordinator-typed; omitted (always, on import) to have one generated. */
  password?: string;
  studentIdNumber: string;
};

/** A student validated and ready to insert — see `prepareStudentAccount`. */
export interface PreparedStudentAccount {
  email: string;
  username: string | null;
  fullName: string;
  studentIdNumber: string;
  hashedPassword: string;
  /** Plaintext, for the login email or the one-time fallback. Never stored. */
  temporaryPassword: string;
  /** True when the coordinator typed the password rather than it being generated. */
  passwordWasChosen: boolean;
  profile: StudentDetails;
}

export interface CreatedStudentAccount {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: string;
}

@Injectable()
export class CoordinatorService {
  private readonly logger = new Logger(CoordinatorService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    private overdueSweep: OverdueSweepService,
    private placementThreads: PlacementThreadService,
    private credentialsEmail: CredentialsEmailService,
  ) {}

  /**
   * Emails a just-issued login and shapes what the coordinator gets back
   * (CLAUDE.md §16). Shared by both create flows and "Resend login" so the
   * rule about the password is written once:
   *
   * - **SENT** — the password went to the account's own inbox, so it is NOT
   *   returned to the client at all.
   * - **FAILED / NOT_CONFIGURED** — the email did not go out, so the password
   *   is returned once for the coordinator to hand over, exactly as it worked
   *   before there was any email.
   *
   * A problem while sending or recording must never undo the account or the
   * reset that has already been committed, so anything unexpected here is
   * logged (without the password) and reported as FAILED.
   */
  private async issueCredentials(
    user: {
      id: string;
      email: string;
      name: string;
      username: string | null;
      role: string;
    },
    temporaryPassword: string,
    kind: 'CREATED' | 'RESET',
  ): Promise<{
    credentialsEmail: MailResult;
    temporaryPassword: string | undefined;
  }> {
    let credentialsEmail: MailResult;
    try {
      credentialsEmail = await this.credentialsEmail.deliver({
        userId: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'STUDENT',
        temporaryPassword,
        kind,
      });
    } catch (err) {
      this.logger.error(
        `Login email for user ${user.id} could not be sent or recorded: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      credentialsEmail = {
        status: 'FAILED',
        error: 'The login email could not be sent.',
      };
    }

    return {
      credentialsEmail,
      temporaryPassword:
        credentialsEmail.status === 'SENT' ? undefined : temporaryPassword,
    };
  }

  /** Rejects an email or username already claimed by another account. */
  private async assertCredentialsAvailable(email: string, username: string) {
    const clash = await this.prisma.client.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (!clash) return;
    throw new ConflictException(
      clash.email === email ? 'Email already in use' : 'Username already taken',
    );
  }

  /**
   * Validates courseId/blockId/courseYearLevel (existence, that a given
   * courseYearLevel has a matching `CourseRequirement`, and that a given
   * block belongs to the selected course and year level) and derives a fresh
   * value for the deprecated `course`/`yearLevel` free-text columns from
   * them, so screens that still read those two columns keep showing
   * something accurate instead of going stale the moment a student is put on
   * a structured course. A no-op — `data` passed through untouched — when
   * none of courseId/blockId/courseYearLevel are in the request, which is the
   * entire existing free-text create/update path.
   *
   * `existingCourseId`/`existingCourseYearLevel` are the student's current
   * values (null for a brand new student); they are the fallback used to
   * validate a `blockId` sent without an accompanying `courseId`/
   * `courseYearLevel` on an update.
   */
  private async resolveCourseFields(
    data: StudentDetails,
    existingCourseId: string | null,
    existingCourseYearLevel: number | null,
    lookup: CourseLookup = this.databaseCourseLookup,
  ): Promise<StudentDetails> {
    if (
      data.courseId === undefined &&
      data.blockId === undefined &&
      data.courseYearLevel === undefined
    ) {
      return data;
    }

    const resolved: StudentDetails = { ...data };
    const effectiveCourseId =
      data.courseId !== undefined ? data.courseId : existingCourseId;
    const effectiveCourseYearLevel =
      data.courseYearLevel !== undefined
        ? data.courseYearLevel
        : existingCourseYearLevel;

    if (effectiveCourseId) {
      const course = await lookup.course(effectiveCourseId);
      if (!course) {
        throw new BadRequestException('courseId does not match a course');
      }
      resolved.course = course.name;
    } else if (data.courseId === null) {
      resolved.course = null;
    }

    // Only validated when this request is actually setting a year level —
    // not when one merely carries over from the existing row — so clearing
    // an unrelated field on a student who already has a courseYearLevel set
    // doesn't re-trigger this check.
    if (data.courseYearLevel) {
      if (!effectiveCourseId) {
        throw new BadRequestException(
          'Select a course before setting a year level',
        );
      }
      if (
        !(await lookup.hasRequirement(effectiveCourseId, data.courseYearLevel))
      ) {
        throw new BadRequestException(
          `This course has no OJT requirement defined for year ${data.courseYearLevel}.`,
        );
      }
    }

    if (data.blockId) {
      const block = await lookup.block(data.blockId);
      if (!block) {
        throw new BadRequestException('blockId does not match a block');
      }
      if (block.courseId !== effectiveCourseId) {
        throw new BadRequestException(
          'Block does not belong to the selected course',
        );
      }
      if (
        effectiveCourseYearLevel !== null &&
        effectiveCourseYearLevel !== undefined
      ) {
        if (block.yearLevel !== effectiveCourseYearLevel) {
          throw new BadRequestException(
            'Block does not match the selected year level',
          );
        }
      } else {
        // No year level was given or already on file — a block still
        // implies one, so adopt it rather than leaving courseYearLevel null
        // even though the student is on a block.
        resolved.courseYearLevel = block.yearLevel;
      }
    }

    if (resolved.courseYearLevel !== undefined) {
      resolved.yearLevel =
        resolved.courseYearLevel === null
          ? null
          : ordinalYearLabel(resolved.courseYearLevel);
    }

    return resolved;
  }

  /** The default `CourseLookup`: one query per question, for a single student. */
  private readonly databaseCourseLookup: CourseLookup = {
    course: (id) =>
      this.prisma.client.course.findUnique({
        where: { id },
        select: { name: true },
      }),
    hasRequirement: async (courseId, yearLevel) =>
      (await this.prisma.client.courseRequirement.findUnique({
        where: { courseId_yearLevel: { courseId, yearLevel } },
        select: { id: true },
      })) !== null,
    block: (id) =>
      this.prisma.client.block.findUnique({
        where: { id },
        select: { courseId: true, yearLevel: true },
      }),
  };

  /**
   * Everything about a new student that is decided before the insert: the
   * display name, the course/year/block resolution, and the temporary
   * password and its hash.
   *
   * **The single definition of "a new student account"** — `createStudent`
   * calls it for one student and the Excel import (`StudentImportService`)
   * for each row, so an imported student is a single-added student, not a
   * second implementation of one. `mustChangePassword` is not set here or
   * anywhere: it is the schema default (true) for both.
   *
   * It does not check that the email, username or student number is free —
   * the two callers do that differently (one lookup versus one bulk query).
   */
  async prepareStudentAccount(
    data: NewStudentInput,
    lookup: CourseLookup = this.databaseCourseLookup,
  ): Promise<PreparedStudentAccount> {
    const fullName = buildFullName(data);
    if (!fullName) {
      throw new BadRequestException(
        'Provide either firstName and lastName, or name',
      );
    }

    // The address names must be real and consistent with each other — the
    // pickers only offer valid combinations, but the request is not the form.
    assertValidAddress(data);

    const profile = await this.resolveCourseFields(data, null, null, lookup);

    // See createSupervisor's comment: omitted password -> generated one;
    // mustChangePassword stays the schema default (true) either way.
    const temporaryPassword = data.password ?? generateTemporaryPassword();

    return {
      email: data.email,
      username: data.username,
      fullName,
      studentIdNumber: data.studentIdNumber,
      hashedPassword: await bcrypt.hash(temporaryPassword, 10),
      temporaryPassword,
      passwordWasChosen: !!data.password,
      profile,
    };
  }

  /**
   * Inserts prepared students: their `User` rows, then their `Student` rows.
   * Must be given a transaction client — the two are separate rows, and a
   * failure between them would leave a login with no profile, which every
   * `/student/*` endpoint rejects.
   *
   * Two statements however many students there are (`createManyAndReturn`,
   * then `createMany`), which is what lets an import of hundreds fit in one
   * transaction. `createStudent` passes an array of one through the same two
   * statements, so the rows are written identically either way.
   *
   * Returns the created accounts keyed by email — the database does not
   * promise to return rows in the order they were sent.
   */
  async createStudentAccounts(
    tx: Prisma.TransactionClient,
    accounts: readonly PreparedStudentAccount[],
  ): Promise<Map<string, CreatedStudentAccount>> {
    if (accounts.length === 0) return new Map();

    const users = await tx.user.createManyAndReturn({
      data: accounts.map((account) => ({
        email: account.email,
        username: account.username,
        password: account.hashedPassword,
        name: account.fullName,
        role: 'STUDENT' as const,
      })),
      select: { id: true, email: true, username: true, name: true, role: true },
    });
    const userByEmail = new Map(users.map((user) => [user.email, user]));

    await tx.student.createMany({
      data: accounts.map((account) => ({
        userId: userByEmail.get(account.email)!.id,
        studentIdNumber: account.studentIdNumber,
        ...studentProfileData(account.profile),
      })),
    });

    return userByEmail;
  }

  /**
   * Emails many just-created students their logins, in the background, and
   * records each outcome as it happens — the import's counterpart to
   * `issueCredentials`. Returns immediately; nothing here is awaited by the
   * request, and nothing it does can fail the import that already committed.
   */
  queueStudentCredentials(
    accounts: ReadonlyArray<{
      user: CreatedStudentAccount;
      temporaryPassword: string;
    }>,
  ): void {
    void this.credentialsEmail
      .deliverBatch(
        accounts.map(({ user, temporaryPassword }) => ({
          userId: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          role: 'STUDENT' as const,
          temporaryPassword,
          kind: 'CREATED' as const,
        })),
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Queued login emails for ${accounts.length} imported student(s) did not all complete: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      });
  }

  async createSupervisor(data: {
    email: string;
    username: string;
    password?: string;
    name: string;
    establishmentId: string;
    position?: string;
  }) {
    await this.assertCredentialsAvailable(data.email, data.username);

    // A coordinator-chosen password is honoured; an omitted one gets a
    // readable generated one. Either way it is the account's temporary
    // password: `mustChangePassword` is the schema default (true), so the
    // first login always forces a real change, and either way it is what the
    // login email below carries.
    const temporaryPassword = data.password ?? generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const user = await this.prisma.client.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: hashedPassword,
        name: data.name,
        role: 'SUPERVISOR',
        supervisorProfile: {
          create: {
            establishmentId: data.establishmentId,
            position: data.position,
          },
        },
      },
      include: { supervisorProfile: true },
    });

    // A new supervisor joins the group thread of every active placement at
    // their establishment (CLAUDE.md §15). After the create rather than with
    // it: the account is valid without this, and the boot-time sync repairs a
    // miss, so a failure here must not fail the account creation.
    try {
      await this.placementThreads.addSupervisor(this.prisma.client, {
        userId: user.id,
        establishmentId: data.establishmentId,
      });
    } catch (err) {
      this.logger.error(
        `Supervisor ${user.id} was created but not added to their placement threads: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    // After the account is saved, never as part of saving it: an email that
    // fails must not fail or roll back the account.
    const issued = await this.issueCredentials(
      user,
      temporaryPassword,
      'CREATED',
    );

    const { password, ...result } = user;
    return {
      ...result,
      ...issued,
      // A password the coordinator typed is one they already have; only a
      // generated one ever needs showing.
      temporaryPassword: data.password ? undefined : issued.temporaryPassword,
    };
  }

  async createStudent(
    data: StudentDetails & {
      email: string;
      username: string;
      password?: string;
      studentIdNumber: string;
    },
  ) {
    await this.assertCredentialsAvailable(data.email, data.username);

    const idTaken = await this.prisma.client.student.findUnique({
      where: { studentIdNumber: data.studentIdNumber },
    });
    if (idTaken) {
      throw new ConflictException(
        `Student ID ${data.studentIdNumber} is already assigned to another student`,
      );
    }

    const account = await this.prepareStudentAccount(data);

    // User and Student are separate rows. Without a transaction a failure on
    // the second write would leave a login with no profile, which every
    // /student/* endpoint then rejects with "Student profile not found".
    const user = await this.prisma.client.$transaction(async (tx) => {
      const created = await this.createStudentAccounts(tx, [account]);
      return tx.user.findUniqueOrThrow({
        where: { id: created.get(account.email)!.id },
        include: { studentProfile: true },
      });
    });

    // After the transaction has committed — see createSupervisor.
    const issued = await this.issueCredentials(
      user,
      account.temporaryPassword,
      'CREATED',
    );

    const { password, ...result } = user;
    return {
      ...result,
      ...issued,
      temporaryPassword: account.passwordWasChosen
        ? undefined
        : issued.temporaryPassword,
    };
  }

  /**
   * The coordinator's student roster.
   *
   * `scope: 'block'` (the default) narrows this to the requesting
   * coordinator's own blocks (Table 1: "a coordinator sees their own block's
   * trainees by default and can switch to a program-wide view"). This is a
   * view default, not an authorization boundary — every coordinator account
   * can already reach every student through this same endpoint with
   * `scope=all`, exactly like `getDashboard`/`getAttendanceOversight` are
   * deliberately unscoped. A coordinator with no blocks assigned yet has
   * nothing to narrow by, so this falls back to the full roster and says so
   * via `noBlocksAssigned`, rather than silently returning an empty list that
   * reads as "no students exist".
   */
  async listStudents(
    userId: string,
    filters: StudentFilters & { scope?: 'block' | 'all' } = {},
  ) {
    const { blockScopeIds, noBlocksAssigned } = await resolveBlockScope(
      this.prisma.client,
      userId,
      filters.scope,
    );
    // The one query builder the summary report filters through as well, so
    // its counts match this list (common/student-filters.ts).
    const where = buildStudentWhere(filters, blockScopeIds);

    const students = await this.prisma.client.student.findMany({
      where,
      include: {
        user: { select: ACCOUNT_SELECT },
        establishment: { select: { id: true, name: true } },
        // At most one ACTIVE row per student — nothing enforces that in the
        // schema, but `createPlacement` always transfers the prior one out
        // before creating the next, so there is only ever one to `take`.
        // Every placement's status (for the training-status label) with the
        // fields progress needs. At most one is ACTIVE — nothing enforces
        // that in the schema, but `createPlacement` always transfers the
        // prior one out before creating the next.
        trainingAssignments: {
          select: {
            id: true,
            status: true,
            requiredHours: true,
            dutyDays: true,
            startDate: true,
            endDate: true,
          },
        },
        _count: {
          select: {
            credentials: true,
            documents: true,
            attendances: true,
            evaluations: true,
          },
        },
      },
      orderBy: { user: { createdAt: 'desc' } },
    });

    const activeOf = (student: (typeof students)[number]) =>
      student.trainingAssignments.find((a) => a.status === 'ACTIVE') ?? null;
    const progressByStudent = await this.batchAssignmentProgress(
      students.map(activeOf),
    );

    // `trainingAssignments` is only fetched to derive progress; drop it from
    // the response so the list payload stays small.
    return {
      noBlocksAssigned,
      students: students.map(({ trainingAssignments, ...student }, index) => {
        const progress = progressByStudent[index];
        return {
          ...withAge(student),
          hasActiveAssignment: trainingAssignments.some(
            (a) => a.status === 'ACTIVE',
          ),
          // Active / Completed / Ended / No placement — the same
          // classification the trainingStatus filter uses.
          trainingStatus: trainingStatusOf(
            trainingAssignments.map((a) => a.status),
          ),
          // Kept at top level, not just inside `progress`, so the existing
          // client types (studentApi.ts) that already read these two fields
          // keep compiling unchanged — their values now come from the ACTIVE
          // assignment instead of all-time attendance.
          completedHours: progress.approvedHours,
          requiredHours: progress.requiredHours,
          progress,
        };
      }),
    };
  }

  /** The requesting coordinator's own blocks — populates "My Block" filters. */
  async getMyBlocks(userId: string) {
    const coordinator = await this.getCoordinatorByUserId(userId);
    return this.prisma.client.block.findMany({
      where: { coordinatorId: coordinator.id },
      include: {
        course: { select: { id: true, code: true, name: true } },
        coordinator: { select: { id: true, user: { select: { name: true } } } },
        _count: { select: { students: true, trainingAssignments: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Every coordinator account, for the block form's "assigned coordinator"
   * picker (Table 1: two blocks per year level, each with its own
   * coordinator). Not asked for explicitly in the Step 3 handoff's backend
   * list, but there is no other way to populate that select — `Block
   * .coordinatorId` already accepts any coordinator's id
   * (`CourseService.updateBlock`), there was just nothing listing the
   * choices.
   */
  async listCoordinators() {
    return this.prisma.client.coordinator.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  /**
   * Progress for many students' ACTIVE assignments in two flat queries
   * (never one per student) — the batch-then-group-in-memory shape
   * `getAttendanceOversight` already uses, applied to `progressFromRows`
   * (common/assignment-progress.ts) so the math itself lives in one place.
   *
   * `assignments[i]` is student i's ACTIVE assignment, or `null` if they have
   * none; the returned array is the same length and order, `null` slots
   * becoming `ZERO_ASSIGNMENT_PROGRESS` rather than crashing.
   */
  private async batchAssignmentProgress(
    assignments: ({
      id: string;
      requiredHours: number;
      dutyDays: string[];
      startDate: Date;
      endDate: Date | null;
    } | null)[],
  ) {
    const activeIds = assignments
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .map((a) => a.id);

    const rows = activeIds.length
      ? await this.prisma.client.attendance.findMany({
          where: {
            trainingAssignmentId: { in: activeIds },
            status: { in: ['APPROVED', 'PENDING'] },
          },
          select: {
            trainingAssignmentId: true,
            status: true,
            timeInAM: true,
            timeOutAM: true,
            timeInPM: true,
            timeOutPM: true,
          },
        })
      : [];

    const rowsByAssignment = new Map<string, typeof rows>();
    for (const row of rows) {
      const id = row.trainingAssignmentId as string;
      const list = rowsByAssignment.get(id) ?? [];
      list.push(row);
      rowsByAssignment.set(id, list);
    }

    return assignments.map((assignment) =>
      assignment
        ? progressFromRows(
            assignment,
            rowsByAssignment.get(assignment.id) ?? [],
          )
        : ZERO_ASSIGNMENT_PROGRESS,
    );
  }

  async listSupervisors() {
    return this.prisma.client.supervisor.findMany({
      include: {
        user: { select: ACCOUNT_SELECT },
        establishment: { select: { id: true, name: true } },
        // What deleting this supervisor would take with it (evaluations) and
        // what it would merely un-attribute (attendance approvals). The
        // confirmation dialog states both.
        _count: { select: { evaluations: true, attendanceApprovals: true } },
      },
      orderBy: { user: { createdAt: 'desc' } },
    });
  }

  /**
   * Aggregates for the coordinator's dashboard.
   *
   * Every figure here is derived from real rows. The page previously rendered
   * module-level mock constants; anything that still has no data source (the
   * unbuilt messaging and documents modules) is absent from this response
   * rather than reported as zero, so the UI can't imply a feature works.
   */
  async getDashboard() {
    // Goal 4(ii): re-run the overdue sweep at the start of every dashboard
    // load, not only on the six-hourly timer — see OverdueSweepService's own
    // comment for why (a serverless/free-tier host can sleep between
    // requests and never fire the interval at all). Errors are swallowed
    // inside runSweep() itself, so this can never turn a sweep failure into a
    // failed dashboard load.
    await this.overdueSweep.runSweep();

    const weeksBack = 6;
    const trendStart = startOfWeek(weeksBack - 1);
    // Manila's calendar day, not the server's UTC day — they differ between
    // 00:00 and 07:59 Manila, and `Attendance.date` is written against Manila.
    const todayStart = manilaToday();
    const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);

    // allSettled, not all: this is the first page after a coordinator logs in,
    // and one rejected query used to throw a raw 500 that blanked the whole
    // screen. Each section now degrades to an empty default, the reason is
    // logged, and `failedSections` tells the client what to offer a retry for.
    const settled = await Promise.allSettled([
      this.prisma.client.student.findMany({ select: { status: true } }),
      this.prisma.client.establishment.count(),
      this.prisma.client.establishment.count({ where: { status: 'ACTIVE' } }),
      this.prisma.client.attendance.findMany({
        where: { status: 'APPROVED' },
        select: {
          timeInAM: true,
          timeOutAM: true,
          timeInPM: true,
          timeOutPM: true,
        },
      }),
      this.prisma.client.attendance.count({ where: { status: 'PENDING' } }),
      // Distinct students who logged anything for today, not raw record count —
      // the unique constraint makes these equal today, but the intent is
      // "how many students turned up".
      this.prisma.client.attendance.findMany({
        where: { date: { gte: todayStart, lt: todayEnd } },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      this.prisma.client.evaluation.aggregate({
        _avg: { totalRating: true },
      }),
      this.prisma.client.evaluation.count(),
      this.prisma.client.establishment.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { students: true } },
        },
        orderBy: { students: { _count: 'desc' } },
        take: 5,
      }),
      this.prisma.client.student.findMany({
        include: {
          user: { select: { name: true, createdAt: true } },
          establishment: { select: { name: true } },
          trainingAssignments: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: {
              id: true,
              requiredHours: true,
              dutyDays: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { user: { createdAt: 'desc' } },
        take: 5,
      }),
      this.prisma.client.attendance.findMany({
        where: { date: { gte: trendStart } },
        select: { date: true, status: true },
      }),
      // The denominator the average is meaningful against: the currently
      // published sheet's item count. Not a constant any more — the sheet is a
      // versioned template the coordinator owns.
      this.prisma.client.evaluationTemplateItem.count({
        where: { section: { template: { status: 'PUBLISHED' } } },
      }),
    ] as const);

    const failedSections = new Set<string>();
    const fail = (section: string, reason: unknown) => {
      failedSections.add(section);
      this.logger.error(
        `Coordinator dashboard section "${section}" failed: ` +
          (reason instanceof Error ? reason.message : String(reason)),
      );
    };

    const [
      students,
      establishmentCount,
      activeEstablishments,
      approvedAttendance,
      pendingCount,
      presentToday,
      evaluationAgg,
      evaluationCount,
      topEstablishments,
      recentStudents,
      trendRows,
      publishedItemCount,
    ] = [
      settledOr(settled[0], [], 'stats', fail),
      settledOr(settled[1], 0, 'stats', fail),
      settledOr(settled[2], 0, 'stats', fail),
      settledOr(settled[3], [], 'stats', fail),
      settledOr(settled[4], 0, 'stats', fail),
      settledOr(settled[5], [], 'stats', fail),
      settledOr(settled[6], { _avg: { totalRating: null } }, 'stats', fail),
      settledOr(settled[7], 0, 'stats', fail),
      settledOr(settled[8], [], 'topEstablishments', fail),
      settledOr(settled[9], [], 'recentStudents', fail),
      settledOr(settled[10], [], 'attendanceTrend', fail),
      settledOr(settled[11], 0, 'stats', fail),
    ] as const;

    // A second, un-settled fetch chained off `recentStudents` — batched the
    // same way `listStudents`/`batchAssignmentProgress` is, never one query
    // per row. Wrapped by hand rather than folded into the `settled` array
    // above because it depends on `recentStudents`' own result (which active
    // assignment ids to fetch attendance for); on failure it degrades exactly
    // like every other section here: zeroed progress, logged, and
    // "recentStudents" still ends up in `failedSections`.
    let recentStudentsProgress: Awaited<
      ReturnType<typeof this.batchAssignmentProgress>
    >;
    try {
      recentStudentsProgress = await this.batchAssignmentProgress(
        recentStudents.map((s) => s.trainingAssignments[0] ?? null),
      );
    } catch (err) {
      fail('recentStudents', err);
      recentStudentsProgress = recentStudents.map(
        () => ZERO_ASSIGNMENT_PROGRESS,
      );
    }

    // Every single query failing is not a degraded page, it is an outage —
    // report it rather than rendering a dashboard of confident zeroes.
    if (settled.every((result) => result.status === 'rejected')) {
      throw new ServiceUnavailableException(
        'The dashboard is temporarily unavailable. Please try again.',
      );
    }

    // The official sheet's TOTAL RATING, averaged across evaluations — a raw
    // score, not a percentage. `averageLevel` is gone with the old rubric's
    // performance bands; the form has no such label.
    //
    // The denominator is the *currently published* sheet's maximum. Evaluations
    // written on earlier versions were scored out of their own maximum, which
    // may differ, so this average is only strictly meaningful against the
    // published number while every sheet shares a version. null when nothing is
    // published, the same null-not-zero rule the average itself follows.
    const averageRating = evaluationAgg._avg?.totalRating ?? null;
    const maxTotalRating =
      publishedItemCount > 0 ? publishedItemCount * MAX_SCORE : null;

    return {
      /** Sections whose data could not be loaded; the client offers a retry. */
      failedSections: [...failedSections],
      stats: {
        totalStudents: students.length,
        activeStudents: students.filter((s) => s.status === 'ACTIVE').length,
        completedStudents: students.filter((s) => s.status === 'COMPLETED')
          .length,
        partnerEstablishments: establishmentCount,
        activeEstablishments,
        presentToday: presentToday.length,
        pendingApprovals: pendingCount,
        totalHoursLogged: totalHours(approvedAttendance),
        // null rather than 0 when nothing has been evaluated — a real average
        // of zero and "no data yet" are different things.
        averageRating:
          averageRating == null ? null : Math.round(averageRating * 10) / 10,
        maxTotalRating,
        totalEvaluations: evaluationCount,
      },
      // The prototype charted present/late/absent. Those states do not exist —
      // attendance is PENDING/APPROVED/DECLINED — so the real statuses are
      // charted instead of inventing the other three.
      attendanceTrend: buildWeeklyTrend(trendRows, weeksBack),
      topEstablishments: topEstablishments.map((e) => ({
        id: e.id,
        name: e.name,
        studentCount: e._count.students,
      })),
      recentStudents: recentStudents.map(
        ({ trainingAssignments, user, establishment, ...student }, index) => {
          const progress = recentStudentsProgress[index];
          return {
            id: student.id,
            studentIdNumber: student.studentIdNumber,
            name: user.name,
            course: student.course,
            establishment: establishment?.name ?? null,
            startDate: student.startDate,
            hasActiveAssignment: trainingAssignments.length > 0,
            requiredHours: progress.requiredHours,
            completedHours: progress.approvedHours,
            status: student.status,
          };
        },
      ),
    };
  }

  /**
   * Attendance percentage per student, across every establishment.
   *
   * Read-only oversight, deliberately unscoped like getDashboard() and
   * listEvaluations() — the coordinator's remit is the whole programme.
   *
   * "Attendance percentage" exists nowhere else in this codebase (every other
   * view reports completedHours/requiredHours), so it is defined here:
   * APPROVED days logged, over calendar days elapsed since the student started.
   * Calendar days, not school days — the schema has no school-calendar concept,
   * so students with different start dates or weekend-heavy periods are only
   * roughly comparable.
   */
  async getAttendanceOversight() {
    // Manila's calendar day — see getDashboard.
    const todayStart = manilaToday();
    const todayEnd = new Date(todayStart.getTime() + MS_PER_DAY);

    // Both bounds matter. The upper one (`lt: todayEnd`, i.e. date <= today)
    // now agrees with `submitAttendance`, which rejects a future date against
    // Manila's calendar day; it stays as a second line of defence for rows
    // written before that check existed. The lower one is each student's own
    // startDate, applied per student below: a day approved *before* a student
    // started is outside the window totalDays measures, and counting it would
    // push the percentage past 100%.
    //
    // A filtered relation `_count` can't express that correlated per-row bound,
    // so the rows are fetched flat and bucketed here — still one round trip per
    // table, no N+1, the same app-level aggregation shape as common/
    // attendance-hours.ts.
    const [students, approvedRows, pendingRows] = await Promise.all([
      this.prisma.client.student.findMany({
        include: {
          user: { select: { name: true } },
          establishment: { select: { name: true } },
        },
        orderBy: { user: { createdAt: 'desc' } },
      }),
      this.prisma.client.attendance.findMany({
        where: { status: 'APPROVED', date: { lt: todayEnd } },
        select: { studentId: true, date: true },
      }),
      // Goal 4: every PENDING row's submission time, to derive the
      // student's own worst-case overdue/daysPending below — a student can
      // have several PENDING entries, so this is a per-student max, not a
      // per-row value like the supervisor queue exposes.
      this.prisma.client.attendance.findMany({
        where: { status: 'PENDING' },
        select: { studentId: true, submittedAt: true },
      }),
    ]);

    const approvedByStudent = new Map<string, Date[]>();
    for (const row of approvedRows) {
      const dates = approvedByStudent.get(row.studentId) ?? [];
      dates.push(row.date);
      approvedByStudent.set(row.studentId, dates);
    }

    // The single oldest PENDING submission per student — the one that would
    // trip `isOverdue` first, and whose age is the worst-case daysPending.
    const oldestPendingByStudent = new Map<string, Date>();
    for (const row of pendingRows) {
      const current = oldestPendingByStudent.get(row.studentId);
      if (!current || row.submittedAt < current) {
        oldestPendingByStudent.set(row.studentId, row.submittedAt);
      }
    }

    return students.map((student) => {
      const startDay = student.startDate
        ? startOfUtcDay(student.startDate)
        : null;

      // With no startDate there is no lower bound to apply — the count stays
      // honest about what was logged, while totalDays below is 0 and so the
      // percentage is null either way.
      const presentDays = (approvedByStudent.get(student.id) ?? []).filter(
        (date) => !startDay || date >= startDay,
      ).length;

      const totalDays = startDay
        ? Math.max(
            0,
            Math.floor(
              (todayStart.getTime() - startDay.getTime()) / MS_PER_DAY,
            ) + 1,
          )
        : 0;

      const oldestPending = oldestPendingByStudent.get(student.id) ?? null;
      const pendingDays = oldestPending
        ? daysPending({ submittedAt: oldestPending })
        : null;

      return {
        id: student.id,
        studentIdNumber: student.studentIdNumber,
        name: student.user.name,
        establishmentName: student.establishment?.name ?? null,
        presentDays,
        totalDays,
        // null, not 0, when there is no window to measure against — no
        // startDate, or a startDate still in the future. Same distinction the
        // dashboard's averageRating makes between "no data" and a real zero.
        attendancePercentage:
          totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null,
        // Worst case across this student's own PENDING entries — a student
        // row, not an attendance row, so "the" days pending is the oldest
        // one still waiting.
        overdue: pendingDays !== null && pendingDays >= OVERDUE_DAYS,
        daysPending: pendingDays,
      };
    });
  }

  /**
   * The dashboard's "Overdue verifications" table (goal 4): individual
   * PENDING attendance rows past the 21-day window, scoped by the same My
   * Block / All Program toggle `listStudents` uses (default block, fall back
   * to all when the coordinator has none assigned). A separate endpoint from
   * `getDashboard` rather than folded into it — that query is already a
   * 12-way `Promise.allSettled` fan-out with no scope concept at all, and
   * flipping this widget's own toggle should refetch only this, not the
   * whole dashboard.
   */
  async getOverdueVerifications(
    userId: string,
    scope: 'block' | 'all' = 'block',
  ) {
    const coordinator = await this.getCoordinatorByUserId(userId);

    let blockScopeIds: string[] | null = null;
    let noBlocksAssigned = false;
    if (scope !== 'all') {
      const ownBlocks = await this.prisma.client.block.findMany({
        where: { coordinatorId: coordinator.id },
        select: { id: true },
      });
      if (ownBlocks.length > 0) {
        blockScopeIds = ownBlocks.map((b) => b.id);
      } else {
        noBlocksAssigned = true;
      }
    }

    const rows = await this.prisma.client.attendance.findMany({
      where: {
        ...overdueAttendanceWhere(),
        ...(blockScopeIds
          ? {
              OR: [
                {
                  trainingAssignmentId: null,
                  student: { blockId: { in: blockScopeIds } },
                },
                { trainingAssignment: { blockId: { in: blockScopeIds } } },
              ],
            }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            user: { select: { name: true } },
            establishment: { select: { id: true, name: true } },
          },
        },
        trainingAssignment: {
          select: { establishment: { select: { id: true, name: true } } },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Supervisor names, batched rather than one query per row — the same
    // shape `batchAssignmentProgress` uses.
    const establishmentIds = [
      ...new Set(
        rows
          .map(
            (r) =>
              r.trainingAssignment?.establishment.id ??
              r.student.establishment?.id,
          )
          .filter((id): id is string => !!id),
      ),
    ];
    const supervisors = await this.prisma.client.supervisor.findMany({
      where: { establishmentId: { in: establishmentIds } },
      select: { establishmentId: true, user: { select: { name: true } } },
    });
    const supervisorNamesByEstablishment = new Map<string, string[]>();
    for (const s of supervisors) {
      const names = supervisorNamesByEstablishment.get(s.establishmentId) ?? [];
      names.push(s.user.name);
      supervisorNamesByEstablishment.set(s.establishmentId, names);
    }

    return {
      noBlocksAssigned,
      rows: rows.map((row) => {
        const establishment =
          row.trainingAssignment?.establishment ?? row.student.establishment;
        return {
          id: row.id,
          studentName: row.student.user.name,
          establishmentName: establishment?.name ?? null,
          supervisorNames: establishment
            ? (supervisorNamesByEstablishment.get(establishment.id) ?? [])
            : [],
          date: row.date,
          daysPending: daysPending(row),
          link: '/coordinator/attendance',
        };
      }),
    };
  }

  /**
   * Every evaluation across every establishment — read-only oversight.
   *
   * Unlike the supervisor's list this is deliberately not scoped: the
   * coordinator's remit is the whole OJT programme.
   */
  async listEvaluations() {
    const evaluations = await this.prisma.client.evaluation.findMany({
      include: EVALUATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    // Coordinators never edit or delete an evaluation — it belongs to the
    // supervisor who wrote it — so the row says so explicitly rather than
    // leaving the client to assume.
    return evaluations.map((evaluation) => ({
      ...withSectionTotals(evaluation),
      canModify: false,
    }));
  }

  /**
   * One evaluation as a printable PDF, for the coordinator to forward.
   *
   * The service fetches and the renderer draws — `common/evaluation-pdf.ts`
   * never touches the database. `EVALUATION_INCLUDE` joins the template the
   * sheet was *signed* on, so the file prints that version's items, wording and
   * maximum whatever has been published since.
   */
  async getEvaluationPdf(evaluationId: string) {
    const evaluation = await this.prisma.client.evaluation.findUnique({
      where: { id: evaluationId },
      include: EVALUATION_INCLUDE,
    });
    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    const sheet = withSectionTotals(evaluation);
    return {
      filename: evaluationPdfFilename(sheet),
      body: await renderEvaluationPdf(sheet),
    };
  }

  async updateStudent(studentId: string, data: StudentDetails) {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Checked as the address will stand after this update: a request may
    // carry only some of the parts, and they have to agree with the rest.
    if (ADDRESS_KEYS.some((key) => data[key] !== undefined)) {
      assertValidAddress(mergeAddress(student, data));
    }

    // Name lives on User, everything else on Student. Recomposed from the
    // parts as they will stand, so changing only the middle name still
    // updates the display name.
    if (NAME_KEYS.some((key) => data[key] !== undefined)) {
      const fullName = buildFullName(
        {
          firstName: data.firstName ?? student.firstName,
          lastName: data.lastName ?? student.lastName,
          middleName:
            data.middleName === undefined
              ? student.middleName
              : data.middleName,
        },
        null,
      );
      if (fullName) {
        await this.prisma.client.user.update({
          where: { id: student.userId },
          data: { name: fullName },
        });
      }
    }

    const resolved = await this.resolveCourseFields(
      data,
      student.courseId,
      student.courseYearLevel,
    );

    const updated = await this.prisma.client.student.update({
      where: { id: studentId },
      data: studentProfileData(resolved),
      include: {
        user: { select: { id: true, email: true, name: true } },
        establishment: { select: { id: true, name: true } },
      },
    });
    return withAge(updated);
  }

  /**
   * Issues a new password for a student or supervisor.
   *
   * This is the recovery path: there is no email infrastructure, so a user who
   * forgets their password asks the coordinator, who sets a new one and passes
   * it on — the same way the account was issued in the first place.
   *
   * Deliberately does NOT require the old password: the whole point is that it
   * is unknown. That means a coordinator can set any student's or supervisor's
   * password and sign in as them; that authority is inherent to a system where
   * the coordinator issues every credential, and it stops at COORDINATOR
   * accounts, which only the CLI can reset.
   *
   * Sets `mustChangePassword` so the coordinator-chosen value here is treated
   * the same as a coordinator-chosen value at account creation: a temporary
   * credential the owner is forced to replace on their next sign-in.
   */
  async resetStudentPassword(studentId: string, password: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { id: true, name: true, username: true } } },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    await this.prisma.client.user.update({
      where: { id: student.userId },
      data: {
        password: await bcrypt.hash(password, 10),
        mustChangePassword: true,
      },
    });

    return {
      id: student.id,
      name: student.user.name,
      username: student.user.username,
      passwordReset: true,
    };
  }

  async resetSupervisorPassword(supervisorId: string, password: string) {
    const supervisor = await this.prisma.client.supervisor.findUnique({
      where: { id: supervisorId },
      include: { user: { select: { id: true, name: true, username: true } } },
    });
    if (!supervisor) {
      throw new NotFoundException('Supervisor not found');
    }

    await this.prisma.client.user.update({
      where: { id: supervisor.userId },
      data: {
        password: await bcrypt.hash(password, 10),
        mustChangePassword: true,
      },
    });

    return {
      id: supervisor.id,
      name: supervisor.user.name,
      username: supervisor.user.username,
      passwordReset: true,
    };
  }

  /**
   * "Resend login": issues a new system-generated temporary password and
   * emails it to the account (CLAUDE.md §16).
   *
   * This is the system-generated counterpart to the two methods above, keyed
   * by User id rather than a student/supervisor profile id since it is the
   * same operation either way — and it is what the coordinator's one button
   * does; there is no separate "reset password" action beside it. Stops at
   * COORDINATOR accounts for the reason `resetStudentPassword`'s comment
   * gives — that authority stays with the `reset-coordinator` CLI script.
   *
   * The old password stops working the moment the hash is replaced, and
   * `mustChangePassword` forces a new one at the next sign-in. A session that
   * is already open is not cut off here, because nothing in this app can do
   * that (tokens are stateless, §2): it ends when its 30-minute token does,
   * and `/auth/refresh` re-reads the row, so it cannot outlive that without
   * meeting the forced change.
   *
   * The email address is checked *before* anything is changed: resending to
   * an account with no usable address would replace a working password for
   * nothing, so that is a 400 with the password left as it was. (Mail being
   * switched off is different — then the new password is simply shown to the
   * coordinator, as on creation.)
   */
  async resendLogin(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        name: true,
        username: true,
        email: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Account not found');
    }
    if (user.role === 'COORDINATOR') {
      throw new BadRequestException(
        'Coordinator accounts cannot be reset here — run the reset-coordinator CLI script instead.',
      );
    }
    if (!isDeliverableEmail(user.email)) {
      throw new BadRequestException(
        `${user.name} has no valid email address on file, so a login cannot be emailed. Correct the email address first.`,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(temporaryPassword, 10),
        mustChangePassword: true,
      },
    });

    const issued = await this.issueCredentials(
      user,
      temporaryPassword,
      'RESET',
    );

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      ...issued,
    };
  }

  private async getCoordinatorByUserId(userId: string) {
    const coordinator = await this.prisma.client.coordinator.findUnique({
      where: { userId },
    });
    if (!coordinator) {
      throw new NotFoundException('Coordinator profile not found');
    }
    return coordinator;
  }

  /**
   * Deletes a student outright, along with every row that references them.
   *
   * This used to refuse the delete whenever attendance, evaluations or
   * documents existed, and told the coordinator to set the student INACTIVE
   * instead. It is now a real cascade: the ordering lives in
   * `deleteStudentCascade` and runs inside one transaction, so a failure
   * part-way through rolls everything back rather than orphaning rows.
   */
  async removeStudent(studentId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const orphanedFiles = await this.prisma.client.$transaction(
      (tx) => deleteStudentCascade(tx, studentId, student.userId),
      CASCADE_TRANSACTION_OPTIONS,
    );

    // Supabase Storage is not part of the transaction, so the objects go only
    // after the commit. A leftover file is recoverable; a half-deleted
    // database is not — so a storage failure is logged and the delete still
    // reports success.
    await Promise.all(
      orphanedFiles.map(async (path) => {
        try {
          await deleteFile(path);
        } catch (err) {
          this.logger.error(
            `Student ${studentId} was deleted but its storage object ${path} was not: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }),
    );

    return { id: studentId, deleted: true };
  }

  /**
   * Deletes a supervisor and their login.
   *
   * Their evaluations go with them, but attendance they actioned stays and
   * merely loses its approver — a student's approved hours must survive their
   * supervisor leaving. See `deleteSupervisorCascade`.
   */
  async removeSupervisor(supervisorId: string) {
    const supervisor = await this.prisma.client.supervisor.findUnique({
      where: { id: supervisorId },
      select: { userId: true },
    });
    if (!supervisor) {
      throw new NotFoundException('Supervisor not found');
    }

    await this.prisma.client.$transaction(
      (tx) => deleteSupervisorCascade(tx, supervisorId, supervisor.userId),
      CASCADE_TRANSACTION_OPTIONS,
    );

    return { id: supervisorId, deleted: true };
  }

  /**
   * The CourseRequirement a placement would auto-fill from, so the coordinator
   * can see it — and the establishment they are considering — before
   * confirming. Record placement is meant to be one action (thesis rule): this
   * is what lets the form show the hours pre-filled rather than making the
   * coordinator hunt for the right number.
   */
  async getPlacementDefaults(studentId: string, establishmentId?: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: { id: true, courseId: true, courseYearLevel: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (!student.courseId) {
      throw new BadRequestException(
        'This student has no course set. Assign a course before recording a placement.',
      );
    }

    const yearLevel = student.courseYearLevel;
    if (yearLevel === null) {
      throw new BadRequestException(
        'This student has no year level set. Assign a year level (or a block) before recording a placement.',
      );
    }

    const requirement = await this.prisma.client.courseRequirement.findUnique({
      where: { courseId_yearLevel: { courseId: student.courseId, yearLevel } },
    });
    if (!requirement) {
      throw new BadRequestException(
        `This course has no OJT requirement defined for year ${yearLevel}.`,
      );
    }

    let establishment: {
      id: string;
      name: string;
      status: string;
      traineeSlots: number | null;
      activeTrainees: number;
    } | null = null;
    if (establishmentId) {
      const found = await this.prisma.client.establishment.findUnique({
        where: { id: establishmentId },
        select: {
          id: true,
          name: true,
          status: true,
          traineeSlots: true,
        },
      });
      if (!found) {
        throw new NotFoundException('Establishment not found');
      }
      // Slots used = placements in progress there, so the dialog can warn
      // before a placement into a full establishment (CLAUDE.md §19).
      establishment = {
        ...found,
        activeTrainees: await this.prisma.client.trainingAssignment.count({
          where: { establishmentId, status: 'ACTIVE' },
        }),
      };
    }

    return {
      courseId: student.courseId,
      yearLevel,
      requirement: {
        id: requirement.id,
        yearLevel: requirement.yearLevel,
        requiredHours: requirement.requiredHours,
      },
      requiredHours: requirement.requiredHours,
      establishment,
    };
  }

  /**
   * Records a placement: one action that transfers the student's previous
   * ACTIVE assignment (if any) out and creates a new one at zero hours.
   *
   * The previous assignment is never deleted or merged — it is marked
   * TRANSFERRED with its `endDate` set to the new assignment's `startDate`,
   * preserving its own hours and history exactly as the thesis requires.
   */
  async createPlacement(
    studentId: string,
    data: {
      establishmentId: string;
      dutyDays: Weekday[];
      startDate: string;
      academicYear: string;
      requiredHours?: number;
      blockId?: string;
      confirmFull?: boolean;
    },
  ) {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const establishment = await this.prisma.client.establishment.findUnique({
      where: { id: data.establishmentId },
      select: { id: true, name: true, status: true, traineeSlots: true },
    });
    if (!establishment) {
      throw new NotFoundException('Establishment not found');
    }
    if (establishment.status !== 'ACTIVE') {
      throw new BadRequestException(
        'This establishment is inactive and cannot receive new placements.',
      );
    }

    // Trainee slots: a full establishment is a warning to confirm, not a
    // wall — the coordinator may know something the number does not. The
    // student's own placement there (a re-placement at the same
    // establishment) is not counted against it, since it is being replaced.
    if (establishment.traineeSlots !== null && !data.confirmFull) {
      const activeTrainees = await this.prisma.client.trainingAssignment.count({
        where: {
          establishmentId: data.establishmentId,
          status: 'ACTIVE',
          studentId: { not: studentId },
        },
      });
      if (activeTrainees >= establishment.traineeSlots) {
        throw new ConflictException({
          code: 'ESTABLISHMENT_FULL',
          message: `${establishment.name} already has ${activeTrainees} of ${establishment.traineeSlots} trainee slots filled. Confirm to place this student there anyway.`,
        });
      }
    }

    if (data.blockId) {
      const block = await this.prisma.client.block.findUnique({
        where: { id: data.blockId },
        select: { id: true, courseId: true, yearLevel: true },
      });
      if (!block) {
        throw new BadRequestException('blockId does not match a block');
      }
      if (student.courseId && block.courseId !== student.courseId) {
        throw new BadRequestException(
          "Block does not belong to the student's course",
        );
      }
      if (
        student.courseYearLevel !== null &&
        block.yearLevel !== student.courseYearLevel
      ) {
        throw new BadRequestException(
          "Block does not match the student's year level",
        );
      }
    }

    const yearLevel = student.courseYearLevel;
    if (yearLevel === null) {
      throw new BadRequestException(
        'This student has no year level set. Assign a course/year level before recording a placement.',
      );
    }

    // requiredHours auto-fills from the matching CourseRequirement — the
    // coordinator only confirms it (thesis rule) — but an explicit override is
    // still honoured. Either way, the requirement is linked for traceability
    // whenever one exists for this course/year, even when its hours were
    // overridden.
    const requirement = student.courseId
      ? await this.prisma.client.courseRequirement.findUnique({
          where: {
            courseId_yearLevel: { courseId: student.courseId, yearLevel },
          },
        })
      : null;
    if (data.requiredHours === undefined && !requirement) {
      throw new BadRequestException(
        student.courseId
          ? `This course has no OJT requirement defined for year ${yearLevel}.`
          : 'This student has no course set. Assign a course, or provide requiredHours directly.',
      );
    }
    const requiredHours = data.requiredHours ?? requirement!.requiredHours;

    const startDate = startOfUtcDay(data.startDate);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is not a valid date');
    }

    const result = await this.prisma.client.$transaction(async (tx) => {
      const activeAssignment = await tx.trainingAssignment.findFirst({
        where: { studentId, status: 'ACTIVE' },
      });
      if (activeAssignment) {
        await tx.trainingAssignment.update({
          where: { id: activeAssignment.id },
          data: { status: 'TRANSFERRED', endDate: startDate },
        });
      }

      const created = await tx.trainingAssignment.create({
        data: {
          studentId,
          establishmentId: data.establishmentId,
          courseRequirementId: requirement?.id,
          blockId: data.blockId,
          yearLevel,
          requiredHours,
          dutyDays: data.dutyDays,
          startDate,
          academicYear: data.academicYear,
          status: 'ACTIVE',
        },
      });

      // Mirrored onto the deprecated Student fields so supervisor scoping
      // (Student.establishmentId) and any screen still reading these directly
      // keep working until they are migrated onto TrainingAssignment.
      await tx.student.update({
        where: { id: studentId },
        data: {
          establishmentId: data.establishmentId,
          requiredHours,
          startDate,
          endDate: null,
        },
      });

      // The placement's group thread — student, the establishment's
      // supervisors, every coordinator — is created with the placement, in
      // this transaction, so one never exists without the other. The previous
      // assignment's thread is left as it is: it became read-only the moment
      // that assignment was marked TRANSFERRED above.
      await this.placementThreads.createForAssignment(tx, {
        id: created.id,
        studentUserId: student.userId,
        establishmentId: data.establishmentId,
      });

      // Goal 3: the student and every supervisor at the new establishment.
      // Two calls, not one with both userIds — a student and a supervisor
      // land on different role-gated routes, so `link` can't be shared.
      // Committed in the same transaction as the placement itself — a
      // notification for a placement that then rolled back would be
      // meaningless.
      const establishmentSupervisors = await tx.supervisor.findMany({
        where: { establishmentId: data.establishmentId },
        select: { userId: true },
      });
      // Each placement is its own new TrainingAssignment row, so the id
      // alone is already a fresh "version" — no submittedAt-style marker
      // needed the way attendance's dedupeKey has one.
      const dedupeKey = `placement:${created.id}`;
      await this.notifications.notify(tx, {
        userIds: [student.userId],
        type: 'PLACEMENT_RECORDED',
        title: 'New OJT placement recorded',
        body: `A placement was recorded for ${data.academicYear}, starting ${formatDateOnly(startDate)}.`,
        link: '/student/dashboard',
        entityType: 'TrainingAssignment',
        entityId: created.id,
        dedupeKey,
      });
      if (establishmentSupervisors.length > 0) {
        await this.notifications.notify(tx, {
          userIds: establishmentSupervisors.map((s) => s.userId),
          type: 'PLACEMENT_RECORDED',
          title: 'New trainee placed at your establishment',
          body: `A student was placed at your establishment for ${data.academicYear}, starting ${formatDateOnly(startDate)}.`,
          link: '/supervisor/dashboard',
          entityType: 'TrainingAssignment',
          entityId: created.id,
          dedupeKey,
        });
      }

      return { created, progress: await computeProgress(tx, created.id) };
    });

    return { ...result.created, progress: result.progress };
  }

  /**
   * Every assignment a student has ever had, newest first, with progress.
   *
   * Each row also carries both halves of the two-part assessment: the
   * supervisor's evaluation sheets written for that placement (totals only —
   * the full sheet is `GET /coordinator/evaluations`), and the coordinator's own
   * grade with who recorded it and when. `grading` says whether a grade can be
   * recorded yet, decided by the same function `setAssignmentGrade` enforces.
   */
  async listAssignments(studentId: string) {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const assignments = await this.prisma.client.trainingAssignment.findMany({
      where: { studentId },
      include: ASSIGNMENT_ASSESSMENT_INCLUDE,
      orderBy: { startDate: 'desc' },
    });

    return Promise.all(
      assignments.map(async (assignment) => {
        const progress = await computeProgress(
          this.prisma.client,
          assignment.id,
        );
        return {
          ...assignment,
          progress,
          grading: gradeEligibility(assignment, progress),
          // The four conditions for completion, each on its own, for the
          // checklist (common/assignment-completion.ts).
          completion: await loadCompletionChecklist(
            this.prisma.client,
            assignment.id,
          ),
        };
      }),
    );
  }

  /**
   * Records, or corrects, the coordinator's final grade for one placement —
   * based on the OJT portfolio report and its presentation, and separate from
   * the supervisor's evaluation sheet, which this never touches.
   *
   * **Who may grade.** Any coordinator, not only the one whose block the
   * assignment is in. That is the existing rule, not a new one: "My Block" is a
   * view default and never an authorization boundary (CLAUDE.md §2), and every
   * other coordinator write — journal review, document review, placements — is
   * program-wide in the same way. `gradedById` records which coordinator it
   * was.
   *
   * **When.** Only once the placement has ended or its approved hours reach the
   * requirement (`gradeEligibility`); 400 otherwise.
   *
   * `gradedById`/`gradedAt` are stamped here, never read from the body, and are
   * restamped on a correction so they always describe the grade as it stands.
   * Saving the same grade and remarks again changes nothing and notifies no
   * one, which is what makes a double-click a no-op.
   */
  async setAssignmentGrade(
    userId: string,
    assignmentId: string,
    data: { grade: number; remarks?: string | null },
  ) {
    const coordinator = await this.getCoordinatorByUserId(userId);

    const assignment = await this.prisma.client.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        ...ASSIGNMENT_ASSESSMENT_INCLUDE,
        student: { select: { userId: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Training assignment not found');
    }

    const progress = await computeProgress(this.prisma.client, assignmentId);
    const grading = gradeEligibility(assignment, progress);
    if (!grading.eligible) {
      throw new BadRequestException(grading.reason);
    }

    // `undefined` = remarks not in the request, leave them as they are.
    const remarks =
      data.remarks === undefined
        ? assignment.coordinatorGradeRemarks
        : data.remarks;
    const isCorrection = assignment.coordinatorGrade !== null;
    const unchanged =
      isCorrection &&
      Number(assignment.coordinatorGrade) === data.grade &&
      assignment.coordinatorGradeRemarks === remarks;

    const { student, ...current } = assignment;
    if (unchanged) {
      return { ...current, progress, grading };
    }

    const gradedAt = new Date();
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const saved = await tx.trainingAssignment.update({
        where: { id: assignmentId },
        data: {
          coordinatorGrade: data.grade,
          coordinatorGradeRemarks: remarks,
          gradedById: coordinator.id,
          gradedAt,
        },
        include: ASSIGNMENT_ASSESSMENT_INCLUDE,
      });

      // Committed with the grade itself: a notification for a grade that then
      // rolled back would point the student at nothing.
      await this.notifications.notify(tx, {
        userIds: [student.userId],
        type: 'ASSESSMENT_COMPLETED',
        title: isCorrection
          ? 'Coordinator grade updated'
          : 'Coordinator grade recorded',
        body:
          `Your OJT coordinator ${isCorrection ? 'updated' : 'recorded'} your final grade ` +
          `for your placement at ${assignment.establishment.name}: ${data.grade.toFixed(2)}.`,
        link: '/student/dashboard',
        entityType: 'TrainingAssignment',
        entityId: assignmentId,
        // `gradedAt` is the version marker: it only moves when the grade or
        // its remarks actually change (see `unchanged` above), so a repeated
        // save never reaches here, while a real correction is a new event and
        // notifies again.
        dedupeKey: `grade:${assignmentId}:${gradedAt.toISOString()}`,
      });

      return saved;
    });

    // The grade is one of the four completion conditions.
    await this.syncCompletion(assignmentId);

    return { ...updated, progress, grading };
  }

  /**
   * Re-checks whether an assignment is now complete, after a write that could
   * make it so. Never throws: the write it follows has already succeeded and
   * must not be reported as failed because this could not run — the next
   * qualifying write, or a manual "Mark Completed", catches it up.
   */
  private async syncCompletion(assignmentId: string) {
    try {
      await syncAssignmentCompletion(this.prisma.client, assignmentId);
    } catch (err) {
      this.logger.error(
        `Completion check for assignment ${assignmentId} failed: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  /**
   * Edits an assignment in place: duty days, an early end date, or closing it
   * out (COMPLETED/CANCELLED). Never TRANSFERRED here — that status only ever
   * comes from `createPlacement` recording the next placement.
   */
  async updateAssignment(
    assignmentId: string,
    data: {
      dutyDays?: Weekday[];
      endDate?: string | null;
      status?: 'COMPLETED' | 'CANCELLED';
    },
  ) {
    const assignment = await this.prisma.client.trainingAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Training assignment not found');
    }

    return this.prisma.client.trainingAssignment.update({
      where: { id: assignmentId },
      data: {
        dutyDays: data.dutyDays,
        endDate: toNullableDate(data.endDate),
        status: data.status,
      },
      include: { establishment: { select: { id: true, name: true } } },
    });
  }
}

/**
 * What an assignment row carries for the two-part assessment: where it was, who
 * recorded the coordinator's grade, and the totals of the supervisor's sheets
 * for that placement, newest first.
 */
const ASSIGNMENT_ASSESSMENT_INCLUDE = {
  establishment: { select: { id: true, name: true } },
  gradedBy: GRADED_BY_SELECT,
  evaluations: {
    select: {
      id: true,
      totalRating: true,
      maxTotalRating: true,
      evaluatorName: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  },
} as const;

/**
 * The account columns a roster row shows. Never the password hash — and the
 * three `credentials*` columns are the *outcome* of emailing the login, not
 * the login itself.
 */
const ACCOUNT_SELECT = {
  id: true,
  email: true,
  username: true,
  name: true,
  createdAt: true,
  credentialsSentAt: true,
  credentialsEmailStatus: true,
  credentialsEmailError: true,
} as const;

const NAME_KEYS = ['firstName', 'lastName', 'middleName'] as const;

const ADDRESS_KEYS = [
  'region',
  'province',
  'cityMunicipality',
  'barangay',
  'postalCode',
] as const;

/**
 * The address as it will read once an update is applied: each part taken from
 * the request where the request has it (`null` = cleared), and from the stored
 * row otherwise.
 */
export function mergeAddress(
  stored: Record<(typeof ADDRESS_KEYS)[number], string | null>,
  incoming: Partial<Record<(typeof ADDRESS_KEYS)[number], string | null>>,
) {
  return Object.fromEntries(
    ADDRESS_KEYS.map((key) => [
      key,
      incoming[key] === undefined ? stored[key] : incoming[key],
    ]),
  ) as Record<(typeof ADDRESS_KEYS)[number], string | null>;
}

const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Monday 00:00 UTC, `weeksAgo` weeks back from the current week. */
function startOfWeek(weeksAgo = 0): Date {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
  );
  return new Date(monday - weeksAgo * MS_PER_WEEK);
}

/**
 * Buckets attendance into the last `weeks` Monday-started weeks.
 *
 * Weeks with no activity still appear, so the chart shows a real gap rather
 * than silently compressing the timeline.
 */
function buildWeeklyTrend(
  rows: { date: Date; status: string }[],
  weeks: number,
) {
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = startOfWeek(weeks - 1 - i);
    return {
      start,
      label: start.toISOString().slice(5, 10), // MM-DD
      approved: 0,
      pending: 0,
      declined: 0,
    };
  });

  for (const row of rows) {
    const index = buckets.findLastIndex((b) => row.date >= b.start);
    if (index === -1) continue;
    const bucket = buckets[index];
    if (row.status === 'APPROVED') bucket.approved += 1;
    else if (row.status === 'PENDING') bucket.pending += 1;
    else if (row.status === 'DECLINED') bucket.declined += 1;
  }

  return buckets.map(({ start, ...rest }) => rest);
}

/** Maps the flat DTO onto Student columns, skipping anything not supplied. */
/**
 * Passes the three-way state of a date field through to Prisma intact:
 * absent -> `undefined` (leave the column alone), explicitly cleared ->
 * `null`, otherwise the parsed `Date`. The old `value ? new Date(value) :
 * undefined` collapsed "cleared" into "unchanged", so a date could never be
 * removed once set.
 */
function toNullableDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

/**
 * "4th Year" for 4, "1st Year" for 1, etc. — the display form
 * `resolveCourseFields` writes into the deprecated free-text `yearLevel`
 * column whenever a structured `courseYearLevel` is set, so screens still
 * reading that column show something readable instead of a bare digit.
 */
function ordinalYearLabel(n: number): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix} Year`;
}

/**
 * Shared create/update fields — the columns a student record actually has.
 * There is no `age` (derived from `dateOfBirth`, see `common/age.ts`), no
 * `school` (one fixed school, `common/school.ts`) and no free-text `address`
 * (the old one survives read-only as `legacyAddress` and is never written).
 */
function studentProfileData(data: StudentDetails) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName,
    gender: data.gender,
    dateOfBirth: toNullableDate(data.dateOfBirth),
    contactNumber: data.contactNumber,
    region: data.region,
    province: data.province,
    cityMunicipality: data.cityMunicipality,
    barangay: data.barangay,
    streetAddress: data.streetAddress,
    postalCode: data.postalCode,
    // DEPRECATED, but still written: `resolveCourseFields` derives fresh
    // values for both from courseId/blockId/courseYearLevel when those are
    // sent, so screens still reading these two columns keep rendering
    // something accurate. Unset by that call, `data.course`/`data.yearLevel`
    // pass through as sent — the pre-existing free-text behavior.
    course: data.course,
    yearLevel: data.yearLevel,
    courseId: data.courseId,
    courseYearLevel: data.courseYearLevel,
    blockId: data.blockId,
    establishmentId: data.establishmentId,
    requiredHours: data.requiredHours,
    startDate: toNullableDate(data.startDate),
    status: data.status,
  };
}

/**
 * User.name is the single display name the rest of the app reads, but the
 * coordinator's form collects first/middle/last separately. Compose it, falling
 * back to an explicit `name` when the parts are absent.
 */
function buildFullName(
  data: StudentDetails,
  fallback: string | null = '',
): string | null {
  // "Juan S. Dela Cruz" — the middle name contributes its initial only.
  const composed = formatFullName(data);
  if (composed) return composed;
  if (data.name?.trim()) return data.name.trim();
  return fallback;
}

/**
 * Reads one `Promise.allSettled` slot, falling back to an empty default and
 * reporting the failure instead of taking the whole response down with it.
 *
 * Typed against the tuple `allSettled` returns, so each call keeps the exact
 * type of its own query — no casts.
 */
function settledOr<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  section: string,
  onFail: (section: string, reason: unknown) => void,
): T {
  if (result.status === 'fulfilled') return result.value;
  onFail(section, result.reason);
  return fallback;
}
