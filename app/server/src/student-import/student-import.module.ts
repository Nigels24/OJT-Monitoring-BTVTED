import { Module } from '@nestjs/common';
import { StudentImportService } from './student-import.service';
import { StudentImportController } from './student-import.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CoordinatorModule } from '../coordinator/coordinator.module';
import { MailModule } from '../mail/mail.module';

/**
 * Batch student enrollment from Excel. Its own module so the spreadsheet code
 * stays out of `coordinator.service.ts`, but it creates students through
 * `CoordinatorService` — the import is another way in to the same account
 * creation, not a second version of it.
 */
@Module({
  imports: [PrismaModule, CoordinatorModule, MailModule],
  controllers: [StudentImportController],
  providers: [StudentImportService],
})
export class StudentImportModule {}
