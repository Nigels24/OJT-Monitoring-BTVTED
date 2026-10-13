import {
  IMPORT_COLUMNS,
  ImportColumnKey,
  ImportContext,
  RawImportRow,
  countRows,
  matchHeaders,
  normaliseContactNumber,
  normaliseEmail,
  normaliseHeader,
  normaliseSex,
  parseBirthdate,
  parseYearLevel,
  titleCaseName,
  toText,
  validateRows,
} from './student-import.rules';

const TODAY = new Date('2026-10-13T00:00:00.000Z');

const context = (over: Partial<ImportContext> = {}): ImportContext => ({
  courses: [
    {
      id: 'course-chs',
      code: 'BTVTED-CHS',
      name: 'Computer Hardware Servicing',
      yearLevels: [3, 4],
    },
    {
      id: 'course-new',
      code: 'BTVTED-FSM',
      name: 'Food Service',
      yearLevels: [],
    },
  ],
  existingStudentNumbers: new Set(),
  existingEmails: new Set(),
  block: null,
  today: TODAY,
  ...over,
});

/** A row that passes every check; override cells to break one at a time. */
const row = (
  rowNumber: number,
  over: Partial<Record<ImportColumnKey, unknown>> = {},
): RawImportRow => ({
  rowNumber,
  cells: {
    studentNumber: `2022-${String(rowNumber).padStart(5, '0')}`,
    lastName: 'dela cruz',
    firstName: 'JUAN',
    middleName: 'santos',
    sex: 'm',
    birthdate: new Date('2004-05-17T00:00:00.000Z'),
    email: `Student${rowNumber}@Example.com`,
    contactNumber: '09123456789',
    course: 'btvted-chs',
    yearLevel: 4,
    ...over,
  },
});

const reasonsFor = (
  over: Partial<Record<ImportColumnKey, unknown>>,
  ctx: Partial<ImportContext> = {},
) => validateRows([row(2, over)], context(ctx))[0].reasons;

describe('header matching', () => {
  it('reduces a header to lower-case letters and digits', () => {
    for (const header of [
      'Student No.',
      ' student no ',
      'STUDENT_NO',
      'StudentNo',
      'Student  No.',
    ]) {
      expect(normaliseHeader(header)).toBe('studentno');
    }
  });

  it('finds every column whatever the case, spacing or punctuation', () => {
    const { indexByKey, missing } = matchHeaders([
      'STUDENT NO',
      'last name',
      ' First  Name ',
      'Middle_Name',
      'sex',
      'BIRTHDATE',
      'E-mail',
      'Contact No',
      'Course',
      'Year level',
    ]);
    expect(missing).toEqual([]);
    expect(indexByKey.studentNumber).toBe(0);
    expect(indexByKey.email).toBe(6);
    expect(indexByKey.yearLevel).toBe(9);
  });

  it('matches by name, not position, and ignores extra columns', () => {
    const headers = [
      'Remarks',
      ...IMPORT_COLUMNS.map((column) => column.header).reverse(),
      'Adviser',
    ];
    const { indexByKey, missing } = matchHeaders(headers);
    expect(missing).toEqual([]);
    expect(indexByKey.yearLevel).toBe(1);
    expect(indexByKey.studentNumber).toBe(10);
  });

  it('reports every template column that is missing', () => {
    const { missing } = matchHeaders(['Student No.', 'Last Name', 'Email']);
    expect(missing).toEqual([
      'First Name',
      'Middle Name',
      'Sex',
      'Birthdate',
      'Contact No.',
      'Course',
      'Year Level',
    ]);
  });

  it('uses the first of a repeated header', () => {
    const headers = IMPORT_COLUMNS.map((column) => column.header);
    expect(matchHeaders([...headers, 'Email']).indexByKey.email).toBe(6);
  });
});

describe('normalisers', () => {
  it('toText trims and collapses spaces', () => {
    expect(toText('  Juan   Dela  Cruz ')).toBe('Juan Dela Cruz');
    expect(toText(2022)).toBe('2022');
    expect(toText(null)).toBe('');
    expect(toText(undefined)).toBe('');
  });

  it('titleCaseName capitalises each part of a name', () => {
    expect(titleCaseName('dela cruz')).toBe('Dela Cruz');
    expect(titleCaseName('  JUAN   CARLOS ')).toBe('Juan Carlos');
    expect(titleCaseName("o'brien-santos")).toBe("O'Brien-Santos");
    expect(titleCaseName('muÑoz')).toBe('Muñoz');
    expect(titleCaseName('')).toBe('');
  });

  it('normaliseEmail trims and lower-cases', () => {
    expect(normaliseEmail('  Juan.Mundo@Example.COM ')).toBe(
      'juan.mundo@example.com',
    );
  });

  it('normaliseSex accepts M, F, Male and Female in any case', () => {
    for (const value of ['M', 'm', 'Male', 'MALE', ' male ']) {
      expect(normaliseSex(value)).toBe('Male');
    }
    for (const value of ['F', 'f', 'Female', 'FEMALE']) {
      expect(normaliseSex(value)).toBe('Female');
    }
    for (const value of ['', 'X', 'boy', 'ma', null]) {
      expect(normaliseSex(value)).toBeNull();
    }
  });

  describe('parseBirthdate', () => {
    const iso = (value: unknown) => parseBirthdate(value)?.toISOString();

    it('accepts a real Excel date', () => {
      expect(iso(new Date('2004-05-17T00:00:00.000Z'))).toBe(
        '2004-05-17T00:00:00.000Z',
      );
    });

    it('accepts yyyy-mm-dd and mm/dd/yyyy text', () => {
      expect(iso('2004-05-17')).toBe('2004-05-17T00:00:00.000Z');
      expect(iso('2004-5-7')).toBe('2004-05-07T00:00:00.000Z');
      expect(iso('05/17/2004')).toBe('2004-05-17T00:00:00.000Z');
      expect(iso(' 5/7/2004 ')).toBe('2004-05-07T00:00:00.000Z');
    });

    it('rejects impossible dates instead of rolling them over', () => {
      for (const value of [
        '2004-02-30',
        '2005-02-29',
        '2004-13-01',
        '2004-00-10',
        '13/01/2004',
        '04/31/2004',
      ]) {
        expect(parseBirthdate(value)).toBeNull();
      }
      expect(iso('2004-02-29')).toBe('2004-02-29T00:00:00.000Z');
    });

    it('rejects anything that is not a date', () => {
      for (const value of ['', 'May 17, 2004', '17/05/04', 38124, null]) {
        expect(parseBirthdate(value)).toBeNull();
      }
      expect(parseBirthdate(new Date('nope'))).toBeNull();
    });
  });

  it('parseYearLevel accepts whole numbers only', () => {
    expect(parseYearLevel(4)).toBe(4);
    expect(parseYearLevel('4')).toBe(4);
    expect(parseYearLevel(' 3 ')).toBe(3);
    expect(parseYearLevel('4.0')).toBe(4);
    for (const value of ['', '4th', 'four', 3.5, '-1', null]) {
      expect(parseYearLevel(value)).toBeNull();
    }
  });

  it('normaliseContactNumber tidies to the 11-digit form', () => {
    expect(normaliseContactNumber('0912 345 6789')).toBe('09123456789');
    expect(normaliseContactNumber('0912-345-6789')).toBe('09123456789');
    expect(normaliseContactNumber('+63 912 345 6789')).toBe('09123456789');
    // Excel drops a leading zero from a number.
    expect(normaliseContactNumber(9123456789)).toBe('09123456789');
    expect(normaliseContactNumber('')).toBe('');
    expect(normaliseContactNumber('12345')).toBe('12345');
  });
});

describe('validateRows — a valid row', () => {
  it('passes, with every value normalised', () => {
    const [result] = validateRows([row(2)], context());
    expect(result).toEqual({
      rowNumber: 2,
      status: 'VALID',
      reasons: [],
      values: {
        studentNumber: '2022-00002',
        lastName: 'Dela Cruz',
        firstName: 'Juan',
        middleName: 'Santos',
        sex: 'Male',
        birthdate: '2004-05-17',
        age: 22,
        email: 'student2@example.com',
        contactNumber: '09123456789',
        course: 'BTVTED-CHS',
        courseId: 'course-chs',
        yearLevel: 4,
      },
    });
  });

  it('allows Middle Name and Contact No. to be blank', () => {
    const [result] = validateRows(
      [row(2, { middleName: '', contactNumber: null })],
      context(),
    );
    expect(result.status).toBe('VALID');
    expect(result.values.middleName).toBe('');
    expect(result.values.contactNumber).toBe('');
  });

  it('matches a course by its full name too, case-insensitively', () => {
    const [result] = validateRows(
      [row(2, { course: 'computer hardware SERVICING' })],
      context(),
    );
    expect(result.status).toBe('VALID');
    expect(result.values.courseId).toBe('course-chs');
    expect(result.values.course).toBe('BTVTED-CHS');
  });

  it('keeps the full middle name, title-cased — not just an initial', () => {
    const [result] = validateRows(
      [row(2, { middleName: '  de la  PAZ ' })],
      context(),
    );
    expect(result.values.middleName).toBe('De La Paz');
    expect(Object.keys(result.values)).not.toContain('middleInitial');
  });

  it('computes age from the birthdate — there is no age cell to read', () => {
    const [result] = validateRows(
      [row(2, { birthdate: '2000-10-14' })],
      context(),
    );
    expect(result.values.age).toBe(25);
  });
});

describe('validateRows — every row error', () => {
  it.each([
    ['studentNumber', 'Student No. is required'],
    ['lastName', 'Last Name is required'],
    ['firstName', 'First Name is required'],
    ['sex', 'Sex is required'],
    ['birthdate', 'Birthdate is required'],
    ['email', 'Email is required'],
    ['course', 'Course is required'],
    ['yearLevel', 'Year Level is required'],
  ] as const)('missing required value: %s', (key, reason) => {
    expect(reasonsFor({ [key]: '' })).toEqual([reason]);
    expect(reasonsFor({ [key]: null })).toEqual([reason]);
    expect(reasonsFor({ [key]: '   ' })).toEqual([reason]);
  });

  it('invalid email', () => {
    for (const email of ['juan', 'juan@', 'juan@example', 'a b@example.com']) {
      expect(reasonsFor({ email })).toEqual([
        'Email is not a valid email address',
      ]);
    }
  });

  it('invalid date', () => {
    for (const birthdate of ['2004-02-30', 'May 17, 2004', 38124]) {
      expect(reasonsFor({ birthdate })).toEqual([
        'Birthdate is not a valid date (use yyyy-mm-dd or mm/dd/yyyy)',
      ]);
    }
  });

  it('age under 15 or over 70', () => {
    expect(reasonsFor({ birthdate: '2011-10-14' })).toEqual([
      'Birthdate makes the student 14, under the minimum age of 15',
    ]);
    expect(reasonsFor({ birthdate: '1955-10-13' })).toEqual([
      'Birthdate makes the student 71, over the maximum age of 70',
    ]);
    // The boundaries themselves are allowed.
    expect(reasonsFor({ birthdate: '2011-10-13' })).toEqual([]);
    expect(reasonsFor({ birthdate: '1955-10-14' })).toEqual([]);
  });

  it('invalid sex', () => {
    expect(reasonsFor({ sex: 'X' })).toEqual([
      'Sex must be Male or Female (M or F)',
    ]);
  });

  it('unknown course', () => {
    expect(reasonsFor({ course: 'BSIT' })).toEqual([
      'Unknown course "BSIT" (use an active course\'s abbreviation or full name)',
    ]);
  });

  it('an inactive course is unknown — only active courses are in the context', () => {
    expect(reasonsFor({ course: 'BTVTED-CHS' }, { courses: [] })[0]).toContain(
      'Unknown course "BTVTED-CHS"',
    );
  });

  it('invalid year level', () => {
    expect(reasonsFor({ yearLevel: '4th' })).toEqual([
      'Year Level must be a whole number',
    ]);
    expect(reasonsFor({ yearLevel: 1 })).toEqual([
      'Year Level 1 is not valid for BTVTED-CHS (it has an OJT requirement for year 3, 4)',
    ]);
    expect(reasonsFor({ course: 'BTVTED-FSM', yearLevel: 4 })).toEqual([
      'Year Level 4 is not valid for BTVTED-FSM (it has no OJT requirement defined yet)',
    ]);
  });

  it('invalid contact number', () => {
    expect(reasonsFor({ contactNumber: '12345' })).toEqual([
      'Contact No. must be exactly 11 digits (e.g. 09123456789)',
    ]);
  });

  it('Student No. already in the system', () => {
    expect(
      reasonsFor({}, { existingStudentNumbers: new Set(['2022-00002']) }),
    ).toEqual(['Student No. is already in the system']);
  });

  it('Email already used by any user, whatever the case typed', () => {
    expect(
      reasonsFor(
        { email: 'TAKEN@Example.com' },
        { existingEmails: new Set(['taken@example.com']) },
      ),
    ).toEqual(['Email is already used by another account']);
  });

  it('a block chosen for the import that does not fit the row', () => {
    const block = {
      id: 'block-a',
      name: 'Block A',
      courseId: 'course-chs',
      yearLevel: 4,
    };
    expect(reasonsFor({}, { block })).toEqual([]);
    expect(reasonsFor({ yearLevel: 3 }, { block })).toEqual([
      'The selected block "Block A" is for a different course or year level',
    ]);
  });

  it('collects ALL of a row’s reasons, not just the first', () => {
    const reasons = reasonsFor(
      {
        lastName: '',
        sex: 'X',
        birthdate: '2004-02-30',
        email: 'not-an-email',
        contactNumber: '123',
        course: 'BSIT',
        yearLevel: 'four',
      },
      { existingStudentNumbers: new Set(['2022-00002']) },
    );
    expect(reasons).toEqual([
      'Last Name is required',
      'Student No. is already in the system',
      'Sex must be Male or Female (M or F)',
      'Birthdate is not a valid date (use yyyy-mm-dd or mm/dd/yyyy)',
      'Email is not a valid email address',
      'Contact No. must be exactly 11 digits (e.g. 09123456789)',
      'Unknown course "BSIT" (use an active course\'s abbreviation or full name)',
      'Year Level must be a whole number',
    ]);
  });
});

describe('validateRows — duplicates within the file', () => {
  it('flags a repeated Student No. on every row that carries it', () => {
    const results = validateRows(
      [
        row(2, { studentNumber: '2022-00100' }),
        row(3),
        row(4, { studentNumber: ' 2022-00100 ' }),
        row(5, { studentNumber: '2022-00100' }),
      ],
      context(),
    );
    expect(results.map((r) => r.status)).toEqual([
      'ERROR',
      'VALID',
      'ERROR',
      'ERROR',
    ]);
    expect(results[0].reasons).toEqual([
      'Duplicate Student No. in this file (also on row 4, 5)',
    ]);
    expect(results[2].reasons).toEqual([
      'Duplicate Student No. in this file (also on row 2, 5)',
    ]);
  });

  it('flags a repeated Email, comparing case-insensitively', () => {
    const results = validateRows(
      [
        row(2, { email: 'same@example.com' }),
        row(3, { email: 'SAME@Example.com ' }),
        row(4),
      ],
      context(),
    );
    expect(results[0].reasons).toEqual([
      'Duplicate Email in this file (also on row 3)',
    ]);
    expect(results[1].reasons).toEqual([
      'Duplicate Email in this file (also on row 2)',
    ]);
    expect(results[2].status).toBe('VALID');
  });

  it('reports a file duplicate and an in-system clash together', () => {
    const results = validateRows(
      [
        row(2, { studentNumber: 'A-1', email: 'a@example.com' }),
        row(3, { studentNumber: 'A-1', email: 'a@example.com' }),
      ],
      context({
        existingStudentNumbers: new Set(['A-1']),
        existingEmails: new Set(['a@example.com']),
      }),
    );
    expect(results[0].reasons).toEqual([
      'Duplicate Student No. in this file (also on row 3)',
      'Student No. is already in the system',
      'Duplicate Email in this file (also on row 3)',
      'Email is already used by another account',
    ]);
  });

  it('does not treat blank values as duplicates of each other', () => {
    const results = validateRows(
      [row(2, { email: '' }), row(3, { email: '' })],
      context(),
    );
    expect(results[0].reasons).toEqual(['Email is required']);
    expect(results[1].reasons).toEqual(['Email is required']);
  });
});

describe('validateRows — rows that are skipped', () => {
  const blank = (rowNumber: number): RawImportRow => ({
    rowNumber,
    cells: { studentNumber: '', lastName: null, email: '   ' },
  });

  it('skips fully empty rows silently, keeping Excel row numbers', () => {
    const results = validateRows(
      [row(2), blank(3), blank(4), row(5)],
      context(),
    );
    expect(results.map((r) => r.rowNumber)).toEqual([2, 5]);
    expect(countRows(results)).toEqual({ total: 2, valid: 2, errors: 0 });
  });

  it('skips the template’s example row', () => {
    const results = validateRows(
      [
        row(2, { studentNumber: 'EXAMPLE' }),
        row(3, { studentNumber: 'example' }),
        row(4),
      ],
      context(),
    );
    expect(results.map((r) => r.rowNumber)).toEqual([4]);
  });

  it('does not count a skipped row as a duplicate of a real one', () => {
    const results = validateRows(
      [
        row(2, { studentNumber: 'EXAMPLE', email: 'same@example.com' }),
        row(3, { email: 'same@example.com' }),
      ],
      context(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('VALID');
  });

  it('counts valid and error rows', () => {
    expect(
      countRows(validateRows([row(2), row(3, { email: 'x' })], context())),
    ).toEqual({ total: 2, valid: 1, errors: 1 });
  });
});
