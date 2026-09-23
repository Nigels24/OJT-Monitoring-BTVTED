import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CoordinatorService } from './coordinator.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import {
  EmptyToNull,
  EmptyToUndefined,
  ToNullableNumber,
  ToOptionalNumber,
} from '../common/transforms';

// Usernames must not contain "@" so they can never shadow an email address
// when AuthService.login matches an identifier against both columns.
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,30}$/;
const USERNAME_MESSAGE =
  'username must be 4-30 characters using letters, numbers, dot, underscore or hyphen (no "@")';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;
const ACADEMIC_YEAR_MESSAGE = 'academicYear must look like "2025-2026"';

class CreateSupervisorDto {
  @IsEmail()
  email!: string;

  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  establishmentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;
}

/**
 * Personal and OJT fields the coordinator's student form collects. Shared by
 * create and update; create adds the identity fields below.
 */
class StudentDetailsDto {
  // The nullable columns below use EmptyToNull, not EmptyToUndefined: on an
  // edit, emptying a box has to persist as cleared rather than silently keep
  // the old value. Absent from the body still means "leave unchanged".
  // `requiredHours` and `status` stay on the undefined-based transforms — they
  // are NOT NULL, so null there is a write error, not a clear.
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  firstName?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(10)
  middleInitial?: string | null;

  @IsOptional()
  @ToNullableNumber()
  @IsInt()
  @Min(15)
  @Max(100)
  age?: number | null;

  @IsOptional()
  @EmptyToNull()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(200)
  school?: string | null;

  // Philippine mobile format, matching the prototype's own input validation.
  @IsOptional()
  @EmptyToNull()
  @Matches(/^\d{11}$/, {
    message: 'contactNumber must be exactly 11 digits (e.g. 09123456789)',
  })
  contactNumber?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  course?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(30)
  yearLevel?: string | null;

  // The structured counterparts to `course`/`yearLevel` above. When set, the
  // service also derives fresh values for those two deprecated free-text
  // columns (course name, and String(courseYearLevel)) so screens that still
  // read them keep rendering something sensible — see
  // `coordinator.service.ts`'s `studentProfileData`. Named `courseYearLevel`,
  // not `yearLevel`, only because that name is already taken by the free-text
  // field above; there is no separate stored column for it; it is folded into
  // the deprecated `yearLevel` string and read back from there by
  // `getPlacementDefaults`.
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @IsNotEmpty()
  courseId?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @IsNotEmpty()
  blockId?: string | null;

  @IsOptional()
  @ToNullableNumber()
  @IsInt()
  @Min(1)
  @Max(10)
  courseYearLevel?: number | null;

  // Clearing the establishment select unassigns the student — Student
  // .establishmentId is nullable for exactly that (see §8 item 17).
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @IsNotEmpty()
  establishmentId?: string | null;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(0)
  requiredHours?: number;

  // The day the student's OJT begins. Read by the coordinator's attendance
  // oversight (GET /coordinator/attendance), which measures approved days
  // against the calendar days elapsed since this date — a student with no
  // startDate reports a null percentage rather than a misleading 0%.
  @IsOptional()
  @EmptyToNull()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'PENDING', 'COMPLETED', 'INACTIVE'])
  status?: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'INACTIVE';
}

class CreateStudentDto extends StudentDetailsDto {
  @IsEmail()
  email!: string;

  // The coordinator issues both credentials by hand and passes them to the
  // student. This replaced an earlier server-generated temporary password.
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Only needed when first/last name are not supplied; the service composes
  // User.name from the name parts when it can.
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  studentIdNumber!: string;
}

class UpdateStudentDto extends StudentDetailsDto {}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

class ReviewDocumentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  // Required only on rejection — same shape as Attendance's decline reason.
  // @ValidateIf skips every check below when the condition is false, so an
  // APPROVED body needs nothing here at all.
  @ValidateIf((o: ReviewDocumentDto) => o.status === 'REJECTED')
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reviewNote?: string;
}

class CreatePlacementDto {
  @IsString()
  @IsNotEmpty()
  establishmentId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(WEEKDAYS, { each: true })
  dutyDays!: (typeof WEEKDAYS)[number][];

  @IsDateString()
  startDate!: string;

  @Matches(ACADEMIC_YEAR_PATTERN, { message: ACADEMIC_YEAR_MESSAGE })
  academicYear!: string;

  // Defaults to the matching CourseRequirement's hours (see
  // getPlacementDefaults) when omitted — this only overrides it.
  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(0)
  requiredHours?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  blockId?: string;
}

/**
 * `scope=block` (the default) narrows the roster to the requesting
 * coordinator's own blocks — a view default, not an authorization boundary
 * (Table 1: "own block, all on request"). The other filters narrow further,
 * on top of whichever scope applies.
 */
class ListStudentsQueryDto {
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
  @Matches(ACADEMIC_YEAR_PATTERN, { message: ACADEMIC_YEAR_MESSAGE })
  academicYear?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['ACTIVE', 'PENDING', 'COMPLETED', 'INACTIVE'])
  status?: 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'INACTIVE';
}

class UpdateAssignmentDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(WEEKDAYS, { each: true })
  dutyDays?: (typeof WEEKDAYS)[number][];

  @IsOptional()
  @EmptyToNull()
  @IsDateString()
  endDate?: string | null;

  // Not TRANSFERRED — that status is only ever set by placing a new
  // assignment (createPlacement), never directly, so the previous placement
  // and the new one always change together.
  @IsOptional()
  @IsIn(['COMPLETED', 'CANCELLED'])
  status?: 'COMPLETED' | 'CANCELLED';
}

@Controller('coordinator')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CoordinatorController {
  constructor(private coordinatorService: CoordinatorService) {}

  @Post('supervisors')
  createSupervisor(@Body() dto: CreateSupervisorDto) {
    return this.coordinatorService.createSupervisor(dto);
  }

  @Post('students')
  createStudent(@Body() dto: CreateStudentDto) {
    return this.coordinatorService.createStudent(dto);
  }

  @Get('students')
  listStudents(
    @Req() req: AuthedRequest,
    @Query() query: ListStudentsQueryDto,
  ) {
    return this.coordinatorService.listStudents(req.user.userId, query);
  }

  /** The requesting coordinator's own blocks — populates the "My Block" scope's filters. */
  @Get('me/blocks')
  getMyBlocks(@Req() req: AuthedRequest) {
    return this.coordinatorService.getMyBlocks(req.user.userId);
  }

  /** Every coordinator account, for the block form's "assigned coordinator" picker. */
  @Get('coordinators')
  listCoordinators() {
    return this.coordinatorService.listCoordinators();
  }

  @Get('supervisors')
  listSupervisors() {
    return this.coordinatorService.listSupervisors();
  }

  @Get('dashboard')
  getDashboard() {
    return this.coordinatorService.getDashboard();
  }

  @Get('attendance')
  getAttendanceOversight() {
    return this.coordinatorService.getAttendanceOversight();
  }

  @Get('evaluations')
  listEvaluations() {
    return this.coordinatorService.listEvaluations();
  }

  /**
   * The filled-in sheet as a PDF, for the coordinator to forward to the
   * student. `@Res()` because this answers with bytes and two headers rather
   * than JSON — the whole document is built first and sent in one write, so a
   * failure is a clean error rather than a truncated 200 (see
   * `common/evaluation-pdf.ts`).
   */
  @Get('evaluations/:id/pdf')
  async downloadEvaluationPdf(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, body } =
      await this.coordinatorService.getEvaluationPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    // The filename is ASCII and separator-free by construction, so the plain
    // quoted form is enough — no RFC 5987 encoding needed.
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', body.length);
    res.end(body);
  }

  @Get('documents')
  getDocuments() {
    return this.coordinatorService.getDocuments();
  }

  @Patch('documents/:id/review')
  reviewDocument(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.coordinatorService.reviewDocument(
      req.user.userId,
      id,
      dto.status,
      dto.reviewNote,
    );
  }

  @Patch('students/:id')
  updateStudent(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.coordinatorService.updateStudent(id, dto);
  }

  @Delete('students/:id')
  removeStudent(@Param('id') id: string) {
    return this.coordinatorService.removeStudent(id);
  }

  @Get('students/:id/placement-defaults')
  getPlacementDefaults(
    @Param('id') id: string,
    @Query('establishmentId') establishmentId?: string,
  ) {
    return this.coordinatorService.getPlacementDefaults(id, establishmentId);
  }

  @Post('students/:id/placements')
  createPlacement(@Param('id') id: string, @Body() dto: CreatePlacementDto) {
    return this.coordinatorService.createPlacement(id, dto);
  }

  @Get('students/:id/assignments')
  listAssignments(@Param('id') id: string) {
    return this.coordinatorService.listAssignments(id);
  }

  @Patch('assignments/:id')
  updateAssignment(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.coordinatorService.updateAssignment(id, dto);
  }

  // Recovery for a forgotten password. No current password required — see
  // CoordinatorService.resetStudentPassword.
  @Patch('students/:id/password')
  resetStudentPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.coordinatorService.resetStudentPassword(id, dto.password);
  }

  @Patch('supervisors/:id/password')
  resetSupervisorPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.coordinatorService.resetSupervisorPassword(id, dto.password);
  }

  @Delete('supervisors/:id')
  removeSupervisor(@Param('id') id: string) {
    return this.coordinatorService.removeSupervisor(id);
  }
}
