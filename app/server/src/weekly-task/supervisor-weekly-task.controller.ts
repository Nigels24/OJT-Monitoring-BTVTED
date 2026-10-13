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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WeeklyTaskService } from './weekly-task.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToNull, EmptyToUndefined } from '../common/transforms';
import { MAX_TASK_RATING, MIN_TASK_RATING } from '../common/weekly-tasks';

/** One placement, one week. `week` is any day of it; omitted means this week. */
export class WeekQueryDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  week?: string;
}

/**
 * `studentId`, `supervisorId` and `status` are absent on purpose: the server
 * derives the first two from the assignment and the JWT, and a task is always
 * born ASSIGNED. `forbidNonWhitelisted` rejects a body that supplies them.
 */
class CreateWeeklyTaskDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  // Any day of the week the task is for — the service stores its Monday.
  @IsDateString()
  weekStart!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  dueDate!: string;
}

class UpdateWeeklyTaskDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  // Nullable column, so EmptyToNull: clearing the box clears the description.
  // Absent from the body still means "leave unchanged".
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  dueDate?: string;
}

/** `ratedAt` and the RATED status are stamped by the server, never sent. */
class RateWeeklyTaskDto {
  // No transform: the form sends a JSON number, and an unpicked rating must be
  // a 400 rather than a recorded 0.
  @IsInt()
  @Min(MIN_TASK_RATING)
  @Max(MAX_TASK_RATING)
  rating!: number;

  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}

@Controller('supervisor/weekly-tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPERVISOR')
export class SupervisorWeeklyTaskController {
  constructor(private weeklyTasks: WeeklyTaskService) {}

  /**
   * The week's tasks with their photos, ratings, counts and average — the list
   * the page renders and the summary the printed report uses are one response.
   */
  @Get()
  list(@Req() req: AuthedRequest, @Query() query: WeekQueryDto) {
    return this.weeklyTasks.listForSupervisor(
      req.user.userId,
      query.assignmentId,
      query.week,
    );
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateWeeklyTaskDto) {
    return this.weeklyTasks.create(req.user.userId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWeeklyTaskDto,
  ) {
    return this.weeklyTasks.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.weeklyTasks.remove(req.user.userId, id);
  }

  @Patch(':id/rate')
  rate(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RateWeeklyTaskDto,
  ) {
    return this.weeklyTasks.rate(req.user.userId, id, dto);
  }
}
