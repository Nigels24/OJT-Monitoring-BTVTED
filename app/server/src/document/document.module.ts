import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { StudentDocumentController } from './student-document.controller';
import { CoordinatorDocumentController } from './coordinator-document.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';

/**
 * Documents, for both roles that touch them.
 *
 * The student's upload/list endpoints moved here out of `StudentModule`, and the
 * coordinator's review queue out of `CoordinatorModule`, because the naming
 * convention, the per-assignment rule and the replace-vs-conflict rule are one
 * set of rules that both paths now share (`DocumentService.upload`). Supervisors
 * deliberately have no controller here — they have no document access at all
 * (Table 1).
 *
 * Credentials stay in `StudentModule`: they are student-level, have no review
 * lifecycle and no checklist, and share only the upload validation.
 */
@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [StudentDocumentController, CoordinatorDocumentController],
  providers: [DocumentService],
})
export class DocumentModule {}
