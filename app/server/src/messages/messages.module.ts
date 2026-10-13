import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PlacementThreadService } from './placement-thread.service';
import { MessageRetentionSweepService } from './message-retention-sweep.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    PlacementThreadService,
    MessageRetentionSweepService,
  ],
  // PlacementThreadService: called by CoordinatorService when a placement is
  // recorded or a supervisor account is created. The retention sweep is not
  // exported — nothing calls it; its timer starts via onModuleInit.
  exports: [PlacementThreadService],
})
export class MessagesModule {}
