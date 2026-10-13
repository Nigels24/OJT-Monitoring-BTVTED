import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { storageDriver } from '../common/storage';

/**
 * `GET /health` — is the system up? No login: it is what the person looking
 * after the host computer opens to check, and what a monitor would poll. It
 * says nothing about the data — only that the API answers, whether it can
 * reach the database, and which storage driver is in use.
 *
 * Always 200 when the API itself is running; a database that is down shows
 * as `database: false` rather than as an error page.
 */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let database = false;
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      // Reported as `false` below; the reason is in the server's own log.
    }
    let storage: string;
    try {
      storage = storageDriver();
    } catch {
      storage = 'misconfigured';
    }
    return { status: 'ok', database, storage };
  }
}
