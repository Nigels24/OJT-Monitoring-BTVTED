import {
  AnnouncementTarget,
  AnnouncementViewer,
  announcementWhereFor,
  distinctIds,
  isAnnouncementVisibleTo,
} from './announcement-audience';

const student: AnnouncementViewer = {
  role: 'STUDENT',
  blockIds: ['block-a'],
  courseIds: ['chs'],
};
const supervisor: AnnouncementViewer = {
  role: 'SUPERVISOR',
  blockIds: ['block-a', 'block-b'],
  courseIds: ['chs'],
};
const target = (over: Partial<AnnouncementTarget>): AnnouncementTarget => ({
  audience: 'ALL',
  blockId: null,
  courseId: null,
  ...over,
});

describe('isAnnouncementVisibleTo', () => {
  it('reaches both roles when the audience is ALL', () => {
    expect(isAnnouncementVisibleTo(target({}), student)).toBe(true);
    expect(isAnnouncementVisibleTo(target({}), supervisor)).toBe(true);
  });

  it('reaches only students when the audience is STUDENTS', () => {
    const announcement = target({ audience: 'STUDENTS' });
    expect(isAnnouncementVisibleTo(announcement, student)).toBe(true);
    expect(isAnnouncementVisibleTo(announcement, supervisor)).toBe(false);
  });

  it('reaches only supervisors when the audience is SUPERVISORS', () => {
    const announcement = target({ audience: 'SUPERVISORS' });
    expect(isAnnouncementVisibleTo(announcement, student)).toBe(false);
    expect(isAnnouncementVisibleTo(announcement, supervisor)).toBe(true);
  });

  it('limits to a block when one is set', () => {
    expect(
      isAnnouncementVisibleTo(target({ blockId: 'block-a' }), student),
    ).toBe(true);
    expect(
      isAnnouncementVisibleTo(target({ blockId: 'block-b' }), student),
    ).toBe(false);
    // A supervisor matches through any trainee's block.
    expect(
      isAnnouncementVisibleTo(target({ blockId: 'block-b' }), supervisor),
    ).toBe(true);
  });

  it('limits to a program when one is set', () => {
    expect(isAnnouncementVisibleTo(target({ courseId: 'chs' }), student)).toBe(
      true,
    );
    expect(
      isAnnouncementVisibleTo(target({ courseId: 'other' }), student),
    ).toBe(false);
  });

  it('requires both when a block and a program are set', () => {
    expect(
      isAnnouncementVisibleTo(
        target({ blockId: 'block-a', courseId: 'chs' }),
        student,
      ),
    ).toBe(true);
    expect(
      isAnnouncementVisibleTo(
        target({ blockId: 'block-a', courseId: 'other' }),
        student,
      ),
    ).toBe(false);
  });

  it('never reaches a viewer with no block or program through a limited announcement', () => {
    const unplaced: AnnouncementViewer = {
      role: 'STUDENT',
      blockIds: [],
      courseIds: [],
    };
    expect(isAnnouncementVisibleTo(target({}), unplaced)).toBe(true);
    expect(
      isAnnouncementVisibleTo(target({ blockId: 'block-a' }), unplaced),
    ).toBe(false);
  });
});

describe('announcementWhereFor', () => {
  it('builds the same rule as a query filter', () => {
    expect(announcementWhereFor(student)).toEqual({
      audience: { in: ['STUDENTS', 'ALL'] },
      AND: [
        { OR: [{ blockId: null }, { blockId: { in: ['block-a'] } }] },
        { OR: [{ courseId: null }, { courseId: { in: ['chs'] } }] },
      ],
    });
    expect(announcementWhereFor(supervisor).audience).toEqual({
      in: ['SUPERVISORS', 'ALL'],
    });
  });
});

describe('distinctIds', () => {
  it('drops nulls and duplicates', () => {
    expect(distinctIds(['a', null, 'a', undefined, 'b'])).toEqual(['a', 'b']);
  });
});
