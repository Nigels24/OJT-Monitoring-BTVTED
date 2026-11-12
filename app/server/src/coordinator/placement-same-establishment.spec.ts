import { BadRequestException } from '@nestjs/common';
import { CredentialsEmailService } from '../mail/credentials-email.service';
import { PlacementThreadService } from '../messages/placement-thread.service';
import { NotificationService } from '../notification/notification.service';
import { OverdueSweepService } from '../notification/overdue-sweep.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CoordinatorService,
  SAME_ESTABLISHMENT_MESSAGE,
} from './coordinator.service';

const PLACEMENT = {
  establishmentId: 'est-1',
  dutyDays: ['MON' as const],
  startDate: '2026-11-16',
  academicYear: '2026-2027',
};

/**
 * Only the reads that come before the same-establishment check are stubbed;
 * a call that gets past it fails on the missing stubs, which is what the
 * "allowed" case asserts did not happen for the reason under test.
 */
function setup(activeEstablishmentId: string | null) {
  const client = {
    student: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'student-1',
        userId: 'user-1',
        courseId: 'course-1',
        courseYearLevel: 4,
      }),
    },
    establishment: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'est-1',
        name: 'Acme',
        status: 'ACTIVE',
        traineeSlots: null,
      }),
    },
    trainingAssignment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          activeEstablishmentId
            ? { establishmentId: activeEstablishmentId }
            : null,
        ),
    },
    courseRequirement: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };
  const service = new CoordinatorService(
    { client } as unknown as PrismaService,
    {} as NotificationService,
    {} as OverdueSweepService,
    {} as PlacementThreadService,
    {} as CredentialsEmailService,
  );
  return { service, client };
}

describe('CoordinatorService.createPlacement — same establishment', () => {
  it('refuses a transfer to the establishment the student is actively placed at, writing nothing', async () => {
    const { service, client } = setup('est-1');

    const attempt = service.createPlacement('student-1', PLACEMENT);
    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toThrow(SAME_ESTABLISHMENT_MESSAGE);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('gets past the check for a different establishment', async () => {
    const { service } = setup('est-2');

    // Fails later, on the course requirement this stub leaves out — not on
    // the same-establishment rule.
    await expect(
      service.createPlacement('student-1', PLACEMENT),
    ).rejects.toThrow(/no OJT requirement/);
  });

  it('gets past the check for a student with no active placement', async () => {
    const { service } = setup(null);

    await expect(
      service.createPlacement('student-1', PLACEMENT),
    ).rejects.toThrow(/no OJT requirement/);
  });
});
