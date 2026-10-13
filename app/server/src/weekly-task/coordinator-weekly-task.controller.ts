import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WeeklyTaskService } from './weekly-task.service';
import { WeekQueryDto } from './supervisor-weekly-task.controller';
import { Roles, RolesGuard } from '../auth/roles.guard';

/**
 * Read-only: the coordinator sees a placement's weekly tasks, ratings and proof
 * photos, and can print the report, but assigns and rates nothing. There is no
 * write route here to forget to guard.
 */
@Controller('coordinator/weekly-tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CoordinatorWeeklyTaskController {
  constructor(private weeklyTasks: WeeklyTaskService) {}

  @Get()
  list(@Query() query: WeekQueryDto) {
    return this.weeklyTasks.listForCoordinator(query.assignmentId, query.week);
  }
}
