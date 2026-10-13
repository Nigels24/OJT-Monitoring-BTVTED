import { isEmail } from 'class-validator';
import { ageOn } from '../common/age';

/**
 * The rules of the Excel student import that need neither a spreadsheet nor a
 * database: which columns the sheet has, how each cell is normalised, and
 * every reason a row can be rejected. Pure, so preview and commit run exactly
 * the same checks and the unit test covers them directly.
 *
 * `student-import.workbook.ts` turns a file into the plain cells this takes;
 * `StudentImportService` loads the context (courses, what already exists) and
 * does the writing.
 */

export const IMPORT_SHEET_NAME = 'Students';
/** The example row in the template carries this in Student No. and is skipped. */
export const EXAMPLE_MARKER = 'EXAMPLE';
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

export const MIN_STUDENT_AGE = 15;
export const MAX_STUDENT_AGE = 70;

export type ImportColumnKey =
  | 'studentNumber'
  | 'lastName'
  | 'firstName'
  | 'middleName'
  | 'sex'
  | 'birthdate'
  | 'email'
  | 'contactNumber'
  | 'course'
  | 'yearLevel';

export interface ImportColumn {
  key: ImportColumnKey;
  /** The header exactly as the template prints it. */
  header: string;
  required: boolean;
}

/** The sheet's columns, in template order. */
export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: 'studentNumber', header: 'Student No.', required: true },
  { key: 'lastName', header: 'Last Name', required: true },
  { key: 'firstName', header: 'First Name', required: true },
  { key: 'middleName', header: 'Middle Name', required: false },
  { key: 'sex', header: 'Sex', required: true },
  { key: 'birthdate', header: 'Birthdate', required: true },
  { key: 'email', header: 'Email', required: true },
  { key: 'contactNumber', header: 'Contact No.', required: false },
  { key: 'course', header: 'Course', required: true },
  { key: 'yearLevel', header: 'Year Level', required: true },
];

/* ---------------------------------------------------------------------------
 * Headers
 * ------------------------------------------------------------------------ */

/**
 * A header reduced to what identifies it: lower-case letters and digits only.
 * "Student No.", " student no ", "STUDENT_NO" and "StudentNo" are all
 * `studentno` — so the sheet is read by header *name*, whatever its case,
 * spacing or punctuation, and never by column position.
 */
export function normaliseHeader(value: unknown): string {
  return toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface HeaderMatch {
  /** Column key -> zero-based index into a row's cells. */
  indexByKey: Partial<Record<ImportColumnKey, number>>;
  /** Template headers that were not found — every column must be present. */
  missing: string[];
}

/**
 * Finds each template column in the sheet's header row. Columns may be in any
 * order and extra columns are ignored. Every template column must exist, even
 * the optional ones — an optional column is one whose *cells* may be blank.
 */
export function matchHeaders(headerCells: readonly unknown[]): HeaderMatch {
  const indexByHeader = new Map<string, number>();
  headerCells.forEach((cell, index) => {
    const header = normaliseHeader(cell);
    // The first occurrence wins if a header is repeated.
    if (header && !indexByHeader.has(header)) indexByHeader.set(header, index);
  });

  const indexByKey: HeaderMatch['indexByKey'] = {};
  const missing: string[] = [];
  for (const column of IMPORT_COLUMNS) {
    const index = indexByHeader.get(normaliseHeader(column.header));
    if (index === undefined) missing.push(column.header);
    else indexByKey[column.key] = index;
  }
  return { indexByKey, missing };
}

/* ---------------------------------------------------------------------------
 * Normalisers
 * ------------------------------------------------------------------------ */

/** A cell as text: trimmed, with runs of whitespace collapsed to one space. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/**
 * "dela cruz" / "DELA CRUZ" -> "Dela Cruz". Each word, and each part of a
 * hyphenated or apostrophised word, starts with a capital: "o'brien-santos"
 * -> "O'Brien-Santos".
 */
export function titleCaseName(value: unknown): string {
  return toText(value)
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_match, lead: string, letter: string) => {
      return lead + letter.toUpperCase();
    });
}

export function normaliseEmail(value: unknown): string {
  return toText(value).toLowerCase();
}

/** M / F / Male / Female in any case -> "Male" | "Female"; anything else `null`. */
export function normaliseSex(value: unknown): 'Male' | 'Female' | null {
  const text = toText(value).toLowerCase();
  if (text === 'm' || text === 'male') return 'Male';
  if (text === 'f' || text === 'female') return 'Female';
  return null;
}

/**
 * A birthdate cell as a UTC-midnight date (the form every date-only column is
 * stored in), or `null` if it is not a real calendar date.
 *
 * Accepts a real Excel date (which arrives as a `Date`), or text in
 * `yyyy-mm-dd` or `mm/dd/yyyy`. Impossible dates — February 30, month 13 —
 * are rejected rather than rolled over into the next month.
 */
export function parseBirthdate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return utcDate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  const text = toText(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return utcDate(Number(us[3]), Number(us[1]), Number(us[2]));
  return null;
}

/** `null` unless year-month-day is a date that exists. */
function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/** A whole number from a numeric or text cell ("4", 4, "4.0"); else `null`. */
export function parseYearLevel(value: unknown): number | null {
  const text = toText(value);
  if (!/^\d+(\.0+)?$/.test(text)) return null;
  return Number(text);
}

/**
 * A contact number as digits only — spaces, dashes and a leading +63 are
 * tidied to the 11-digit `09…` form the single-add form requires. Returns the
 * tidied text; whether it is valid is the row check's decision.
 */
export function normaliseContactNumber(value: unknown): string {
  const text = toText(value);
  if (!text) return '';
  let digits = text.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+63')) digits = `0${digits.slice(3)}`;
  // Excel drops the leading zero of a number typed into a numeric cell.
  if (/^9\d{9}$/.test(digits)) digits = `0${digits}`;
  return digits;
}

/** `2001-03-15` for a UTC-midnight date. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------------
 * Rows
 * ------------------------------------------------------------------------ */

/** One data row as read from the sheet, before any checking. */
export interface RawImportRow {
  /** The row's number as Excel shows it (the header is row 1). */
  rowNumber: number;
  cells: Partial<Record<ImportColumnKey, unknown>>;
}

export interface ImportCourse {
  id: string;
  code: string;
  name: string;
  /** The year levels this course has an OJT requirement for. */
  yearLevels: readonly number[];
}

export interface ImportBlock {
  id: string;
  name: string;
  courseId: string;
  yearLevel: number;
}

export interface ImportContext {
  /** Active courses only — an inactive course does not match. */
  courses: readonly ImportCourse[];
  /** Student numbers already in the system (as stored). */
  existingStudentNumbers: ReadonlySet<string>;
  /** Emails already used by any user, lower-cased. */
  existingEmails: ReadonlySet<string>;
  /** The block every imported student is to join, if one was chosen. */
  block: ImportBlock | null;
  /** Manila's today, UTC midnight. */
  today: Date;
}

export interface ImportRowValues {
  studentNumber: string;
  lastName: string;
  firstName: string;
  /** The full middle name, stored as given (title-cased). */
  middleName: string;
  sex: 'Male' | 'Female' | null;
  /** `yyyy-mm-dd`, or `null` when the cell was not a valid date. */
  birthdate: string | null;
  /**
   * Computed from the birthdate (`common/age.ts`) to check the age limits and
   * to show in the preview. Never read from the file, and not stored.
   */
  age: number | null;
  email: string;
  contactNumber: string;
  /** The matched course's abbreviation, or what was typed if none matched. */
  course: string;
  courseId: string | null;
  yearLevel: number | null;
}

export interface ImportRow {
  rowNumber: number;
  status: 'VALID' | 'ERROR';
  /** Every reason this row is rejected — all of them, not only the first. */
  reasons: string[];
  values: ImportRowValues;
}

const MAX_NAME_LENGTH = 120;
const MAX_STUDENT_NUMBER_LENGTH = 50;

/** True for a row with nothing in any template column. */
export function isEmptyRow(row: RawImportRow): boolean {
  return IMPORT_COLUMNS.every((column) => toText(row.cells[column.key]) === '');
}

/** True for the template's example row, which is never imported. */
export function isExampleRow(row: RawImportRow): boolean {
  return (
    toText(row.cells.studentNumber).toUpperCase() ===
    EXAMPLE_MARKER.toUpperCase()
  );
}

/**
 * Checks every row and returns each with its normalised values, its status and
 * all of its reasons. Fully empty rows and the example row are dropped
 * silently; every other row comes back, in sheet order.
 *
 * Duplicates inside the file are reported on *every* row that shares the
 * value, naming the other rows, so the coordinator sees both sides.
 */
export function validateRows(
  rawRows: readonly RawImportRow[],
  context: ImportContext,
): ImportRow[] {
  const rows = rawRows.filter((row) => !isEmptyRow(row) && !isExampleRow(row));
  const normalised = rows.map((row) => ({
    rowNumber: row.rowNumber,
    raw: row.cells,
    values: normaliseRow(row, context),
  }));

  const rowsByStudentNumber = groupRowNumbers(
    normalised,
    (row) => row.values.studentNumber,
  );
  const rowsByEmail = groupRowNumbers(normalised, (row) => row.values.email);

  return normalised.map(({ rowNumber, raw, values }) => {
    const reasons: string[] = [];

    /* ---- required values ---- */
    for (const column of IMPORT_COLUMNS) {
      if (column.required && toText(raw[column.key]) === '') {
        reasons.push(`${column.header} is required`);
      }
    }

    /* ---- student number ---- */
    if (values.studentNumber) {
      if (values.studentNumber.length > MAX_STUDENT_NUMBER_LENGTH) {
        reasons.push(
          `Student No. is longer than ${MAX_STUDENT_NUMBER_LENGTH} characters`,
        );
      }
      const sharing = othersSharing(rowsByStudentNumber, values.studentNumber);
      if (sharing(rowNumber).length > 0) {
        reasons.push(
          `Duplicate Student No. in this file (also on row ${sharing(rowNumber).join(', ')})`,
        );
      }
      if (context.existingStudentNumbers.has(values.studentNumber)) {
        reasons.push('Student No. is already in the system');
      }
    }

    /* ---- names ---- */
    for (const [label, name] of [
      ['Last Name', values.lastName],
      ['First Name', values.firstName],
    ] as const) {
      if (name.length > MAX_NAME_LENGTH) {
        reasons.push(`${label} is longer than ${MAX_NAME_LENGTH} characters`);
      }
    }

    /* ---- sex ---- */
    if (toText(raw.sex) !== '' && values.sex === null) {
      reasons.push('Sex must be Male or Female (M or F)');
    }

    /* ---- birthdate ---- */
    if (toText(raw.birthdate) !== '') {
      if (values.birthdate === null || values.age === null) {
        reasons.push(
          'Birthdate is not a valid date (use yyyy-mm-dd or mm/dd/yyyy)',
        );
      } else if (values.age < MIN_STUDENT_AGE) {
        reasons.push(
          `Birthdate makes the student ${values.age}, under the minimum age of ${MIN_STUDENT_AGE}`,
        );
      } else if (values.age > MAX_STUDENT_AGE) {
        reasons.push(
          `Birthdate makes the student ${values.age}, over the maximum age of ${MAX_STUDENT_AGE}`,
        );
      }
    }

    /* ---- email ---- */
    if (values.email) {
      if (!isEmail(values.email)) {
        reasons.push('Email is not a valid email address');
      } else {
        const sharing = othersSharing(rowsByEmail, values.email);
        if (sharing(rowNumber).length > 0) {
          reasons.push(
            `Duplicate Email in this file (also on row ${sharing(rowNumber).join(', ')})`,
          );
        }
        if (context.existingEmails.has(values.email)) {
          reasons.push('Email is already used by another account');
        }
      }
    }

    /* ---- contact number (optional) ---- */
    if (values.contactNumber && !/^\d{11}$/.test(values.contactNumber)) {
      reasons.push('Contact No. must be exactly 11 digits (e.g. 09123456789)');
    }

    /* ---- course and year level ---- */
    const course = context.courses.find((c) => c.id === values.courseId);
    if (toText(raw.course) !== '' && !course) {
      reasons.push(
        `Unknown course "${toText(raw.course)}" (use an active course's abbreviation or full name)`,
      );
    }
    if (toText(raw.yearLevel) !== '') {
      if (values.yearLevel === null) {
        reasons.push('Year Level must be a whole number');
      } else if (course && !course.yearLevels.includes(values.yearLevel)) {
        reasons.push(
          `Year Level ${values.yearLevel} is not valid for ${course.code}` +
            (course.yearLevels.length > 0
              ? ` (it has an OJT requirement for year ${[...course.yearLevels].sort().join(', ')})`
              : ' (it has no OJT requirement defined yet)'),
        );
      }
    }

    /* ---- the block chosen for the whole import ---- */
    if (context.block && course && values.yearLevel !== null) {
      if (
        context.block.courseId !== course.id ||
        context.block.yearLevel !== values.yearLevel
      ) {
        reasons.push(
          `The selected block "${context.block.name}" is for a different course or year level`,
        );
      }
    }

    return {
      rowNumber,
      status: reasons.length === 0 ? 'VALID' : 'ERROR',
      reasons,
      values,
    };
  });
}

function normaliseRow(
  row: RawImportRow,
  context: ImportContext,
): ImportRowValues {
  const cells = row.cells;
  const birthdate = parseBirthdate(cells.birthdate);
  const courseText = toText(cells.course).toLowerCase();
  const course = courseText
    ? context.courses.find(
        (c) =>
          c.code.toLowerCase() === courseText ||
          c.name.toLowerCase() === courseText,
      )
    : undefined;

  return {
    studentNumber: toText(cells.studentNumber),
    lastName: titleCaseName(cells.lastName),
    firstName: titleCaseName(cells.firstName),
    middleName: titleCaseName(cells.middleName),
    sex: normaliseSex(cells.sex),
    birthdate: birthdate ? dateKey(birthdate) : null,
    age: birthdate ? ageOn(birthdate, context.today) : null,
    email: normaliseEmail(cells.email),
    contactNumber: normaliseContactNumber(cells.contactNumber),
    course: course?.code ?? toText(cells.course),
    courseId: course?.id ?? null,
    yearLevel: parseYearLevel(cells.yearLevel),
  };
}

/** value -> the row numbers carrying it (blank values are not grouped). */
function groupRowNumbers<T extends { rowNumber: number }>(
  rows: readonly T[],
  valueOf: (row: T) => string,
): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const value = valueOf(row);
    if (!value) continue;
    const list = groups.get(value) ?? [];
    list.push(row.rowNumber);
    groups.set(value, list);
  }
  return groups;
}

/** The other rows that share `value` with a given row. */
function othersSharing(groups: Map<string, number[]>, value: string) {
  return (rowNumber: number) =>
    (groups.get(value) ?? []).filter((other) => other !== rowNumber);
}

export function countRows(rows: readonly ImportRow[]) {
  const valid = rows.filter((row) => row.status === 'VALID').length;
  return { total: rows.length, valid, errors: rows.length - valid };
}
