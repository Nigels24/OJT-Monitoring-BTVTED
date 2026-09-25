import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsString } from 'class-validator';
import { DocumentService } from './document.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/file-upload';

/**
 * Multipart body: only the text field goes through the DTO. The file arrives via
 * `@UploadedFile()` and is validated in the service (real type by content
 * signature, size) — `forbidNonWhitelisted` has no notion of a multipart file
 * part.
 *
 * There is no `name` field any more: the system names every file
 * (`StudentNo_CODE_SURNAME.ext`) from the requirement and the student's own
 * record, so a student cannot mislabel what they uploaded.
 */
class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  requirementId!: string;
}

@Controller('student/documents')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('STUDENT')
export class StudentDocumentController {
  constructor(private documents: DocumentService) {}

  /**
   * The Table 3 checklist with each requirement's current state, plus legacy
   * uploads. Replaces the old flat list — the page is a checklist now, and the
   * per-assignment rule behind it is server-side knowledge.
   */
  @Get()
  getChecklist(@Req() req: AuthedRequest) {
    return this.documents.getChecklistForStudent(req.user.userId);
  }

  /** The checklist definition on its own, for a form that only needs the options. */
  @Get('requirements')
  listRequirements() {
    return this.documents.listRequirements();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
  )
  upload(
    @Req() req: AuthedRequest,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.uploadAsStudent(
      req.user.userId,
      dto.requirementId,
      file,
    );
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.documents.deleteOwnDocument(req.user.userId, id);
  }
}
