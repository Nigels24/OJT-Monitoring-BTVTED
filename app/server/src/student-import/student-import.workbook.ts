import { BadRequestException } from '@nestjs/common';
import { CellValue, Workbook, Worksheet } from 'exceljs';
import {
  EXAMPLE_MARKER,
  IMPORT_COLUMNS,
  IMPORT_SHEET_NAME,
  ImportColumnKey,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MAX_STUDENT_AGE,
  MIN_STUDENT_AGE,
  RawImportRow,
  isEmptyRow,
  isExampleRow,
  matchHeaders,
  normaliseHeader,
} from './student-import.rules';

/**
 * The spreadsheet half of the student import: reading an uploaded `.xlsx` into
 * the plain cells `student-import.rules.ts` checks, and building the template
 * the coordinator downloads. This is the only file that knows about exceljs.
 */

/** Every `.xlsx` is a zip archive, and every zip starts with these bytes. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** How many rows of the template carry the dropdowns and formats. */
const TEMPLATE_ROWS = MAX_IMPORT_ROWS + 1;

const COLUMN_WIDTHS: Record<ImportColumnKey, number> = {
  studentNumber: 16,
  lastName: 22,
  firstName: 22,
  middleName: 20,
  sex: 10,
  birthdate: 14,
  email: 32,
  contactNumber: 16,
  course: 16,
  yearLevel: 12,
};

/**
 * A cell's value as something plain: text, a number, a `Date`, or `null`.
 *
 * Excel stores more than it shows. An email address typed into a cell is
 * usually turned into a hyperlink object, pasted text arrives as rich-text
 * runs, and a formula carries its last result — each of those would otherwise
 * read as `[object Object]` or as nothing at all.
 */
export function cellToPlain(value: CellValue): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText.map((run) => run.text).join('');
    }
    if ('hyperlink' in value) {
      return typeof value.text === 'string'
        ? value.text
        : cellToPlain(value.text);
    }
    if ('result' in value) return cellToPlain(value.result);
    // A formula with no cached result, or an error value such as #N/A.
    return null;
  }
  return null;
}

/**
 * Reads the "Students" sheet of an uploaded workbook into raw rows.
 *
 * Every refusal here is about the *file* and is a 400: wrong type, too big,
 * no Students sheet, a template column missing, too many rows. Problems with
 * individual rows are not raised here — those are per-row reasons, found by
 * `validateRows`.
 */
export async function readStudentRows(
  buffer: Buffer | undefined,
): Promise<RawImportRow[]> {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Choose an Excel (.xlsx) file to upload.');
  }
  if (buffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new BadRequestException(
      `The file is larger than ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB. Remove any extra sheets or formatting and try again.`,
    );
  }
  // Decided from the content, like every other upload (CLAUDE.md §7) — the
  // filename and Content-Type are whatever the browser claimed.
  if (!ZIP_MAGIC.every((byte, index) => buffer[index] === byte)) {
    throw new BadRequestException(
      'That file is not an Excel workbook. Upload the .xlsx template (not .xls or .csv).',
    );
  }

  const workbook = new Workbook();
  try {
    // exceljs's own Buffer type predates Node's generic one; the bytes are
    // what matter.
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new BadRequestException(
      'That file could not be read as an Excel workbook. Download the template again and re-enter the rows.',
    );
  }

  const sheet = workbook.worksheets.find(
    (candidate) =>
      normaliseHeader(candidate.name) === normaliseHeader(IMPORT_SHEET_NAME),
  );
  if (!sheet) {
    throw new BadRequestException(
      `The workbook has no sheet named "${IMPORT_SHEET_NAME}". Use the downloaded template.`,
    );
  }

  const headerCells = rowCells(sheet, 1);
  const { indexByKey, missing } = matchHeaders(headerCells);
  if (missing.length > 0) {
    throw new BadRequestException(
      `The "${IMPORT_SHEET_NAME}" sheet is missing ${missing.length === 1 ? 'the column' : 'these columns'}: ${missing.join(', ')}. The first row must be the template's header row.`,
    );
  }

  const rows: RawImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const cells = rowCells(sheet, rowNumber);
    const row: RawImportRow = { rowNumber, cells: {} };
    for (const column of IMPORT_COLUMNS) {
      row.cells[column.key] = cells[indexByKey[column.key]!] ?? null;
    }
    // Blank rows and the example are dropped here too, so they do not count
    // towards the limit below.
    if (isEmptyRow(row) || isExampleRow(row)) continue;
    rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `The file has more than ${MAX_IMPORT_ROWS} student rows. Split it into smaller files.`,
      );
    }
  }
  return rows;
}

/** One row's cells as plain values, zero-indexed by column. */
function rowCells(sheet: Worksheet, rowNumber: number): unknown[] {
  const cells: unknown[] = [];
  sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell, column) => {
    cells[column - 1] = cellToPlain(cell.value);
  });
  return cells;
}

export interface TemplateOptions {
  /** Active course abbreviations, for the Course dropdown. */
  courseCodes: readonly string[];
  /** The year levels that have an OJT requirement, for the Year Level dropdown. */
  yearLevels: readonly number[];
}

/**
 * Builds the template: a "Students" sheet with the header row, an example row
 * the parser ignores, dropdowns and formats down to row `TEMPLATE_ROWS`; an
 * "Instructions" sheet; and a hidden "Lists" sheet the dropdowns read from.
 *
 * The dropdowns point at ranges on "Lists" rather than carrying their options
 * inline: an inline list is capped at 255 characters, which a school's course
 * list can pass.
 */
export async function buildTemplate(options: TemplateOptions): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'OJT-Track';

  const sheet = workbook.addWorksheet(IMPORT_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: COLUMN_WIDTHS[column.key],
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
    cell.border = { bottom: { style: 'thin' } };
  });

  const yearLevels =
    options.yearLevels.length > 0 ? options.yearLevels : [1, 2, 3, 4];

  // The example row. "EXAMPLE" in Student No. is what marks it: the parser
  // skips any row carrying it, so it is safe to leave in.
  const example = sheet.addRow({
    studentNumber: EXAMPLE_MARKER,
    lastName: 'Dela Cruz',
    firstName: 'Juan',
    middleName: 'Santos',
    sex: 'Male',
    birthdate: new Date(Date.UTC(2004, 4, 17)),
    email: 'juan.delacruz@example.com',
    contactNumber: '09123456789',
    course: options.courseCodes[0] ?? '',
    yearLevel: yearLevels[yearLevels.length - 1],
  });
  example.font = { italic: true, color: { argb: 'FF9CA3AF' } };

  /* ---- lists the dropdowns read from ---- */
  const lists = workbook.addWorksheet('Lists', { state: 'hidden' });
  lists.getColumn(1).values = ['Male', 'Female'];
  lists.getColumn(2).values = [...options.courseCodes];
  lists.getColumn(3).values = [...yearLevels];
  const listRange = (column: string, count: number) =>
    `Lists!$${column}$1:$${column}$${Math.max(count, 1)}`;

  const columnLetter = (key: ImportColumnKey) => sheet.getColumn(key).letter;
  const down = (key: ImportColumnKey) =>
    `${columnLetter(key)}2:${columnLetter(key)}${TEMPLATE_ROWS}`;
  // `dataValidations` is exceljs's range-wide API; it is not in its typings.
  const validations = (
    sheet as unknown as {
      dataValidations: { add: (range: string, rule: object) => void };
    }
  ).dataValidations;

  const dropdown = (
    key: ImportColumnKey,
    range: string,
    label: string,
    allowBlank = false,
  ) => {
    validations.add(down(key), {
      type: 'list',
      allowBlank,
      formulae: [range],
      showErrorMessage: true,
      errorStyle: 'error',
      errorTitle: label,
      error: `Pick a ${label.toLowerCase()} from the list.`,
    });
  };
  dropdown('sex', listRange('A', 2), 'Sex');
  if (options.courseCodes.length > 0) {
    dropdown('course', listRange('B', options.courseCodes.length), 'Course');
  }
  dropdown('yearLevel', listRange('C', yearLevels.length), 'Year Level');

  // Text, so "2022-00145" is not read as a subtraction and "09123456789"
  // keeps its leading zero.
  for (const key of ['studentNumber', 'contactNumber'] as const) {
    sheet.getColumn(key).numFmt = '@';
  }
  sheet.getColumn('birthdate').numFmt = 'yyyy-mm-dd';

  /* ---- instructions ---- */
  const help = workbook.addWorksheet('Instructions');
  help.columns = [{ width: 18 }, { width: 12 }, { width: 90 }];
  const lines: [string, string, string][] = [
    ['Column', 'Required', 'What to enter'],
    [
      'Student No.',
      'Yes',
      'The student number, e.g. 2022-00145. Must not already be in the system or repeated in this file.',
    ],
    [
      'Last Name',
      'Yes',
      'Family name. Capitalisation is tidied automatically.',
    ],
    ['First Name', 'Yes', 'Given name(s).'],
    ['Middle Name', 'No', 'Full middle name, if any.'],
    [
      'Sex',
      'Yes',
      'Male or Female (M or F is also accepted). Use the dropdown.',
    ],
    [
      'Birthdate',
      'Yes',
      `A date, as yyyy-mm-dd (e.g. 2004-05-17). mm/dd/yyyy is also accepted. The student must be ${MIN_STUDENT_AGE} to ${MAX_STUDENT_AGE} years old. Age is worked out from this; do not add an age column.`,
    ],
    [
      'Email',
      'Yes',
      "The student's own email address. Their login is sent here, so it must be correct and not used by another account.",
    ],
    ['Contact No.', 'No', 'An 11-digit mobile number, e.g. 09123456789.'],
    [
      'Course',
      'Yes',
      'The course abbreviation from the dropdown (the full course name is also accepted). Only active courses are listed.',
    ],
    [
      'Year Level',
      'Yes',
      'A year level the course has an OJT requirement for. Use the dropdown.',
    ],
  ];
  lines.forEach((line) => help.addRow(line));
  help.getRow(1).font = { bold: true };
  help.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  help.addRow([]);
  for (const note of [
    `Enter one student per row on the "${IMPORT_SHEET_NAME}" sheet, starting on row 2. Do not rename or remove the columns of the header row; extra columns are ignored.`,
    `The grey row marked "${EXAMPLE_MARKER}" is only an example. It is ignored — you may leave it or delete it.`,
    `A file may hold up to ${MAX_IMPORT_ROWS} students. Blank rows are skipped.`,
    'Establishments are NOT set here. A student is assigned to an establishment later, when the coordinator records their placement.',
    'After uploading you will see a preview. Rows with a problem are listed with the reason and are not imported; fix them and upload again.',
    'Each imported student gets an account with a temporary password, sent to the email address in their row. They set their own password at first sign-in.',
  ]) {
    const row = help.addRow([note]);
    help.mergeCells(row.number, 1, row.number, 3);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.height = 30;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
