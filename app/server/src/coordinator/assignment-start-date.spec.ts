import { BadRequestException } from '@nestjs/common';
import { CredentialsEmailService } from '../mail/credentials-email.service';
import { PlacementThreadService } from '../messages/placement-thread.service';
import { NotificationService } from '../notification/notification.service';
import { OverdueSweepService } from '../notification/overdue-sweep.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertStartDateFits, CoordinatorService } from './coordinator.service';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NONE = { endDate: null, earliestAttendance: null, earliestJournal: null };

describe('assertStartDateFits', () => {
  it('allows any start when nothing is logged and there is no end date', () => {
    expect(() => assertStartDateFits(day('2026-11-02'), NONE)).not.toThrow();
  });

  it('allows a start on the earliest logged day', () => {
    expect(() =>
      assertStartDateFits(day('2026-11-04'), {
        ...NONE,
        earliestAttendance: day('2026-11-04'),
      }),
    ).not.toThrow();
  });

  it('refuses a start later than the earliest attendance, naming that day', () => {
    expect(() =>
      assertStartDateFits(day('2026-11-05'), {
        ...NONE,
        earliestAttendance: day('2026-11-04'),
      }),
    ).toThrow(
      /Attendance is already logged for .*The start date can't be later than that\./,
    );
  });

  it('refuses a start later than the earliest journal entry', () => {
    expect(() =>
      assertStartDateFits(day('2026-11-05'), {
        ...NONE,
        earliestJournal: day('2026-11-04'),
      }),
    ).toThrow(/A journal entry already exists for/);
  });

  it('refuses a start on or after the (exclusive) end date', () => {
    for (const start of ['2026-12-01', '2026-12-02']) {
      expect(() =>
        assertStartDateFits(day(start), {
          ...NONE,
          endDate: day('2026-12-01'),
        }),
      ).toThrow(BadRequestException);
    }
  });
});

describe('CoordinatorService.updateAssignment — startDate', () => {
  function setup(status: 'ACTIVE' | 'COMPLETED', earliestAttendance?: string) {
    const tx = {
      trainingAssignment: {
        update: jest.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
      },
      student: { update: jest.fn().mockResolvedValue({}) },
    };
    const client = {
      trainingAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-1',
          studentId: 'student-1',
          status,
          startDate: day('2026-11-11'),
          endDate: null,
        }),
      },
      attendance: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            earliestAttendance ? { date: day(earliestAttendance) } : null,
          ),
      },
      journalEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new CoordinatorService(
      { client } as unknown as PrismaService,
      {} as NotificationService,
      {} as OverdueSweepService,
      {} as PlacementThreadService,
      {} as CredentialsEmailService,
    );
    return { service, tx, client };
  }

  it('moves an ACTIVE placement and its Student.startDate copy together', async () => {
    const { service, tx } = setup('ACTIVE');

    await service.updateAssignment('assignment-1', { startDate: '2026-11-02' });

    const [[{ data }]] = tx.trainingAssignment.update.mock.calls as [
      [{ data: { startDate?: Date } }],
    ];
    expect(data.startDate).toEqual(day('2026-11-02'));
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: { startDate: day('2026-11-02') },
    });
  });

  it('leaves the copy alone for a placement that is no longer ACTIVE', async () => {
    const { service, tx } = setup('COMPLETED');

    await service.updateAssignment('assignment-1', { startDate: '2026-11-02' });

    expect(tx.trainingAssignment.update).toHaveBeenCalled();
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  it('refuses a start later than attendance already logged, writing nothing', async () => {
    const { service, client } = setup('ACTIVE', '2026-11-04');

    await expect(
      service.updateAssignment('assignment-1', { startDate: '2026-11-05' }),
    ).rejects.toThrow(/Attendance is already logged for/);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('does not run the start-date checks when startDate is not sent', async () => {
    const { service, client } = setup('ACTIVE', '2026-11-04');

    await service.updateAssignment('assignment-1', { dutyDays: ['MON'] });

    expect(client.attendance.findFirst).not.toHaveBeenCalled();
  });
});
