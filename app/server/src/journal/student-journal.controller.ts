import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JournalService, MAX_JOURNAL_PHOTOS } from './journal.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/file-upload';
import { EmptyToNull, EmptyToUndefined } from '../common/transforms';

/**
 * Multipart body: only the text fields go through the DTO. The photo parts
 * arrive via `@UploadedFiles()` and are validated in the service (magic bytes,
 * size, count) — `forbidNonWhitelisted` has no notion of a multipart file part.
 * Same split as the document upload DTOs.
 */
class CreateJournalDto {
  @IsDateString()
  entryDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  activities!: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(5000)
  learnings?: string;
}

class UpdateJournalDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  activities?: string;

  // EmptyToNull, not EmptyToUndefined: clearing the box has to persist as
  // cleared, and the column is nullable. Absent still means "leave unchanged".
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(5000)
  learnings?: string | null;

  /**
   * Comma-separated photo ids to drop, e.g. `abc,def`. A multipart body has no
   * typed arrays — a repeated field arrives as a string or a string[] depending
   * on how many were sent, which `forbidNonWhitelisted` + `@IsString()` cannot
   * express cleanly — so one delimited field is the predictable shape.
   */
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(2000)
  removePhotoIds?: string;
}

const photosInterceptor = FilesInterceptor('photos', MAX_JOURNAL_PHOTOS, {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

@Controller('student/journals')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('STUDENT')
export class StudentJournalController {
  constructor(private journals: JournalService) {}

  @Post()
  @UseInterceptors(photosInterceptor)
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateJournalDto,
    @UploadedFiles() photos: Express.Multer.File[] = [],
  ) {
    return this.journals.createEntry(req.user.userId, dto, photos);
  }

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('assignmentId') assignmentId?: string,
  ) {
    return this.journals.listMyEntries(req.user.userId, assignmentId);
  }

  @Get(':id')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.journals.getMyEntry(req.user.userId, id);
  }

  @Patch(':id')
  @UseInterceptors(photosInterceptor)
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateJournalDto,
    @UploadedFiles() photos: Express.Multer.File[] = [],
  ) {
    return this.journals.updateEntry(
      req.user.userId,
      id,
      {
        activities: dto.activities,
        learnings: dto.learnings,
        removePhotoIds: splitIds(dto.removePhotoIds),
      },
      photos,
    );
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.journals.deleteEntry(req.user.userId, id);
  }
}

function splitIds(value?: string): string[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}
