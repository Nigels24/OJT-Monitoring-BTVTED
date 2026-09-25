import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { StudentJournalController } from './student-journal.controller';
import { CoordinatorJournalController } from './coordinator-journal.controller';
import { SupervisorJournalController } from './supervisor-journal.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * One module, three role-scoped controllers, one service.
 *
 * A journal entry is the same record for all three roles — the student writes
 * it, the coordinator reviews it, the supervisor reads it — so the ownership and
 * scoping rules live in one service rather than being re-derived in three
 * existing ones (which is what kept `coordinator.service.ts` growing). Same
 * shape `EvaluationTemplateModule` uses for its coordinator-prefixed routes.
 */
@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [
    StudentJournalController,
    CoordinatorJournalController,
    SupervisorJournalController,
  ],
  providers: [JournalService],
})
export class JournalModule {}
