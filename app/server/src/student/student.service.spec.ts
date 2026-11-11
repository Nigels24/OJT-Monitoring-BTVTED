import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudentService } from './student.service';

/**
 * StudentService.submitAttendance over a stubbed Prisma: the same-date rules
 * (create / PENDING correction / APPROVED refusal / DECLINED resubmission) and
 * the date rules (placement start, future, duty day).
 *
 * "Now" is pinned to Wed 11 Nov 2026, 12:00 in Manila (04:00 UTC), so
 * manilaToday() is 2026-11-11. The ACTIVE placement starts Mon 2 Nov 2026 and
 * runs Wed-Fri.
 */
const NOW = new Date('2026-11-11T04:00:00.000Z');
const FIRST_SUBMITTED = new Date('2026-10-20T01:00:00.000Z');

const ASSIGNMENT = {
  id: 'assignment-1',
  studentId: 'student-1',
  status: 'ACTIVE',
  startDate: new Date('2026-11-02T00:00:00.000Z'),
  endDate: null,
  dutyDays: ['WED', 'THU', 'FRI'],
};

/** Fri 6 Nov 2026 — a duty day inside the placement, in the past. */
const DAY = '2026-11-06';
const DAY_DATE = new Date(`${DAY}T00:00:00.000Z`);

function times(date = DAY) {
  return {
    date,
    timeInAM: `${date}T00:00:00.000Z`, // 08:00 Manila
    timeOutAM: `${date}T04:00:00.000Z`, // 12:00 Manila
  };
}

function existingRow(status: 'PENDING' | 'APPROVED' | 'DECLINED') {
  return {
    id: 'attendance-1',
    studentId: 'student-1',
    date: DAY_DATE,
    timeInAM: new Date(`${DAY}T01:00:00.000Z`),
    timeOutAM: new Date(`${DAY}T03:00:00.000Z`),
    timeInPM: null,
    timeOutPM: null,
    remarks: 'first try',
    status,
    declineReason:
      status === 'DECLINED' ? 'Times do not match the logbook' : null,
    approvedById: status === 'PENDING' ? null : 'supervisor-1',
    trainingAssignmentId: 'assignment-1',
    createdAt: FIRST_SUBMITTED,
    submittedAt: FIRST_SUBMITTED,
    lastEditedAt: null,
  };
}

/**
 * A Prisma client with just the calls submitAttendance makes. `create` and
 * `update` echo back a row built from their `data`, as Prisma would.
 */
function setup(existing: ReturnType<typeof existingRow> | null = null) {
  const attendance = {
    findUnique: jest.fn().mockResolvedValue(existing),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'attendance-new',
        timeInPM: null,
        timeOutPM: null,
        submittedAt: NOW,
        createdAt: NOW,
        lastEditedAt: null,
        declineReason: null,
        ...data,
      }),
    ),
    update: jest.fn(
      ({ data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...existing, ...data }),
    ),
  };
  // The AttendanceDecline trail must never be written (or deleted) here.
  const attendanceDecline = new Proxy(
    {},
    {
      get: (_t, method: string) => () => {
        throw new Error(`attendanceDecline.${method} must not be called`);
      },
    },
  );
  const client = {
    student: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'student-1',
        userId: 'user-1',
        status: 'ACTIVE',
        establishmentId: 'establishment-1',
        user: { name: 'Juan Dela Cruz' },
      }),
    },
    trainingAssignment: {
      findFirst: jest.fn().mockResolvedValue(ASSIGNMENT),
    },
    attendance,
    attendanceDecline,
  };
  const service = new StudentService({ client } as unknown as PrismaService);
  return { service, attendance };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('StudentService.submitAttendance — same date', () => {
  it('creates a new PENDING log and reports CREATED', async () => {
    const { service, attendance } = setup(null);

    const result = await service.submitAttendance('user-1', times());

    expect(result.outcome).toBe('CREATED');
    expect(result.hours).toBe(4);
    expect(attendance.create).toHaveBeenCalledTimes(1);
    expect(attendance.update).not.toHaveBeenCalled();
    const { data } = attendance.create.mock.calls[0][0];
    expect(data).toMatchObject({
      studentId: 'student-1',
      date: DAY_DATE,
      status: 'PENDING',
      trainingAssignmentId: 'assignment-1',
    });
    expect(data).not.toHaveProperty('lastEditedAt');
  });

  it('corrects a PENDING log in place, keeping submittedAt and setting lastEditedAt', async () => {
    const { service, attendance } = setup(existingRow('PENDING'));

    const result = await service.submitAttendance('user-1', {
      ...times(),
      remarks: 'fixed the times',
    });

    expect(result.outcome).toBe('UPDATED');
    expect(attendance.create).not.toHaveBeenCalled();
    const { where, data } = attendance.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'attendance-1' });
    // The overdue clock must not restart because the student re-saved it.
    expect(data).not.toHaveProperty('submittedAt');
    expect(data.lastEditedAt).toEqual(NOW);
    expect(data.remarks).toBe('fixed the times');
    expect(result.submittedAt).toEqual(FIRST_SUBMITTED);
  });

  it('refuses to change an APPROVED log', async () => {
    const { service, attendance } = setup(existingRow('APPROVED'));

    const attempt = service.submitAttendance('user-1', times());

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(
      "This log is already approved and can't be changed.",
    );
    expect(attendance.update).not.toHaveBeenCalled();
    expect(attendance.create).not.toHaveBeenCalled();
  });

  it('resubmits a DECLINED log: back to PENDING, new submittedAt, reason and trail kept', async () => {
    const { service, attendance } = setup(existingRow('DECLINED'));

    const result = await service.submitAttendance('user-1', times());

    expect(result.outcome).toBe('RESUBMITTED');
    const { data } = attendance.update.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'PENDING',
      approvedById: null,
      submittedAt: NOW,
      lastEditedAt: NOW,
    });
    // The latest reason is cleared only by an approval; the decline trail is
    // untouched (the stub throws on any attendanceDecline call).
    expect(data).not.toHaveProperty('declineReason');
    expect(result.declineReason).toBe('Times do not match the logbook');
  });
});

describe('StudentService.submitAttendance — date rules', () => {
  it('refuses a future date', async () => {
    const { service, attendance } = setup(null);

    await expect(
      service.submitAttendance('user-1', times('2026-11-12')),
    ).rejects.toThrow('Attendance cannot be logged for a future date.');
    expect(attendance.create).not.toHaveBeenCalled();
  });

  it('refuses a date before the placement starts, and says when it starts', async () => {
    const { service, attendance } = setup(null);

    const attempt = service.submitAttendance('user-1', times('2026-10-30'));

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(attempt).rejects.toThrow(/Your current placement starts on/);
    expect(attendance.create).not.toHaveBeenCalled();
  });

  it('refuses a day that is not a duty day, naming the duty days', async () => {
    const { service, attendance } = setup(null);

    // Mon 9 Nov 2026: inside the placement, not in the future, not Wed-Fri.
    await expect(
      service.submitAttendance('user-1', times('2026-11-09')),
    ).rejects.toThrow(
      'Mon is not one of your scheduled duty days (Wed, Thu, Fri).',
    );
    expect(attendance.create).not.toHaveBeenCalled();
  });

  it('accepts today and a past duty day within the placement', async () => {
    const { service } = setup(null);

    await expect(
      service.submitAttendance('user-1', times('2026-11-11')),
    ).resolves.toMatchObject({ outcome: 'CREATED' });
    await expect(
      service.submitAttendance('user-1', times('2026-11-04')),
    ).resolves.toMatchObject({ outcome: 'CREATED' });
  });
});
