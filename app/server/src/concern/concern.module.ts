import { Module } from '@nestjs/common';
import { ConcernService } from './concern.service';
import { SupervisorConcernController } from './supervisor-concern.controller';
import { CoordinatorConcernController } from './coordinator-concern.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * Supervisor raises, coordinator responds. Two controllers and no third: the
 * student never sees a concern, so there is deliberately no student route.
 */
@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [SupervisorConcernController, CoordinatorConcernController],
  providers: [ConcernService],
})
export class ConcernModule {}
