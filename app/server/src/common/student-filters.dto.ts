import { IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { EmptyToUndefined, ToOptionalNumber } from './transforms';
import { TRAINING_STATUSES } from './student-filters';
import type { TrainingStatus } from './student-filters';

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;
const academicYearMessage = (field: string) =>
  `${field} must look like "2025-2026"`;

/**
 * The coordinator's student filters as query parameters — validated here, and
 * shared by the Students list and the summary report so both accept exactly
 * the same query string.
 *
 * `scope=block` (the default) narrows to the requesting coordinator's own
 * blocks — a view default, not an authorization boundary (Table 1: "own
 * block, all on request"). Every other filter narrows further, on top of
 * whichever scope applies.
 */
export class StudentFiltersQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['block', 'all'])
  scope?: 'block' | 'all';

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  courseId?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  yearLevel?: number;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  blockId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Matches(ACADEMIC_YEAR_PATTERN, {
    message: academicYearMessage('academicYear'),
  })
  academicYear?: string;

  // A range of academic years, inclusive; either end may be left open.
  @IsOptional()
  @EmptyToUndefined()
  @Matches(ACADEMIC_YEAR_PATTERN, {
    message: academicYearMessage('academicYearFrom'),
  })
  academicYearFrom?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Matches(ACADEMIC_YEAR_PATTERN, {
    message: academicYearMessage('academicYearTo'),
  })
  academicYearTo?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  establishmentId?: string;

  // Where the student stands in training — from their placements.
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(TRAINING_STATUSES)
  trainingStatus?: TrainingStatus;

  // The student record's own status.
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['ACTIVE', 'PENDING', 'COMPLETED', 'INACTIVE'])
  status?: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'INACTIVE';
}
