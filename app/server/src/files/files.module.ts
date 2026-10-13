import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';

/** The two routes that take no login: signed file links and `/health`. */
@Module({
  imports: [PrismaModule],
  controllers: [FilesController, HealthController],
})
export class FilesModule {}
