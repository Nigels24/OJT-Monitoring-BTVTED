import {
  StudentFilters,
  TRAINING_STATUSES,
  buildStudentWhere,
  trainingStatusOf,
} from './student-filters';

const conditions = (filters: StudentFilters, scope: string[] | null = null) =>
  (buildStudentWhere(filters, scope) as { AND?: unknown[] }).AND ?? [];

describe('buildStudentWhere', () => {
  it('is an empty where with no filters and no block scope', () => {
    expect(buildStudentWhere({}, null)).toEqual({});
  });

  it('narrows to the coordinator’s own blocks under "My Block"', () => {
    expect(conditions({}, ['b1', 'b2'])).toEqual([
      { blockId: { in: ['b1', 'b2'] } },
    ]);
  });

  it.each([
    ['program', { courseId: 'c1' }, { courseId: 'c1' }],
    ['year level', { yearLevel: 4 }, { courseYearLevel: 4 }],
    ['block', { blockId: 'b1' }, { blockId: 'b1' }],
    ['student status', { status: 'ACTIVE' }, { status: 'ACTIVE' }],
  ] as const)('filters by %s', (_label, filters, expected) => {
    expect(conditions(filters)).toEqual([expected]);
  });

  it('filters by one academic year, on the block or on a placement', () => {
    expect(conditions({ academicYear: '2025-2026' })).toEqual([
      {
        OR: [
          { block: { academicYear: { equals: '2025-2026' } } },
          {
            trainingAssignments: {
              some: { academicYear: { equals: '2025-2026' } },
            },
          },
        ],
      },
    ]);
  });

  it('filters by a range of academic years, inclusive at both ends', () => {
    const range = { gte: '2024-2025', lte: '2026-2027' };
    expect(
      conditions({
        academicYearFrom: '2024-2025',
        academicYearTo: '2026-2027',
      }),
    ).toEqual([
      {
        OR: [
          { block: { academicYear: range } },
          { trainingAssignments: { some: { academicYear: range } } },
        ],
      },
    ]);
  });

  it('accepts a range open at either end', () => {
    const from = conditions({ academicYearFrom: '2025-2026' })[0] as {
      OR: [{ block: { academicYear: object } }];
    };
    expect(from.OR[0].block.academicYear).toEqual({ gte: '2025-2026' });
    const to = conditions({ academicYearTo: '2025-2026' })[0] as {
      OR: [{ block: { academicYear: object } }];
    };
    expect(to.OR[0].block.academicYear).toEqual({ lte: '2025-2026' });
  });

  it('lets a single academic year take precedence over a range', () => {
    const [condition] = conditions({
      academicYear: '2025-2026',
      academicYearFrom: '2020-2021',
      academicYearTo: '2030-2031',
    }) as [{ OR: [{ block: { academicYear: object } }] }];
    expect(condition.OR[0].block.academicYear).toEqual({ equals: '2025-2026' });
  });

  it('orders academic years correctly as text', () => {
    // The range relies on this: "2024-2025" < "2025-2026" < "2026-2027".
    const years = ['2026-2027', '2024-2025', '2025-2026'];
    expect([...years].sort()).toEqual(['2024-2025', '2025-2026', '2026-2027']);
  });

  it('filters by establishment through any placement there', () => {
    expect(conditions({ establishmentId: 'e1' })).toEqual([
      { trainingAssignments: { some: { establishmentId: 'e1' } } },
    ]);
  });

  describe('training status', () => {
    it('Active: has a placement in progress', () => {
      expect(conditions({ trainingStatus: 'ACTIVE' })).toEqual([
        { trainingAssignments: { some: { status: 'ACTIVE' } } },
      ]);
    });

    it('Completed: none in progress and at least one completed', () => {
      expect(conditions({ trainingStatus: 'COMPLETED' })).toEqual([
        {
          AND: [
            { trainingAssignments: { none: { status: 'ACTIVE' } } },
            { trainingAssignments: { some: { status: 'COMPLETED' } } },
          ],
        },
      ]);
    });

    it('Ended/Cancelled: placed, but nothing in progress or completed', () => {
      expect(conditions({ trainingStatus: 'ENDED' })).toEqual([
        {
          AND: [
            { trainingAssignments: { none: { status: 'ACTIVE' } } },
            { trainingAssignments: { none: { status: 'COMPLETED' } } },
            { trainingAssignments: { some: {} } },
          ],
        },
      ]);
    });

    it('No placement: never placed', () => {
      expect(conditions({ trainingStatus: 'NONE' })).toEqual([
        { trainingAssignments: { none: {} } },
      ]);
    });
  });

  it('combines every filter with AND, losing none of them', () => {
    const all = conditions(
      {
        courseId: 'c1',
        yearLevel: 4,
        blockId: 'b1',
        academicYearFrom: '2024-2025',
        academicYearTo: '2025-2026',
        establishmentId: 'e1',
        trainingStatus: 'ACTIVE',
        status: 'ACTIVE',
      },
      ['b1', 'b2'],
    );
    expect(all).toHaveLength(8);
    // Three of them constrain trainingAssignments, two constrain blockId —
    // as keys of one object all but the last of each would be lost.
    const text = JSON.stringify(all);
    expect(text.match(/"trainingAssignments"/g)).toHaveLength(3);
    expect(text.match(/"blockId"/g)).toHaveLength(2);
    expect(all[0]).toEqual({ blockId: { in: ['b1', 'b2'] } });
    expect(all).toContainEqual({ blockId: 'b1' });
  });
});

describe('trainingStatusOf', () => {
  it.each([
    [['ACTIVE'], 'ACTIVE'],
    [['TRANSFERRED', 'ACTIVE'], 'ACTIVE'],
    [['COMPLETED', 'ACTIVE'], 'ACTIVE'],
    [['COMPLETED'], 'COMPLETED'],
    [['TRANSFERRED', 'COMPLETED'], 'COMPLETED'],
    [['CANCELLED'], 'ENDED'],
    [['TRANSFERRED', 'CANCELLED'], 'ENDED'],
    [[], 'NONE'],
  ] as const)('%j -> %s', (statuses, expected) => {
    expect(trainingStatusOf(statuses)).toBe(expected);
  });

  it('puts every student in exactly one of the four statuses', () => {
    const samples = [
      [],
      ['ACTIVE'],
      ['COMPLETED'],
      ['CANCELLED'],
      ['TRANSFERRED', 'ACTIVE'],
    ];
    for (const statuses of samples) {
      expect(TRAINING_STATUSES).toContain(trainingStatusOf(statuses));
    }
  });
});
