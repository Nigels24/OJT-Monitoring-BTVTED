import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CoordinatorService,
  CourseLookup,
  PreparedStudentAccount,
} from '../coordinator/coordinator.service';
import { MailService } from '../mail/mail.service';
import { credentialsEmailColumns } from '../mail/credentials-email.service';
import { mailNotConfiguredReason, readMailConfig } from '../mail/mail.config';
import { manilaToday } from '../common/dates';
import {
  ImportBlock,
  ImportContext,
  ImportCourse,
  ImportRow,
  RawImportRow,
  countRows,
  validateRows,
} from './student-import.rules';
import { buildTemplate, readStudentRows } from './student-import.workbook';

/** bcrypt is CPU-bound; this many at a time keeps the event loop responsive. */
const HASH_CONCURRENCY = 8;

/**
 * Two statements insert the whole batch, but they carry up to 500 rows each
 * over a pooled connection, so the default 5s is not enough headroom.
 */
const IMPORT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

/**
 * Batch student enrollment from the Excel template.
 *
 * Preview and commit share `analyse`: read the file, load what the rows have
 * to be checked against, and run `validateRows`. Preview stops there — it
 * performs no write of any kind. Commit runs the very same analysis again on
 * the re-uploaded file (the preview is never trusted), then creates the VALID
 * rows in one transaction.
 *
 * A student is created through `CoordinatorService.prepareStudentAccount` and
 * `createStudentAccounts` — the code the single "add student" form uses — so
 * an imported student has the same generated temporary password, the same
 * forced password change, and the same course/year/block resolution. The one
 * difference is the login ID: the template has no username column, so an
 * imported student signs in with their email.
 */
@Injectable()
export class StudentImportService {
  private readonly logger = new Logger(StudentImportService.name);

  constructor(
    private prisma: PrismaService,
    private coordinators: CoordinatorService,
    private mail: MailService,
  ) {}

  /**
   * The template, with its Course and Year Level dropdowns filled from the
   * database as it stands now.
   */
  async getTemplate(): Promise<Buffer> {
    const courses = await this.loadCourses();
    return buildTemplate({
      courseCodes: courses.map((course) => course.code),
      yearLevels: [
        ...new Set(courses.flatMap((course) => course.yearLevels)),
      ].sort((a, b) => a - b),
    });
  }

  /**
   * Parses and validates the file and reports every row. **Writes nothing** —
   * it only reads, and what it returns is advisory: commit re-checks.
   */
  async preview(file: Express.Multer.File | undefined, blockId?: string) {
    const { rows, block } = await this.analyse(file, blockId);
    return { block, counts: countRows(rows), rows };
  }

  /**
   * Imports the file's VALID rows in one transaction and reports the rest.
   *
   * Either every valid row is created or none is: if the insert fails (most
   * likely another coordinator added one of the same students in the moment
   * since validation), the transaction rolls back and the answer is a 409
   * asking for a fresh preview.
   *
   * The login emails are queued after the commit and sent in the background —
   * one a second, so the response does not wait for them. With mail off,
   * nothing is queued and each student's login ID and one-time temporary
   * password are returned for the coordinator to hand out, the same rule as
   * for a single student (CLAUDE.md §16).
   */
  async commit(
    userId: string,
    file: Express.Multer.File | undefined,
    blockId?: string,
  ) {
    const coordinator = await this.prisma.client.coordinator.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!coordinator) {
      throw new NotFoundException('Coordinator profile not found');
    }

    const { rows, block, lookup } = await this.analyse(file, blockId);
    const validRows = rows.filter((row) => row.status === 'VALID');
    const rejected = rows
      .filter((row) => row.status === 'ERROR')
      .map((row) => ({
        rowNumber: row.rowNumber,
        studentNumber: row.values.studentNumber,
        reasons: row.reasons,
      }));

    const accounts = await this.prepareAccounts(validRows, block, lookup);

    const created =
      accounts.length === 0
        ? new Map<string, never>()
        : await this.prisma.client
            .$transaction(
              (tx) => this.coordinators.createStudentAccounts(tx, accounts),
              IMPORT_TRANSACTION_OPTIONS,
            )
            .catch((err: unknown) => {
              // No row contents here: an error from the insert can quote the
              // conflicting value.
              this.logger.error(
                `Student import by coordinator ${coordinator.id} rolled back: ` +
                  (err instanceof Error ? err.name : 'unknown error'),
              );
              throw new ConflictException(
                'Nothing was imported: the students could not be saved, most likely because one of them was added by someone else a moment ago. Upload the file again to see an up-to-date preview.',
              );
            });

    const issued = accounts.map((account, index) => ({
      rowNumber: validRows[index].rowNumber,
      user: created.get(account.email)!,
      temporaryPassword: account.temporaryPassword,
    }));

    const mailConfigured = this.mail.isConfigured();
    let credentials:
      | {
          rowNumber: number;
          studentNumber: string;
          name: string;
          loginId: string;
          temporaryPassword: string;
        }[]
      | undefined;

    if (issued.length > 0) {
      if (mailConfigured) {
        // Queued, not awaited. Each outcome is written to its user row as its
        // email goes out, which is what the "Login email" column shows.
        this.coordinators.queueStudentCredentials(issued);
      } else {
        // Mail is off: nothing will ever be sent for these, so say so on the
        // rows now, and hand the passwords back once.
        await this.prisma.client.user.updateMany({
          where: { id: { in: issued.map((item) => item.user.id) } },
          data: credentialsEmailColumns({
            status: 'NOT_CONFIGURED',
            error: mailNotConfiguredReason(readMailConfig()),
          }),
        });
        credentials = issued.map((item, index) => ({
          rowNumber: item.rowNumber,
          studentNumber: accounts[index].studentIdNumber,
          name: item.user.name,
          // No username on an imported account — they sign in with the email.
          loginId: item.user.username ?? item.user.email,
          temporaryPassword: item.temporaryPassword,
        }));
      }
    }

    // The audit line: who, and how many. No names, emails, student numbers or
    // passwords.
    this.logger.log(
      `Student import by coordinator ${coordinator.id}: ${rows.length} row(s) in file, ` +
        `${issued.length} created, ${rejected.length} rejected` +
        (block ? `, block ${block.id}` : '') +
        `, login emails ${issued.length === 0 ? 'n/a' : mailConfigured ? 'queued' : 'not configured'}.`,
    );

    return {
      created: issued.length,
      rejected,
      block,
      /**
       * QUEUED — emails are being sent; passwords are not in this response.
       * NOT_CONFIGURED — mail is off; `credentials` carries them, once.
       */
      emailMode: mailConfigured
        ? ('QUEUED' as const)
        : ('NOT_CONFIGURED' as const),
      credentials,
    };
  }

  /* ---------------------------------------------------------------------
   * Internals
   * ------------------------------------------------------------------ */

  /**
   * Everything preview and commit have in common, and nothing that writes:
   * read the sheet, load the context, validate. Three reads however many rows
   * the file has — the existing-number and existing-email checks are one bulk
   * query each, never one per row.
   */
  private async analyse(
    file: Express.Multer.File | undefined,
    blockId?: string,
  ) {
    const rawRows = await readStudentRows(file?.buffer);
    const courses = await this.loadCourses();
    const block = blockId ? await this.loadBlock(blockId) : null;

    const context: ImportContext = {
      courses,
      block,
      today: manilaToday(),
      ...(await this.loadExisting(rawRows)),
    };
    const rows = validateRows(rawRows, context);

    return { rows, block, lookup: inMemoryLookup(courses, block) };
  }

  /** Active courses with the year levels each has an OJT requirement for. */
  private async loadCourses(): Promise<ImportCourse[]> {
    const courses = await this.prisma.client.course.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        requirements: { select: { yearLevel: true } },
      },
      orderBy: { code: 'asc' },
    });
    return courses.map(({ requirements, ...course }) => ({
      ...course,
      yearLevels: requirements.map((requirement) => requirement.yearLevel),
    }));
  }

  private async loadBlock(blockId: string): Promise<ImportBlock> {
    const block = await this.prisma.client.block.findUnique({
      where: { id: blockId },
      select: { id: true, name: true, courseId: true, yearLevel: true },
    });
    if (!block) {
      throw new BadRequestException('blockId does not match a block');
    }
    return block;
  }

  /** Which of the file's student numbers and emails are already taken. */
  private async loadExisting(rawRows: readonly RawImportRow[]) {
    // Normalised the same way validateRows will, by validating against an
    // empty context first — cheaper than a second copy of the normalisers.
    const probe = validateRows(rawRows, {
      courses: [],
      block: null,
      today: manilaToday(),
      existingStudentNumbers: new Set(),
      existingEmails: new Set(),
    });
    const studentNumbers = [
      ...new Set(probe.map((row) => row.values.studentNumber).filter(Boolean)),
    ];
    const emails = [
      ...new Set(probe.map((row) => row.values.email).filter(Boolean)),
    ];

    const takenNumbers =
      studentNumbers.length === 0
        ? []
        : await this.prisma.client.student.findMany({
            where: { studentIdNumber: { in: studentNumbers } },
            select: { studentIdNumber: true },
          });
    // Any user — a supervisor or coordinator's email blocks a student too.
    // Case-insensitive: emails are compared lower-cased, but older accounts
    // were stored as typed.
    const takenEmails =
      emails.length === 0
        ? []
        : await this.prisma.client.user.findMany({
            where: { email: { in: emails, mode: 'insensitive' } },
            select: { email: true },
          });

    return {
      existingStudentNumbers: new Set(
        takenNumbers.map((student) => student.studentIdNumber),
      ),
      existingEmails: new Set(
        takenEmails.map((user) => user.email.toLowerCase()),
      ),
    };
  }

  /**
   * Turns each valid row into a prepared account through the shared
   * `prepareStudentAccount`, a few at a time (each one hashes a password).
   * Done before the transaction opens, so the transaction is only the insert.
   */
  private async prepareAccounts(
    rows: readonly ImportRow[],
    block: ImportBlock | null,
    lookup: CourseLookup,
  ): Promise<PreparedStudentAccount[]> {
    const accounts: PreparedStudentAccount[] = [];
    for (let start = 0; start < rows.length; start += HASH_CONCURRENCY) {
      const chunk = rows.slice(start, start + HASH_CONCURRENCY);
      accounts.push(
        ...(await Promise.all(
          chunk.map(({ values }) =>
            this.coordinators.prepareStudentAccount(
              {
                email: values.email,
                username: null,
                studentIdNumber: values.studentNumber,
                firstName: values.firstName,
                lastName: values.lastName,
                middleInitial: values.middleInitial,
                gender: values.sex,
                dateOfBirth: values.birthdate,
                // Computed from the birthdate, never read from the file.
                age: values.age,
                contactNumber: values.contactNumber || null,
                courseId: values.courseId,
                courseYearLevel: values.yearLevel,
                blockId: block?.id,
              },
              lookup,
            ),
          ),
        )),
      );
    }
    return accounts;
  }
}

/**
 * The import's `CourseLookup`: the courses and block already loaded for
 * validation, answered from memory, so resolving hundreds of rows costs no
 * further queries. Same questions, same answers as the database lookup.
 */
function inMemoryLookup(
  courses: readonly ImportCourse[],
  block: ImportBlock | null,
): CourseLookup {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  return {
    course: (id) => Promise.resolve(courseById.get(id) ?? null),
    hasRequirement: (courseId, yearLevel) =>
      Promise.resolve(
        courseById.get(courseId)?.yearLevels.includes(yearLevel) ?? false,
      ),
    block: (id) => Promise.resolve(block && block.id === id ? block : null),
  };
}
