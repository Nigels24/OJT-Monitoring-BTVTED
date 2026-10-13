import { Workbook } from 'exceljs';
import { IMPORT_COLUMNS, ImportColumnKey } from './student-import.rules';

/**
 * Test helper: an `.xlsx` buffer with a "Students" sheet holding the given
 * rows. Not used by the application.
 */
export async function buildWorkbookBuffer(
  rows: Partial<Record<ImportColumnKey, unknown>>[],
  options: { sheetName?: string; headers?: string[] } = {},
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(options.sheetName ?? 'Students');
  const headers =
    options.headers ?? IMPORT_COLUMNS.map((column) => column.header);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(IMPORT_COLUMNS.map((column) => row[column.key] ?? null));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const validRow = (
  n: number,
  over: Partial<Record<ImportColumnKey, unknown>> = {},
): Partial<Record<ImportColumnKey, unknown>> => ({
  studentNumber: `2022-${String(n).padStart(5, '0')}`,
  lastName: 'dela cruz',
  firstName: 'juan',
  middleName: 'santos',
  sex: 'M',
  birthdate: new Date('2004-05-17T00:00:00.000Z'),
  email: `student${n}@example.com`,
  contactNumber: '09123456789',
  course: 'BTVTED-CHS',
  yearLevel: 4,
  ...over,
});
