import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { StudentImportService } from './student-import.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToUndefined } from '../common/transforms';
import { MAX_IMPORT_FILE_BYTES } from './student-import.rules';

/**
 * Multipart body: only `blockId` goes through the DTO. The file arrives via
 * `@UploadedFile()` and is checked in the service (type from its content,
 * size, sheet, columns, row count) — the same split as every other upload.
 */
class ImportOptionsDto {
  // Optional: the block every imported student joins. "" means none.
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  blockId?: string;
}

/**
 * A hard ceiling well above the real limit, so a file a little over 2MB gets
 * the service's worded 400 rather than Multer's bare 413; anything past this
 * is refused before it is buffered at all.
 */
const fileInterceptor = FileInterceptor('file', {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES * 2 },
});

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('coordinator/students/import')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class StudentImportController {
  constructor(private imports: StudentImportService) {}

  /**
   * The Excel template. `@Res()` because this answers with bytes and headers
   * rather than JSON, built whole before anything is sent — the same shape as
   * the evaluation PDF download.
   */
  @Get('template')
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const body = await this.imports.getTemplate();
    res.setHeader('Content-Type', XLSX_MIME_TYPE);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="OJT-Track-student-import-template.xlsx"',
    );
    res.setHeader('Content-Length', body.length);
    res.end(body);
  }

  /** Parse and validate only. Writes nothing. */
  @Post('preview')
  @UseInterceptors(fileInterceptor)
  preview(
    @Body() dto: ImportOptionsDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.preview(file, dto.blockId);
  }

  /**
   * The same file again, re-parsed and re-validated from scratch — the
   * preview's verdicts are never sent back and never trusted.
   */
  @Post('commit')
  @UseInterceptors(fileInterceptor)
  commit(
    @Req() req: AuthedRequest,
    @Body() dto: ImportOptionsDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.commit(req.user.userId, file, dto.blockId);
  }
}
