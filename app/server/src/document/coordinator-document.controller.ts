import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { DocumentStage } from '../../generated/prisma/client';
import { DocumentService } from './document.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/file-upload';
import { EmptyToUndefined, ToOptionalNumber } from '../common/transforms';

const DOCUMENT_STAGE_VALUES = [
  'APPLICATION',
  'ACCEPTANCE',
  'COMPLETION',
] as const;

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

/**
 * `scope=block` (the default) narrows the matrix to the requesting coordinator's
 * own blocks — a view default, not an authorization boundary (Table 1: "own
 * block, all on request"), the same shape the student roster and journal queue
 * use.
 */
class StatusQueryDto {
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
  @IsString()
  establishmentId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(DOCUMENT_STAGE_VALUES)
  stage?: DocumentStage;
}

class UploadForStudentDto {
  @IsString()
  @IsNotEmpty()
  requirementId!: string;
}

@Controller('coordinator')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CoordinatorDocumentController {
  constructor(private documents: DocumentService) {}

  @Get('documents')
  list() {
    return this.documents.listForCoordinator();
  }

  /**
   * Declared before any `documents/:id` route would be — Nest matches handlers in
   * declaration order, so a literal path has to come first.
   */
  @Get('documents/requirements')
  listRequirements() {
    return this.documents.listRequirements();
  }

  /** Who is missing what, across a block — the Table 1 status view. */
  @Get('documents/status')
  status(@Req() req: AuthedRequest, @Query() query: StatusQueryDto) {
    return this.documents.getStatusMatrix(req.user.userId, query);
  }

  @Patch('documents/:id/review')
  review(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documents.review(
      req.user.userId,
      id,
      dto.status,
      dto.reviewNote,
    );
  }

  /** One student's checklist, for the status view's per-student drill-down. */
  @Get('students/:id/documents')
  studentChecklist(@Param('id') id: string) {
    return this.documents.getChecklistForCoordinator(id);
  }

  /**
   * Uploading on a student's behalf. Stored already APPROVED — the school
   * produced the file itself, so there is nobody else to review it.
   */
  @Post('students/:id/documents')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
  )
  uploadForStudent(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UploadForStudentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.uploadForStudent(
      req.user.userId,
      id,
      dto.requirementId,
      file,
    );
  }
}
