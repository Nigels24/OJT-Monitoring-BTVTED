import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
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
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CoordinatorService } from './coordinator.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { GRADE_MAX, GRADE_MIN } from '../common/assignment-grade';
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

const STUDENT_SEXES = ['Male', 'Female'] as const;

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;
const ACADEMIC_YEAR_MESSAGE = 'academicYear must look like "2025-2026"';

class CreateSupervisorDto {
  @IsEmail()
  email!: string;

  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  // Optional: omit it and the service generates a readable temporary
  // password. The login is then emailed to the account; the generated
  // password comes back in the response as `temporaryPassword` only when
  // that email was not sent (see `credentialsEmail` there). Either way the
  // account is created with mustChangePassword = true (the schema default),
  // so the first sign-in always forces a real change.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

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

  // The full middle name; an initial is derived where one is needed
  // (`common/person-name.ts`).
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  middleName?: string | null;

  // "Sex" on the form. Stored in the `gender` column.
  @IsOptional()
  @EmptyToNull()
  @IsIn(STUDENT_SEXES)
  gender?: (typeof STUDENT_SEXES)[number] | null;

  // There is no `age` here on purpose: age is computed from this date and
  // returned read-only, and `forbidNonWhitelisted` rejects a body that tries
  // to send one. Likewise no `school` — every student belongs to the one
  // school this system serves.
  @IsOptional()
  @EmptyToNull()
  @IsDateString()
  dateOfBirth?: string | null;

  // Philippine mobile format, matching the prototype's own input validation.
  @IsOptional()
  @EmptyToNull()
  @Matches(/^\d{11}$/, {
    message: 'contactNumber must be exactly 11 digits (e.g. 09123456789)',
  })
  contactNumber?: string | null;

  // The standardized address: names chosen from the PSGC lists, the same
  // shape Establishment uses. All nullable, so EmptyToNull — clearing a select
  // clears the column. Whether the names are real and consistent with each
  // other is checked in the service (`common/ph-address.ts`), which needs all
  // of them at once; here they are only bounded.
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  province?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  cityMunicipality?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(120)
  barangay?: string | null;

  // House number / street / purok — the one free-text part.
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(255)
  streetAddress?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Matches(/^\d{4}$/, { message: 'postalCode must be exactly 4 digits' })
  postalCode?: string | null;

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

  // The structured counterparts to `course`/`yearLevel` above, stored on
  // their own columns (`courseId`/`courseYearLevel`). When set, the service
  // also derives a fresh value for the deprecated `course`/`yearLevel`
  // free-text columns so screens that still read them keep rendering
  // something sensible — see `coordinator.service.ts`'s
  // `resolveCourseFields`/`studentProfileData`. Named `courseYearLevel`, not
  // `yearLevel`, only because that name is already taken by the free-text
  // field above.
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

  // The coordinator issues the username by hand and passes it to the
  // student.
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  // Optional: omit it and the service generates a readable temporary
  // password — see CreateSupervisorDto's `password` for what is emailed and
  // what the response then carries.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

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

/**
 * The coordinator's final grade for a placement. `gradedById` and `gradedAt`
 * are absent on purpose: the server stamps both, and `forbidNonWhitelisted`
 * rejects a body that tries to supply them.
 */
class SetAssignmentGradeDto {
  // Decimal(5,2) in the schema — 0-100 with at most two decimal places. No
  // transform: the form sends a JSON number, and an empty box must be a 400
  // rather than a recorded grade of 0.
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'grade must be a number with at most 2 decimal places' },
  )
  @Min(GRADE_MIN)
  @Max(GRADE_MAX)
  grade!: number;

  // Nullable column, so EmptyToNull: clearing the box clears the remarks.
  // Absent from the body still means "leave unchanged".
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;
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

  /**
   * The dashboard's "Overdue verifications" widget, scoped by the same
   * My Block / All Program toggle as `GET /coordinator/students` — a
   * separate request from `GET /coordinator/dashboard` so flipping this
   * toggle doesn't refetch the whole dashboard. See
   * `CoordinatorService.getOverdueVerifications`.
   */
  @Get('dashboard/overdue')
  getOverdueVerifications(
    @Req() req: AuthedRequest,
    @Query('scope') scope?: 'block' | 'all',
  ) {
    return this.coordinatorService.getOverdueVerifications(
      req.user.userId,
      scope === 'all' ? 'all' : 'block',
    );
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

  // The document queue, the Table 3 status matrix and both upload paths live in
  // DocumentModule (`coordinator/documents`, `coordinator/students/:id/documents`).

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

  /**
   * Records or corrects the coordinator's grade for one placement. PUT, since
   * it sets the whole grade (and is safe to repeat) whether or not one exists
   * yet. See `CoordinatorService.setAssignmentGrade` for who may and when.
   */
  @Put('assignments/:id/grade')
  setAssignmentGrade(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: SetAssignmentGradeDto,
  ) {
    return this.coordinatorService.setAssignmentGrade(req.user.userId, id, dto);
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

  /**
   * "Resend login": replaces the account's password with a new generated one,
   * forces a change at the next sign-in, and emails it. Keyed by User id (not
   * the student's or supervisor's profile id) since it is the same operation
   * for either role — see `CoordinatorService.resendLogin`.
   *
   * The response carries `credentialsEmail: { status, error }`. The new
   * password is in it (`temporaryPassword`) **only** when the email was not
   * sent, so the coordinator can hand it over instead; when it was sent the
   * password never reaches the client.
   *
   * Replaces `POST users/:userId/reset-password`, which did the same reset
   * without the email — one action, not two.
   */
  @Post('users/:userId/resend-login')
  resendLogin(@Param('userId') userId: string) {
    return this.coordinatorService.resendLogin(userId);
  }

  @Delete('supervisors/:id')
  removeSupervisor(@Param('id') id: string) {
    return this.coordinatorService.removeSupervisor(id);
  }
}
