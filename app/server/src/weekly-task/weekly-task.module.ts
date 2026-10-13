import { Module } from '@nestjs/common';
import { WeeklyTaskService } from './weekly-task.service';
import { SupervisorWeeklyTaskController } from './supervisor-weekly-task.controller';
import { StudentWeeklyTaskController } from './student-weekly-task.controller';
import { CoordinatorWeeklyTaskController } from './coordinator-weekly-task.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * One module, three role-scoped controllers, one service — the same shape as
 * `JournalModule`, and for the same reason: a weekly task is one record that
 * the supervisor assigns and rates, the student completes, and the coordinator
 * reads.
 */
@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [
    SupervisorWeeklyTaskController,
    StudentWeeklyTaskController,
    CoordinatorWeeklyTaskController,
  ],
  providers: [WeeklyTaskService],
})
export class WeeklyTaskModule {}
