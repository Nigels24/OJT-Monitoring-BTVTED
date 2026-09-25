import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { OverdueSweepService } from './overdue-sweep.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [NotificationService, OverdueSweepService],
  // NotificationService: called from SupervisorModule/CoordinatorModule at
  // their own write sites. OverdueSweepService: injected only by
  // CoordinatorService (to trigger a sweep at the start of getDashboard) —
  // its setInterval lifecycle runs regardless, via onModuleInit, the moment
  // this module is loaded by AppModule.
  exports: [NotificationService, OverdueSweepService],
})
export class NotificationModule {}
