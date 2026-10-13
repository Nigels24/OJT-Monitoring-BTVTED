import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MESSAGE_RETENTION_DAYS,
  expiredMessagesWhere,
} from '../common/message-retention';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes chat messages older than `MESSAGE_RETENTION_DAYS`, for every
 * participant, permanently (panel revision). Runs on boot and every 24 hours
 * after, on a plain `setInterval` like `OverdueSweepService` —
 * `@nestjs/schedule` is not installed.
 *
 * It deletes `Message` rows and nothing else. Conversations and their
 * participants stay, so an emptied thread is still there to write in;
 * concerns, announcements, notifications and the feedback stored on
 * attendance, journal and weekly-task records live in other tables this never
 * queries. What is deleted is exactly `expiredMessagesWhere()`
 * (`common/message-retention.ts`), which is unit-tested.
 *
 * A host that sleeps between requests may never fire the timer, exactly as
 * with the overdue sweep; the run at boot is what covers that case, since
 * waking the host boots the process.
 */
@Injectable()
export class MessageRetentionSweepService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessageRetentionSweepService.name);
  private timer?: NodeJS.Timeout;
  /** True while a sweep is in flight, so two can never overlap. */
  private running = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    void this.runSweep();
    this.timer = setInterval(() => {
      void this.runSweep();
    }, ONE_DAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One sweep. Returns how many messages were deleted, or `null` when it did
   * not run (another sweep was still in flight) or failed. Never throws — the
   * timer that calls it has nobody to report to.
   */
  async runSweep(): Promise<number | null> {
    if (this.running) {
      this.logger.warn(
        'Message retention sweep skipped: the previous run has not finished.',
      );
      return null;
    }
    this.running = true;
    try {
      const { count } = await this.prisma.client.message.deleteMany({
        where: expiredMessagesWhere(),
      });
      this.logger.log(
        `Message retention sweep: deleted ${count} message(s) older than ${MESSAGE_RETENTION_DAYS} days.`,
      );
      return count;
    } catch (err) {
      this.logger.error(
        `Message retention sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      this.running = false;
    }
  }
}
