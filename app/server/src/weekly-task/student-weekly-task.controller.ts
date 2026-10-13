import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { WeeklyTaskService } from './weekly-task.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/file-upload';
import { EmptyToUndefined } from '../common/transforms';
import { MAX_TASK_PHOTOS } from '../common/weekly-tasks';

/** Both optional: the active placement and the current week are the defaults. */
class MyWeekQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  assignmentId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  week?: string;
}

/**
 * Multipart body: only the note goes through the DTO. The photo parts arrive
 * via `@UploadedFiles()` and are validated in the service (magic bytes, size,
 * count) — the same split as the journal's upload DTOs.
 */
class MarkDoneDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

const photosInterceptor = FilesInterceptor('photos', MAX_TASK_PHOTOS, {
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

@Controller('student/weekly-tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('STUDENT')
export class StudentWeeklyTaskController {
  constructor(private weeklyTasks: WeeklyTaskService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: MyWeekQueryDto) {
    return this.weeklyTasks.listForStudent(req.user.userId, query);
  }

  @Patch(':id/done')
  @UseInterceptors(photosInterceptor)
  markDone(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: MarkDoneDto,
    @UploadedFiles() photos: Express.Multer.File[] = [],
  ) {
    return this.weeklyTasks.markDone(req.user.userId, id, dto, photos);
  }

  @Patch(':id/undo')
  undoDone(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.weeklyTasks.undoDone(req.user.userId, id);
  }
}
