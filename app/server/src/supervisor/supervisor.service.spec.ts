import { ConflictException } from '@nestjs/common';
import { EvaluationTemplateService } from '../evaluation-template/evaluation-template.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupervisorService } from './supervisor.service';

/**
 * SupervisorService.declineAttendance over a stubbed Prisma: only a PENDING
 * (or already-DECLINED) log can be declined; the status change and the
 * AttendanceDecline history row are written in one transaction, with the entry
 * as it stood before the decline.
 */
const SUBMITTED = new Date('2026-11-06T09:00:00.000Z');
const APPROVED_MESSAGE = "This log is already approved and can't be declined.";

type Status = 'PENDING' | 'APPROVED' | 'DECLINED';

function row(status: Status) {
  return {
    id: 'attendance-1',
    studentId: 'student-1',
    date: new Date('2026-11-06T00:00:00.000Z'),
    timeInAM: new Date('2026-11-06T00:00:00.000Z'),
    timeOutAM: new Date('2026-11-06T04:00:00.000Z'),
    timeInPM: null,
    timeOutPM: null,
    remarks: 'student note',
    status,
    declineReason:
      status === 'DECLINED' ? 'Times do not match the logbook' : null,
    approvedById: status === 'PENDING' ? null : 'supervisor-1',
    trainingAssignmentId: 'assignment-1',
    submittedAt: SUBMITTED,
    lastEditedAt: null,
    student: { userId: 'student-user-1', establishmentId: 'establishment-1' },
    trainingAssignment: { establishmentId: 'establishment-1' },
  };
}

function setup(
  options: {
    /** Status when the service first reads the row. */
    status?: Status;
    /** Status by the time the transaction writes (an approval racing in). */
    statusAtWrite?: Status;
    latestDecline?: { reason: string; declinedAt: Date } | null;
  } = {},
) {
  const read = row(options.status ?? 'PENDING');
  const statusAtWrite = options.statusAtWrite ?? read.status;
  const order: string[] = [];
  let written: Record<string, unknown> = {};
  const tx = {
    attendance: {
      updateMany: jest.fn(
        ({ data }: { where: unknown; data: Record<string, unknown> }) => {
          order.push('tx.attendance.updateMany');
          if (statusAtWrite === 'APPROVED')
            return Promise.resolve({ count: 0 });
          written = data;
          return Promise.resolve({ count: 1 });
        },
      ),
      findUniqueOrThrow: jest.fn(() => {
        order.push('tx.attendance.findUniqueOrThrow');
        return Promise.resolve({ ...read, ...written });
      }),
    },
    attendanceDecline: {
      findFirst: jest.fn(() => {
        order.push('tx.attendanceDecline.findFirst');
        return Promise.resolve(options.latestDecline ?? null);
      }),
      create: jest.fn(() => {
        order.push('tx.attendanceDecline.create');
        return Promise.resolve({});
      }),
    },
  };
  const client = {
    supervisor: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'supervisor-1',
        userId: 'supervisor-user-1',
        establishmentId: 'establishment-1',
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Maria Santos' }),
    },
    attendance: {
      findUnique: jest.fn().mockResolvedValue(read),
      // Outside the transaction, nothing may be written.
      update: jest.fn(() => {
        throw new Error('attendance.update must run inside the transaction');
      }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => {
      order.push('$transaction');
      return fn(tx);
    }),
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new SupervisorService(
    { client } as unknown as PrismaService,
    {} as EvaluationTemplateService,
    notifications as unknown as NotificationService,
  );
  return { service, tx, client, notifications, order };
}

describe('SupervisorService.declineAttendance', () => {
  it('writes the status change and one history row in the same transaction', async () => {
    const { service, tx, client, order } = setup();

    const updated = await service.declineAttendance(
      'supervisor-user-1',
      'attendance-1',
      'Times do not match the logbook',
    );

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      '$transaction',
      'tx.attendance.updateMany',
      'tx.attendanceDecline.findFirst',
      'tx.attendanceDecline.create',
      'tx.attendance.findUniqueOrThrow',
    ]);
    // Never overwrites an approval: the write itself excludes APPROVED.
    expect(tx.attendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'attendance-1', status: { not: 'APPROVED' } },
      data: {
        status: 'DECLINED',
        approvedById: 'supervisor-1',
        declineReason: 'Times do not match the logbook',
      },
    });
    expect(tx.attendanceDecline.create).toHaveBeenCalledWith({
      data: {
        attendanceId: 'attendance-1',
        reason: 'Times do not match the logbook',
        declinedById: 'supervisor-1',
        declinedByName: 'Maria Santos',
        // The snapshot is the entry as it stood when declined.
        date: new Date('2026-11-06T00:00:00.000Z'),
        timeInAM: new Date('2026-11-06T00:00:00.000Z'),
        timeOutAM: new Date('2026-11-06T04:00:00.000Z'),
        timeInPM: null,
        timeOutPM: null,
        hours: 4,
        remarks: 'student note',
      },
    });
    // The latest reason stays on the row for existing screens.
    expect(updated).toMatchObject({
      status: 'DECLINED',
      declineReason: 'Times do not match the logbook',
      approvedById: 'supervisor-1',
    });
  });

  it('refuses to decline an APPROVED log with 409, writing nothing', async () => {
    const { service, client, notifications } = setup({ status: 'APPROVED' });

    const attempt = service.declineAttendance(
      'supervisor-user-1',
      'attendance-1',
      'Changed my mind',
    );

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(APPROVED_MESSAGE);
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('refuses when an approval lands between the read and the write, rolling back', async () => {
    const { service, tx, notifications } = setup({
      status: 'PENDING',
      statusAtWrite: 'APPROVED',
    });

    await expect(
      service.declineAttendance('supervisor-user-1', 'attendance-1', 'No'),
    ).rejects.toThrow(APPROVED_MESSAGE);
    // Thrown inside the transaction, before any history row is written.
    expect(tx.attendanceDecline.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('lets a DECLINED log be declined again without a second history row for a double-click', async () => {
    const { service, tx } = setup({
      status: 'DECLINED',
      latestDecline: {
        reason: 'Times do not match the logbook',
        declinedAt: new Date('2026-11-07T00:00:00.000Z'), // after SUBMITTED
      },
    });

    await expect(
      service.declineAttendance(
        'supervisor-user-1',
        'attendance-1',
        'Times do not match the logbook',
      ),
    ).resolves.toMatchObject({ status: 'DECLINED' });

    expect(tx.attendanceDecline.create).not.toHaveBeenCalled();
    expect(tx.attendance.updateMany).toHaveBeenCalledTimes(1);
  });

  it('keys the notification on submittedAt, so a resubmission is a new event', async () => {
    const { service, notifications } = setup();

    await service.declineAttendance('supervisor-user-1', 'attendance-1', 'No');

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: `ATTENDANCE_DECLINED:attendance-1:${SUBMITTED.toISOString()}`,
      }),
    );
  });
});
