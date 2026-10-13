import { Module } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { AnnouncementController } from './announcement.controller';
import { CoordinatorAnnouncementController } from './coordinator-announcement.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [CoordinatorAnnouncementController, AnnouncementController],
  providers: [AnnouncementService],
})
export class AnnouncementModule {}
