import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AnnouncementService } from './announcement.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToNull, EmptyToUndefined } from '../common/transforms';

const AUDIENCES = ['STUDENTS', 'SUPERVISORS', 'ALL'] as const;

/** `postedById` is absent on purpose: it comes from the JWT. */
class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsIn(AUDIENCES)
  audience!: (typeof AUDIENCES)[number];

  // Nullable columns: "" or null means "not limited by this".
  @IsOptional()
  @EmptyToNull()
  @IsString()
  blockId?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  courseId?: string | null;
}

class UpdateAnnouncementDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(AUDIENCES)
  audience?: (typeof AUDIENCES)[number];

  // EmptyToNull, not EmptyToUndefined: clearing the select has to remove the
  // limit. Absent from the body still means "leave unchanged".
  @IsOptional()
  @EmptyToNull()
  @IsString()
  blockId?: string | null;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  courseId?: string | null;
}

@Controller('coordinator/announcements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CoordinatorAnnouncementController {
  constructor(private announcements: AnnouncementService) {}

  @Get()
  list() {
    return this.announcements.listForCoordinator();
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(req.user.userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcements.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.announcements.remove(id);
  }
}
