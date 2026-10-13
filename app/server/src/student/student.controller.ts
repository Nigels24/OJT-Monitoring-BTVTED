import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { StudentService, CREDENTIAL_TYPES } from './student.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToNull } from '../common/transforms';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/file-upload';

class SubmitAttendanceDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsDateString()
  timeInAM?: string;

  @IsOptional()
  @IsDateString()
  timeOutAM?: string;

  @IsOptional()
  @IsDateString()
  timeInPM?: string;

  @IsOptional()
  @IsDateString()
  timeOutPM?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

// Students may only ever touch these two fields on their own record — every
// other field (name, course, requiredHours, status, ...) is coordinator-owned.
// Declaring nothing else here is what makes forbidNonWhitelisted reject an
// attempt to slip one in.
class UpdateProfileDto {
  // EmptyToNull so a student can actually erase a value they no longer want on
  // file. Absent from the body still means "leave unchanged".
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
}

// Multipart body: only the text field goes through the DTO. The file itself
// comes through @UploadedFile() and is validated in the service, not here —
// forbidNonWhitelisted has no notion of a multipart file part. See CLAUDE.md
// §7 "File storage — the decided design".
class UploadCredentialDto {
  @IsIn(CREDENTIAL_TYPES)
  type!: (typeof CREDENTIAL_TYPES)[number];
}

@Controller('student')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('STUDENT')
export class StudentController {
  constructor(private studentService: StudentService) {}

  @Get('dashboard')
  getDashboard(@Req() req: AuthedRequest) {
    return this.studentService.getDashboard(req.user.userId);
  }

  @Post('attendance')
  submitAttendance(
    @Req() req: AuthedRequest,
    @Body() dto: SubmitAttendanceDto,
  ) {
    return this.studentService.submitAttendance(req.user.userId, dto);
  }

  @Get('attendance')
  getAttendanceHistory(@Req() req: AuthedRequest) {
    return this.studentService.getAttendanceHistory(req.user.userId);
  }

  /** One of the student's own evaluation sheets, in full — the print view. */
  @Get('evaluations/:id')
  getEvaluation(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.studentService.getEvaluation(req.user.userId, id);
  }

  @Get('profile')
  getProfile(@Req() req: AuthedRequest) {
    return this.studentService.getProfile(req.user.userId);
  }

  @Patch('profile')
  updateProfile(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    return this.studentService.updateProfile(req.user.userId, dto);
  }

  // Documents live in DocumentModule (`student/documents`): the Table 3
  // checklist, the naming convention and the per-assignment rule are shared with
  // the coordinator's upload path, so both go through one service.

  @Post('credentials')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
  )
  uploadCredential(
    @Req() req: AuthedRequest,
    @Body() dto: UploadCredentialDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.studentService.uploadCredential(req.user.userId, dto, file);
  }

  @Get('credentials')
  getMyCredentials(@Req() req: AuthedRequest) {
    return this.studentService.getMyCredentials(req.user.userId);
  }

  @Delete('credentials/:id')
  deleteCredential(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.studentService.deleteCredential(req.user.userId, id);
  }
}
