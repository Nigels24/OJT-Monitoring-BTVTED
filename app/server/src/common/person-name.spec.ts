import {
  formatFullName,
  formatLastFirst,
  middleInitialOf,
} from './person-name';

describe('middleInitialOf', () => {
  it('takes the first letter, upper-cased, with a period', () => {
    expect(middleInitialOf('Santos')).toBe('S.');
    expect(middleInitialOf('santos')).toBe('S.');
    expect(middleInitialOf('  de la Paz ')).toBe('D.');
    expect(middleInitialOf('ñuñez')).toBe('Ñ.');
  });

  it('keeps an initial that was carried over from the old column', () => {
    expect(middleInitialOf('S')).toBe('S.');
    expect(middleInitialOf('S.')).toBe('S.');
  });

  it('is empty when there is no middle name', () => {
    for (const value of ['', '   ', null, undefined, '-']) {
      expect(middleInitialOf(value)).toBe('');
    }
  });
});

describe('formatLastFirst', () => {
  it('writes "Last, First M."', () => {
    expect(
      formatLastFirst({
        lastName: 'Dela Cruz',
        firstName: 'Juan',
        middleName: 'Santos',
      }),
    ).toBe('Dela Cruz, Juan S.');
  });

  it('leaves the initial out when there is no middle name', () => {
    expect(formatLastFirst({ lastName: 'Reyes', firstName: 'Ana Maria' })).toBe(
      'Reyes, Ana Maria',
    );
    expect(
      formatLastFirst({ lastName: 'Reyes', firstName: 'Ana', middleName: '' }),
    ).toBe('Reyes, Ana');
  });

  it('copes with a missing part and stray spaces', () => {
    expect(formatLastFirst({ lastName: ' Reyes ', firstName: null })).toBe(
      'Reyes',
    );
    expect(formatLastFirst({ firstName: 'Ana', middleName: 'Lim' })).toBe(
      'Ana L.',
    );
    expect(formatLastFirst({})).toBe('');
  });
});

describe('formatFullName', () => {
  it('writes "First M. Last"', () => {
    expect(
      formatFullName({
        firstName: 'Juan',
        middleName: 'Santos',
        lastName: 'Dela Cruz',
      }),
    ).toBe('Juan S. Dela Cruz');
    expect(formatFullName({ firstName: 'Ana', lastName: 'Reyes' })).toBe(
      'Ana Reyes',
    );
    expect(formatFullName({})).toBe('');
  });
});
