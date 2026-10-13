import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { IMPORT_COLUMNS } from './student-import.rules';
import { buildWorkbookBuffer, validRow } from './student-import.testing';
import {
  buildTemplate,
  cellToPlain,
  readStudentRows,
} from './student-import.workbook';

const loadBuffer = async (buffer: Buffer) => {
  const workbook = new Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
};

describe('cellToPlain', () => {
  it('passes text, numbers and dates through', () => {
    const date = new Date('2004-05-17T00:00:00.000Z');
    expect(cellToPlain('abc')).toBe('abc');
    expect(cellToPlain(4)).toBe(4);
    expect(cellToPlain(date)).toBe(date);
    expect(cellToPlain(null)).toBeNull();
  });

  it('reads an email Excel turned into a hyperlink', () => {
    expect(
      cellToPlain({
        text: 'juan@example.com',
        hyperlink: 'mailto:juan@example.com',
      }),
    ).toBe('juan@example.com');
  });

  it('joins rich-text runs', () => {
    expect(
      cellToPlain({ richText: [{ text: 'Dela ' }, { text: 'Cruz' }] }),
    ).toBe('Dela Cruz');
  });

  it('uses a formula’s result, and nothing for an error value', () => {
    expect(cellToPlain({ formula: 'A1', result: 'BTVTED-CHS' })).toBe(
      'BTVTED-CHS',
    );
    expect(cellToPlain({ error: '#N/A' })).toBeNull();
  });
});

describe('readStudentRows', () => {
  it('reads data rows with their Excel row numbers', async () => {
    const buffer = await buildWorkbookBuffer([validRow(1), validRow(2)]);
    const rows = await readStudentRows(buffer);

    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(rows[0].cells.studentNumber).toBe('2022-00001');
    expect(rows[0].cells.email).toBe('student1@example.com');
    expect(rows[0].cells.yearLevel).toBe(4);
    expect(rows[0].cells.birthdate).toEqual(
      new Date('2004-05-17T00:00:00.000Z'),
    );
  });

  it('reads by header name when the columns are reordered and renamed in case', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('students');
    sheet.addRow([
      'EMAIL',
      'Notes',
      'year level',
      'COURSE',
      'student no',
      'Last name',
      'first name',
      'Middle Name',
      'SEX',
      'birthdate',
      'contact no.',
    ]);
    sheet.addRow([
      'ana@example.com',
      'ignore me',
      3,
      'BTVTED-CHS',
      '2022-00009',
      'Reyes',
      'Ana',
      '',
      'F',
      '2003-01-02',
      '',
    ]);
    const rows = await readStudentRows(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toMatchObject({
      email: 'ana@example.com',
      yearLevel: 3,
      course: 'BTVTED-CHS',
      studentNumber: '2022-00009',
      lastName: 'Reyes',
      firstName: 'Ana',
      sex: 'F',
      birthdate: '2003-01-02',
    });
  });

  it('skips blank rows and the example row', async () => {
    const buffer = await buildWorkbookBuffer([
      validRow(1, { studentNumber: 'EXAMPLE' }),
      {},
      validRow(2),
      {},
    ]);
    const rows = await readStudentRows(buffer);
    expect(rows.map((row) => row.rowNumber)).toEqual([4]);
  });

  it.each([
    ['no file', undefined, 'Choose an Excel (.xlsx) file'],
    ['an empty file', Buffer.alloc(0), 'Choose an Excel (.xlsx) file'],
    [
      'a CSV',
      Buffer.from('Student No.,Last Name\n1,Cruz\n'),
      'not an Excel workbook',
    ],
    [
      'an old .xls',
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      'not an Excel workbook',
    ],
    [
      'a zip that is not a workbook',
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]),
      'could not be read as an Excel workbook',
    ],
  ])('refuses %s with a 400', async (_label, buffer, message) => {
    await expect(readStudentRows(buffer)).rejects.toThrow(BadRequestException);
    await expect(readStudentRows(buffer)).rejects.toThrow(message);
  });

  it('refuses a file over 2MB before trying to read it', async () => {
    const big = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(2 * 1024 * 1024),
    ]);
    await expect(readStudentRows(big)).rejects.toThrow('larger than 2MB');
  });

  it('refuses a workbook with no Students sheet', async () => {
    const buffer = await buildWorkbookBuffer([validRow(1)], {
      sheetName: 'Sheet1',
    });
    await expect(readStudentRows(buffer)).rejects.toThrow(
      'no sheet named "Students"',
    );
  });

  it('refuses a sheet missing template columns, naming them', async () => {
    const buffer = await buildWorkbookBuffer([], {
      headers: ['Student No.', 'Last Name', 'First Name', 'Email'],
    });
    await expect(readStudentRows(buffer)).rejects.toThrow(
      'missing these columns: Middle Name, Sex, Birthdate, Contact No., Course, Year Level',
    );
  });

  it('accepts exactly 500 rows and refuses 501', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => validRow(index + 1));
    await expect(
      readStudentRows(await buildWorkbookBuffer(rows.slice(0, 500))),
    ).resolves.toHaveLength(500);
    await expect(
      readStudentRows(await buildWorkbookBuffer(rows)),
    ).rejects.toThrow('more than 500 student rows');
  });
});

describe('buildTemplate', () => {
  const options = {
    courseCodes: ['BTVTED-CHS', 'BTVTED-FSM'],
    yearLevels: [3, 4],
  };

  it('has the exact header row, frozen, on a sheet named Students', async () => {
    const workbook = await loadBuffer(await buildTemplate(options));
    const sheet = workbook.getWorksheet('Students')!;

    const headers: unknown[] = [];
    sheet.getRow(1).eachCell((cell) => headers.push(cell.value));
    expect(headers).toEqual([
      'Student No.',
      'Last Name',
      'First Name',
      'Middle Name',
      'Sex',
      'Birthdate',
      'Email',
      'Contact No.',
      'Course',
      'Year Level',
    ]);
    expect(headers).toEqual(IMPORT_COLUMNS.map((column) => column.header));
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('has dropdowns for Sex, Course and Year Level, fed from the database lists', async () => {
    const workbook = await loadBuffer(await buildTemplate(options));
    const sheet = workbook.getWorksheet('Students')!;

    // Checked on an ordinary data row and on the last one the template covers.
    for (const row of [2, 250, 501]) {
      expect(sheet.getCell(`E${row}`).dataValidation).toMatchObject({
        type: 'list',
        formulae: ['Lists!$A$1:$A$2'],
      });
      expect(sheet.getCell(`I${row}`).dataValidation).toMatchObject({
        type: 'list',
        formulae: ['Lists!$B$1:$B$2'],
      });
      expect(sheet.getCell(`J${row}`).dataValidation).toMatchObject({
        type: 'list',
        formulae: ['Lists!$C$1:$C$2'],
      });
    }

    const lists = workbook.getWorksheet('Lists')!;
    expect(lists.state).toBe('hidden');
    expect([lists.getCell('A1').value, lists.getCell('A2').value]).toEqual([
      'Male',
      'Female',
    ]);
    expect([lists.getCell('B1').value, lists.getCell('B2').value]).toEqual([
      'BTVTED-CHS',
      'BTVTED-FSM',
    ]);
    expect([lists.getCell('C1').value, lists.getCell('C2').value]).toEqual([
      3, 4,
    ]);
  });

  it('formats Birthdate as a date and keeps Student No. and Contact No. as text', async () => {
    const workbook = await loadBuffer(await buildTemplate(options));
    const sheet = workbook.getWorksheet('Students')!;
    expect(sheet.getCell('F2').numFmt).toBe('yyyy-mm-dd');
    expect(sheet.getCell('A2').numFmt).toBe('@');
    expect(sheet.getCell('H2').numFmt).toBe('@');
  });

  it('has an Instructions sheet covering every column and the establishment note', async () => {
    const workbook = await loadBuffer(await buildTemplate(options));
    const help = workbook.getWorksheet('Instructions')!;
    const text: string[] = [];
    help.eachRow((row) => row.eachCell((cell) => text.push(cell.text)));
    const all = text.join('\n');

    for (const column of IMPORT_COLUMNS) expect(all).toContain(column.header);
    expect(all).toContain('yyyy-mm-dd');
    expect(all).toContain('Establishments are NOT set here');
    expect(all).toContain('EXAMPLE');
  });

  it('carries an example row that the parser ignores', async () => {
    const template = await buildTemplate(options);
    const sheet = (await loadBuffer(template)).getWorksheet('Students')!;
    expect(sheet.getCell('A2').value).toBe('EXAMPLE');
    expect(sheet.getCell('A2').font).toMatchObject({ italic: true });

    // Uploading the untouched template is an empty import, not an error row.
    await expect(readStudentRows(template)).resolves.toEqual([]);
  });

  it('falls back to year levels 1-4 when no requirement exists yet', async () => {
    const workbook = await loadBuffer(
      await buildTemplate({ courseCodes: [], yearLevels: [] }),
    );
    const lists = workbook.getWorksheet('Lists')!;
    expect(
      ['C1', 'C2', 'C3', 'C4'].map((address) => lists.getCell(address).value),
    ).toEqual([1, 2, 3, 4]);
  });
});
