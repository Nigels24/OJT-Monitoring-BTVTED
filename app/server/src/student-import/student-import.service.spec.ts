import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CoordinatorService } from '../coordinator/coordinator.service';
import { CredentialsEmailService } from '../mail/credentials-email.service';
import { readMailConfig } from '../mail/mail.config';
import { MailService, MailTransport } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentImportService } from './student-import.service';
import { buildWorkbookBuffer, validRow } from './student-import.testing';

const READ_METHODS = new Set(['findMany', 'findUnique', 'findFirst', 'count']);

type UserRow = {
  email: string;
  username: string | null;
  password: string;
  name: string;
  role: string;
};
type StudentRow = Record<string, unknown> & { userId: string };

/**
 * A Prisma client that records what is done to it. Reads answer from the
 * fixtures below; **any other call on any model is recorded as a write** —
 * so a test can assert that none happened without having to guess which
 * method a careless change might reach for.
 */
function fakePrisma(options: { failInsert?: boolean } = {}) {
  const writes: string[] = [];
  const reads: string[] = [];
  const insertedUsers: UserRow[] = [];
  const insertedStudents: StudentRow[] = [];
  let transactions = 0;

  const readResults: Record<string, unknown> = {
    'course.findMany': [
      {
        id: 'course-chs',
        code: 'BTVTED-CHS',
        name: 'Computer Hardware Servicing',
        requirements: [{ yearLevel: 3 }, { yearLevel: 4 }],
      },
    ],
    'block.findUnique': {
      id: 'block-a',
      name: 'Block A',
      courseId: 'course-chs',
      yearLevel: 4,
    },
    'student.findMany': [{ studentIdNumber: '2022-00003' }],
    'user.findMany': [{ email: 'Taken@Example.com' }],
    'coordinator.findUnique': { id: 'coordinator-1' },
  };

  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => (args: unknown) => {
          const call = `${name}.${method}`;
          if (READ_METHODS.has(method)) {
            reads.push(call);
            return Promise.resolve(readResults[call] ?? null);
          }
          writes.push(call);
          if (call === 'user.createManyAndReturn') {
            if (options.failInsert) {
              return Promise.reject(new Error('Unique constraint failed'));
            }
            const { data } = args as { data: UserRow[] };
            insertedUsers.push(...data);
            // Returned in reverse, as a database is free to do.
            return Promise.resolve(
              data
                .map((user, index) => ({
                  id: `user-${index + 1}`,
                  email: user.email,
                  username: user.username,
                  name: user.name,
                  role: user.role,
                }))
                .reverse(),
            );
          }
          if (call === 'student.createMany') {
            const { data } = args as { data: StudentRow[] };
            insertedStudents.push(...data);
            return Promise.resolve({ count: data.length });
          }
          return Promise.resolve({ count: 0 });
        },
      },
    );

  const models = new Map<string, unknown>();
  const client = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '$transaction') {
          return (run: (tx: unknown) => Promise<unknown>) => {
            transactions += 1;
            return run(client);
          };
        }
        if (!models.has(name)) models.set(name, model(name));
        return models.get(name);
      },
    },
  );

  return {
    prisma: { client } as unknown as PrismaService,
    writes,
    reads,
    insertedUsers,
    insertedStudents,
    transactionCount: () => transactions,
  };
}

function setup(
  mailEnv: Record<string, string | undefined> = {},
  options: { failInsert?: boolean } = {},
) {
  const db = fakePrisma(options);
  const sent: { to: string; text: string }[] = [];
  const mail = new MailService({
    config: readMailConfig(mailEnv),
    createTransport: (): MailTransport => ({
      sendMail: (message) => {
        sent.push({ to: message.to, text: message.text });
        return Promise.resolve();
      },
    }),
    gapMs: 0,
  });
  const credentialsEmail = new CredentialsEmailService(db.prisma, mail);
  // The real CoordinatorService, so the import is tested through the same
  // create-student code the single-add form uses. Its other collaborators
  // are never reached by that code.
  const coordinators = new CoordinatorService(
    db.prisma,
    {} as never,
    {} as never,
    {} as never,
    credentialsEmail,
  );
  const service = new StudentImportService(db.prisma, coordinators, mail);
  return { service, sent, ...db };
}

const file = async (
  rows: Parameters<typeof buildWorkbookBuffer>[0],
): Promise<Express.Multer.File> =>
  ({ buffer: await buildWorkbookBuffer(rows) }) as Express.Multer.File;

const MAIL_ON = {
  MAIL_ENABLED: 'true',
  GMAIL_USER: 'ojt@school.example',
  GMAIL_APP_PASSWORD: 'abcdefghijklmnop',
  APP_PUBLIC_URL: 'http://192.168.1.10:3001',
};

/** A mix: two good rows, one of each in-system clash, one bad in several ways. */
const mixedRows = () => [
  validRow(1),
  validRow(2, { lastName: 'REYES', firstName: 'ana maria', sex: 'f' }),
  validRow(3), // student number already in the system
  validRow(4, { email: 'taken@example.com' }), // email already used
  validRow(5, { email: 'nope', yearLevel: 1, birthdate: '2004-02-30' }),
];

describe('StudentImportService.preview', () => {
  it('reports every row with its status and all of its reasons', async () => {
    const { service } = setup();
    const result = await service.preview(await file(mixedRows()));

    expect(result.counts).toEqual({ total: 5, valid: 2, errors: 3 });
    expect(result.rows.map((row) => [row.rowNumber, row.status])).toEqual([
      [2, 'VALID'],
      [3, 'VALID'],
      [4, 'ERROR'],
      [5, 'ERROR'],
      [6, 'ERROR'],
    ]);
    expect(result.rows[1].values).toMatchObject({
      lastName: 'Reyes',
      firstName: 'Ana Maria',
      sex: 'Female',
      course: 'BTVTED-CHS',
    });
    expect(result.rows[2].reasons).toEqual([
      'Student No. is already in the system',
    ]);
    expect(result.rows[3].reasons).toEqual([
      'Email is already used by another account',
    ]);
    expect(result.rows[4].reasons).toEqual([
      'Birthdate is not a valid date (use yyyy-mm-dd or mm/dd/yyyy)',
      'Email is not a valid email address',
      'Year Level 1 is not valid for BTVTED-CHS (it has an OJT requirement for year 3, 4)',
    ]);
  });

  it('writes nothing: no insert, update, delete or transaction of any kind', async () => {
    const { service, writes, reads, transactionCount, sent } = setup(MAIL_ON);

    await service.preview(await file(mixedRows()), 'block-a');

    expect(writes).toEqual([]);
    expect(transactionCount()).toBe(0);
    expect(sent).toEqual([]);
    // It did do its reads — the checks really ran against the database.
    expect(reads).toEqual(
      expect.arrayContaining([
        'course.findMany',
        'block.findUnique',
        'student.findMany',
        'user.findMany',
      ]),
    );
  });

  it('writes nothing even when every row is valid', async () => {
    const { service, writes, transactionCount } = setup();
    const result = await service.preview(
      await file([validRow(1), validRow(2)]),
    );
    expect(result.counts.valid).toBe(2);
    expect(writes).toEqual([]);
    expect(transactionCount()).toBe(0);
  });

  it('rejects rows that do not fit the chosen block', async () => {
    const { service } = setup();
    const result = await service.preview(
      await file([validRow(1), validRow(2, { yearLevel: 3 })]),
      'block-a',
    );
    expect(result.block).toMatchObject({ id: 'block-a', name: 'Block A' });
    expect(result.rows.map((row) => row.status)).toEqual(['VALID', 'ERROR']);
  });
});

describe('StudentImportService.commit', () => {
  it('creates only the valid rows, in one transaction, as single-added students', async () => {
    const { service, insertedUsers, insertedStudents, transactionCount } =
      setup();

    const result = await service.commit(
      'coordinator-user',
      await file(mixedRows()),
      'block-a',
    );

    expect(result.created).toBe(2);
    expect(transactionCount()).toBe(1);
    expect(result.rejected.map((row) => row.rowNumber)).toEqual([4, 5, 6]);
    expect(result.rejected[0].reasons).toEqual([
      'Student No. is already in the system',
    ]);

    expect(insertedUsers).toHaveLength(2);
    expect(insertedUsers[1]).toMatchObject({
      email: 'student2@example.com',
      // No username column in the template: they sign in with the email.
      username: null,
      name: 'Ana Maria S. Reyes',
      role: 'STUDENT',
    });
    // `mustChangePassword` is never sent, so the schema default (true) applies
    // exactly as for a single-added student.
    expect(Object.keys(insertedUsers[0])).not.toContain('mustChangePassword');

    expect(insertedStudents).toHaveLength(2);
    expect(insertedStudents[1]).toMatchObject({
      studentIdNumber: '2022-00002',
      firstName: 'Ana Maria',
      lastName: 'Reyes',
      // The full middle name is stored; the initial is only ever derived.
      middleName: 'Santos',
      gender: 'Female',
      contactNumber: '09123456789',
      // Resolved by the shared resolveCourseFields: the course's name and the
      // year label on the deprecated columns, the ids on the structured ones.
      course: 'Computer Hardware Servicing',
      yearLevel: '4th Year',
      courseId: 'course-chs',
      courseYearLevel: 4,
      blockId: 'block-a',
    });
    expect(insertedStudents[1].dateOfBirth).toEqual(
      new Date('2004-05-17T00:00:00.000Z'),
    );
    // Derived data and the fixed school name are not columns any more.
    for (const gone of ['age', 'school', 'middleInitial', 'address']) {
      expect(Object.keys(insertedStudents[1])).not.toContain(gone);
    }
    // Linked to the right user even though the insert returned them reversed.
    expect(insertedStudents[0].userId).toBe('user-1');
    expect(insertedStudents[1].userId).toBe('user-2');
  });

  it('stores a hash of a generated temporary password, never the password', async () => {
    const { service, insertedUsers } = setup();
    const result = await service.commit(
      'coordinator-user',
      await file([validRow(1)]),
    );

    const [credential] = result.credentials!;
    expect(credential.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(insertedUsers[0].password).not.toBe(credential.temporaryPassword);
    await expect(
      bcrypt.compare(credential.temporaryPassword, insertedUsers[0].password),
    ).resolves.toBe(true);
  });

  it('with mail off: returns each login ID and one-time password, and marks the accounts', async () => {
    const { service, writes, sent } = setup({ MAIL_ENABLED: 'false' });

    const result = await service.commit(
      'coordinator-user',
      await file([validRow(1), validRow(2)]),
    );

    expect(result.emailMode).toBe('NOT_CONFIGURED');
    expect(result.credentials).toHaveLength(2);
    expect(result.credentials![0]).toMatchObject({
      rowNumber: 2,
      studentNumber: '2022-00001',
      name: 'Juan S. Dela Cruz',
      loginId: 'student1@example.com',
    });
    expect(
      new Set(result.credentials!.map((c) => c.temporaryPassword)).size,
    ).toBe(2);
    expect(sent).toEqual([]);
    expect(writes).toContain('user.updateMany');
  });

  it('with mail on: queues the emails and never returns a password', async () => {
    const { service, sent } = setup(MAIL_ON);

    const result = await service.commit(
      'coordinator-user',
      await file([validRow(1), validRow(2)]),
    );

    expect(result.emailMode).toBe('QUEUED');
    expect(result.credentials).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/temporaryPassword/);

    // Sent in the background, after the response was already built.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent.map((message) => message.to)).toEqual([
      'student1@example.com',
      'student2@example.com',
    ]);
    expect(sent[0].text).toContain('Login ID: student1@example.com');
    expect(sent[0].text).toContain('http://192.168.1.10:3001');
  });

  it('opens no transaction and sends nothing when no row is valid', async () => {
    const { service, transactionCount, sent, writes } = setup(MAIL_ON);

    const result = await service.commit(
      'coordinator-user',
      await file([validRow(3), validRow(4, { email: 'bad' })]),
    );

    expect(result.created).toBe(0);
    expect(result.rejected).toHaveLength(2);
    expect(transactionCount()).toBe(0);
    expect(writes).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('creates nothing and sends nothing if the transaction fails', async () => {
    const { service, insertedStudents, sent, writes } = setup(MAIL_ON, {
      failInsert: true,
    });

    await expect(
      service.commit(
        'coordinator-user',
        await file([validRow(1), validRow(2)]),
      ),
    ).rejects.toThrow(ConflictException);

    expect(insertedStudents).toEqual([]);
    expect(writes).not.toContain('student.createMany');
    expect(writes).not.toContain('user.updateMany');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toEqual([]);
  });

  it('re-validates the file itself rather than trusting an earlier preview', async () => {
    const { service } = setup();
    const upload = await file([validRow(1), validRow(3)]);

    const preview = await service.preview(upload);
    const commit = await service.commit('coordinator-user', upload);

    // Row 3's student number is taken; commit reaches that verdict on its own.
    expect(preview.counts).toEqual({ total: 2, valid: 1, errors: 1 });
    expect(commit.created).toBe(1);
    expect(commit.rejected).toEqual([
      {
        rowNumber: 3,
        studentNumber: '2022-00003',
        reasons: ['Student No. is already in the system'],
      },
    ]);
  });
});
