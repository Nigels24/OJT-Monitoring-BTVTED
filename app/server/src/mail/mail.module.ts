import { Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { PrismaModule } from '../prisma/prisma.module';
import { readMailConfig } from './mail.config';
import {
  DEFAULT_MAIL_GAP_MS,
  MAIL_OPTIONS,
  MailOptions,
  MailService,
} from './mail.service';
import { CredentialsEmailService } from './credentials-email.service';

/**
 * Outgoing mail. One provider decides how mail leaves the building —
 * `MAIL_OPTIONS` — so everything else, tests included, deals only with
 * `MailService`.
 *
 * The Gmail transport is built lazily, on the first real send: with mail
 * disabled or unconfigured nothing here ever touches the network, which is
 * what lets the server boot and run exactly as before without it.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: MAIL_OPTIONS,
      useFactory: (): MailOptions => ({
        config: readMailConfig(),
        createTransport: (config) =>
          createTransport({
            service: 'gmail',
            auth: { user: config.user, pass: config.appPassword },
          }),
        gapMs: DEFAULT_MAIL_GAP_MS,
      }),
    },
    MailService,
    CredentialsEmailService,
  ],
  exports: [MailService, CredentialsEmailService],
})
export class MailModule {}
