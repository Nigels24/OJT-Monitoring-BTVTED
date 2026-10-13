import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailResult, MailService } from './mail.service';
import { CredentialsEmailKind } from './credentials-email.template';

export interface DeliverCredentialsInput {
  userId: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'SUPERVISOR';
  username: string | null;
  /** Plaintext, straight from the generator. Passed on, never stored or logged. */
  temporaryPassword: string;
  kind: CredentialsEmailKind;
}

/**
 * Emails an account its login and records how that went on the user row.
 *
 * The two always happen together — an attempt that is not recorded would
 * leave the coordinator's "Login email" column lying — so they live in one
 * place, used by account creation and by "Resend login" alike.
 *
 * Never throws for a mail problem: the account or the reset it follows has
 * already been committed, and must stand whatever happens here.
 */
@Injectable()
export class CredentialsEmailService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async deliver(input: DeliverCredentialsInput): Promise<MailResult> {
    const result = await this.mail.sendLoginCredentials({
      to: input.email,
      name: input.name,
      role: input.role,
      // What they type in the login box: the username if they have one.
      loginId: input.username ?? input.email,
      temporaryPassword: input.temporaryPassword,
      kind: input.kind,
    });

    await this.prisma.client.user.update({
      where: { id: input.userId },
      data: credentialsEmailColumns(result),
    });

    return result;
  }
}

/**
 * The three status columns for one attempt. `credentialsSentAt` is set only
 * when the email really went out and cleared otherwise, so it always answers
 * "was the *current* temporary password emailed, and when".
 */
export function credentialsEmailColumns(
  result: MailResult,
  now: Date = new Date(),
) {
  return {
    credentialsEmailStatus: result.status,
    credentialsSentAt: result.status === 'SENT' ? now : null,
    credentialsEmailError: result.status === 'SENT' ? null : result.error,
  };
}
