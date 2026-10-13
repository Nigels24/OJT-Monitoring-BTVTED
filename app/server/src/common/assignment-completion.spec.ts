import {
  CompletionInputs,
  completionChecklist,
  nextAssignmentStatus,
  syncAssignmentCompletion,
} from './assignment-completion';

const done: CompletionInputs = {
  approvedHours: 486,
  requiredHours: 486,
  portfolioStatus: 'APPROVED',
  evaluationCount: 1,
  coordinatorGrade: '92.50',
};

describe('completionChecklist', () => {
  it('is complete when all four conditions hold', () => {
    expect(completionChecklist(done)).toEqual({
      hoursMet: true,
      portfolioAccepted: true,
      evaluationRecorded: true,
      gradeRecorded: true,
      complete: true,
    });
  });

  describe('1. approved hours reach required hours', () => {
    it('is not met one hour short', () => {
      const result = completionChecklist({ ...done, approvedHours: 485 });
      expect(result.hoursMet).toBe(false);
      expect(result.complete).toBe(false);
    });

    it('is met exactly at, and above, the requirement', () => {
      expect(completionChecklist(done).hoursMet).toBe(true);
      expect(
        completionChecklist({ ...done, approvedHours: 500 }).hoursMet,
      ).toBe(true);
    });

    it('is never met against a zero requirement', () => {
      expect(
        completionChecklist({ ...done, approvedHours: 0, requiredHours: 0 })
          .complete,
      ).toBe(false);
    });
  });

  describe('2. the portfolio is accepted', () => {
    it.each([null, 'PENDING', 'REJECTED'])(
      'is not met when its status is %s',
      (portfolioStatus) => {
        const result = completionChecklist({ ...done, portfolioStatus });
        expect(result.portfolioAccepted).toBe(false);
        expect(result.complete).toBe(false);
      },
    );
  });

  describe('3. the supervisor’s evaluation is recorded', () => {
    it('is not met with no evaluation', () => {
      const result = completionChecklist({ ...done, evaluationCount: 0 });
      expect(result.evaluationRecorded).toBe(false);
      expect(result.complete).toBe(false);
    });

    it('is met with one or several', () => {
      expect(
        completionChecklist({ ...done, evaluationCount: 3 }).evaluationRecorded,
      ).toBe(true);
    });
  });

  describe('4. the coordinator’s grade is recorded', () => {
    it.each([null, undefined])('is not met when the grade is %s', (grade) => {
      const result = completionChecklist({ ...done, coordinatorGrade: grade });
      expect(result.gradeRecorded).toBe(false);
      expect(result.complete).toBe(false);
    });

    it('is met by any recorded grade, including zero', () => {
      expect(
        completionChecklist({ ...done, coordinatorGrade: 0 }).gradeRecorded,
      ).toBe(true);
    });
  });

  it('reports each condition independently when several are missing', () => {
    expect(
      completionChecklist({
        approvedHours: 100,
        requiredHours: 486,
        portfolioStatus: null,
        evaluationCount: 1,
        coordinatorGrade: null,
      }),
    ).toEqual({
      hoursMet: false,
      portfolioAccepted: false,
      evaluationRecorded: true,
      gradeRecorded: false,
      complete: false,
    });
  });
});

describe('nextAssignmentStatus', () => {
  const complete = completionChecklist(done);
  const incomplete = completionChecklist({ ...done, evaluationCount: 0 });

  it('completes an ACTIVE assignment only when the checklist is complete', () => {
    expect(nextAssignmentStatus('ACTIVE', complete)).toBe('COMPLETED');
    expect(nextAssignmentStatus('ACTIVE', incomplete)).toBeNull();
  });

  it.each(['CANCELLED', 'TRANSFERRED'])(
    'never changes a %s assignment, even with every condition met',
    (status) => {
      expect(nextAssignmentStatus(status, complete)).toBeNull();
    },
  );

  it('never reverses a COMPLETED assignment when a condition stops holding', () => {
    expect(nextAssignmentStatus('COMPLETED', incomplete)).toBeNull();
    expect(nextAssignmentStatus('COMPLETED', complete)).toBeNull();
  });
});

describe('syncAssignmentCompletion', () => {
  /** A client answering just the reads this needs, recording the write. */
  function client(options: {
    status: string;
    approvedMinutes?: number;
    portfolio?: string | null;
    evaluations?: number;
    grade?: string | null;
  }) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const hours = (options.approvedMinutes ?? 486 * 60) / 60;
    const start = new Date('2026-06-01T00:00:00.000Z');
    const fake = {
      trainingAssignment: {
        // computeProgress and this module both read the assignment.
        findUnique: jest.fn().mockResolvedValue({
          status: options.status,
          endDate: null,
          requiredHours: 486,
          dutyDays: ['MON'],
          startDate: start,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          coordinatorGrade: options.grade === undefined ? '90' : options.grade,
          _count: { evaluations: options.evaluations ?? 1 },
        }),
        updateMany,
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            status: 'APPROVED',
            timeInAM: start,
            timeOutAM: new Date(start.getTime() + hours * 3600_000),
            timeInPM: null,
            timeOutPM: null,
          },
        ]),
      },
      document: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options.portfolio === null
              ? null
              : { status: options.portfolio ?? 'APPROVED' },
          ),
      },
    };
    return { fake: fake as never, updateMany };
  }

  it('marks an ACTIVE assignment COMPLETED when all four conditions hold', async () => {
    const { fake, updateMany } = client({ status: 'ACTIVE' });
    await expect(syncAssignmentCompletion(fake, 'a1')).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const [{ where, data }] = updateMany.mock.calls[0] as [
      { where: object; data: { status: string; endDate: Date } },
    ];
    // Conditional on still being ACTIVE, so it cannot overwrite a status
    // someone set in the meantime.
    expect(where).toEqual({ id: 'a1', status: 'ACTIVE' });
    expect(data.status).toBe('COMPLETED');
    expect(data.endDate).toBeInstanceOf(Date);
  });

  it.each([
    ['hours are short', { approvedMinutes: 485 * 60 }],
    ['the portfolio is only pending', { portfolio: 'PENDING' }],
    ['there is no portfolio', { portfolio: null }],
    ['there is no evaluation', { evaluations: 0 }],
    ['there is no grade', { grade: null }],
  ])('writes nothing while %s', async (_label, missing) => {
    const { fake, updateMany } = client({ status: 'ACTIVE', ...missing });
    await expect(syncAssignmentCompletion(fake, 'a1')).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'TRANSFERRED', 'COMPLETED'])(
    'writes nothing to a %s assignment',
    async (status) => {
      const { fake, updateMany } = client({ status });
      await expect(syncAssignmentCompletion(fake, 'a1')).resolves.toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it('does nothing for a record with no assignment', async () => {
    const { fake, updateMany } = client({ status: 'ACTIVE' });
    await expect(syncAssignmentCompletion(fake, null)).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
