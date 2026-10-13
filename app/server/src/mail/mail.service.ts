import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MailConfig,
  isMailConfigured,
  mailNotConfiguredReason,
} from './mail.config';
import {
  CredentialsEmailInput,
  buildCredentialsEmail,
} from './credentials-email.template';

/** Injection token for `MailOptions` — see `MailModule`. */
export const MAIL_OPTIONS = 'MAIL_OPTIONS';

/** The one thing this service needs from nodemailer, so tests can fake it. */
export interface MailTransport {
  sendMail(message: {
    from: { name: string; address: string };
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface MailOptions {
  config: MailConfig;
  /** Builds the transport. Called at most once, on the first real send. */
  createTransport: (config: MailConfig) => MailTransport;
  /** Pause between two sends, in milliseconds. */
  gapMs: number;
}

export type MailStatus = 'SENT' | 'FAILED' | 'NOT_CONFIGURED';

export interface MailResult {
  status: MailStatus;
  /** A short reason for the coordinator when not SENT. Never contains a secret. */
  error: string | null;
}

export interface LoginCredentialsMail extends Omit<
  CredentialsEmailInput,
  'appUrl'
> {
  to: string;
}

/** About a second between sends keeps a batch under Gmail's rate limit. */
export const DEFAULT_MAIL_GAP_MS = 1000;

const MAX_ERROR_LENGTH = 200;

/** A plausible address: something@something.tld, no spaces. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isDeliverableEmail(email: string | null | undefined): boolean {
  return !!email && EMAIL_PATTERN.test(email.trim());
}

/**
 * Sends the login-credentials email through the institution's Gmail account.
 *
 * Three rules shape everything here:
 *
 * - **It never throws.** Every send resolves to a `MailResult` — SENT, FAILED
 *   or NOT_CONFIGURED — because its callers (creating an account, resending a
 *   login) must succeed whether or not the email goes out.
 * - **It never logs a password or a message body.** Only the recipient, the
 *   kind of email and whether it worked.
 * - **Sends are sequential, with a gap.** Everything goes through one
 *   in-process queue, so a batch of accounts leaves as a steady trickle
 *   instead of a burst Gmail would throttle. `sendLoginCredentialsBatch` is
 *   the entry point for many recipients at once (the Excel import).
 *
 * The queue is in memory: a server restart drops whatever was still waiting.
 * That is safe because the coordinator's "Resend login" re-issues any login
 * whose email did not go out, and its status column shows which those are.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transport: MailTransport | null = null;
  /** The tail of the queue: each send waits for the one before it. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastSendFinishedAt = 0;

  constructor(@Inject(MAIL_OPTIONS) private readonly options: MailOptions) {}

  /** Says at startup whether mail will be sent. Never stops the boot. */
  onModuleInit() {
    const { config } = this.options;
    if (isMailConfigured(config)) {
      this.logger.log(`Mail is enabled; sending as ${config.user}.`);
    } else if (config.enabled) {
      this.logger.warn(
        `MAIL_ENABLED is true but ${config.missing.join(', ')} ${config.missing.length === 1 ? 'is' : 'are'} not set. ` +
          'No email will be sent; temporary passwords are shown to the coordinator instead.',
      );
    } else {
      this.logger.log(
        'Mail is disabled (MAIL_ENABLED is not "true"). Temporary passwords are shown to the coordinator instead.',
      );
    }
  }

  /** Whether a send would actually be attempted. */
  isConfigured(): boolean {
    return isMailConfigured(this.options.config);
  }

  /**
   * Emails one account its login. Resolves once this email has been sent or
   * has failed — which, behind other queued mail, may be a few seconds.
   */
  sendLoginCredentials(mail: LoginCredentialsMail): Promise<MailResult> {
    const { config } = this.options;
    if (!isMailConfigured(config)) {
      return Promise.resolve({
        status: 'NOT_CONFIGURED',
        error: mailNotConfiguredReason(config),
      });
    }
    if (!isDeliverableEmail(mail.to)) {
      return Promise.resolve({
        status: 'NOT_CONFIGURED',
        error: 'The account has no valid email address',
      });
    }

    const result = this.queue.then(() => this.deliver(mail));
    // The queue only cares that the slot is over; `deliver` never rejects.
    this.queue = result;
    return result;
  }

  /**
   * Emails many accounts their logins, one after another, and resolves with
   * one result per input in the same order. One failure does not stop the
   * rest.
   *
   * `onResult`, when given, is called as each email finishes — a batch of
   * hundreds takes minutes at one a second, and a caller recording outcomes
   * should not have to wait for the last one to record the first. It is
   * awaited inside that email's slot; anything it throws is the caller's to
   * catch, and never disturbs the queue.
   */
  sendLoginCredentialsBatch(
    mails: readonly LoginCredentialsMail[],
    onResult?: (index: number, result: MailResult) => Promise<void> | void,
  ): Promise<MailResult[]> {
    // Each call enqueues immediately, so the batch keeps its order and shares
    // the queue (and its gap) with anything else being sent.
    return Promise.all(
      mails.map(async (mail, index) => {
        const result = await this.sendLoginCredentials(mail);
        if (onResult) {
          try {
            await onResult(index, result);
          } catch (err) {
            this.logger.error(
              `Recording the result of a login email to ${mail.to} failed: ` +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
        return result;
      }),
    );
  }

  /** One send, after the gap. Runs strictly one at a time via the queue. */
  private async deliver(mail: LoginCredentialsMail): Promise<MailResult> {
    const { config, gapMs } = this.options;
    const wait = this.lastSendFinishedAt + gapMs - Date.now();
    if (this.lastSendFinishedAt > 0 && wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    try {
      const { subject, text, html } = buildCredentialsEmail({
        name: mail.name,
        role: mail.role,
        loginId: mail.loginId,
        temporaryPassword: mail.temporaryPassword,
        kind: mail.kind,
        appUrl: config.publicUrl,
      });
      this.transport ??= this.options.createTransport(config);
      await this.transport.sendMail({
        from: { name: config.fromName, address: config.user },
        to: mail.to.trim(),
        subject,
        text,
        html,
      });
      this.logger.log(`Login email (${mail.kind}) sent to ${mail.to}.`);
      return { status: 'SENT', error: null };
    } catch (err) {
      const error = describeMailError(err, [
        config.appPassword,
        mail.temporaryPassword,
      ]);
      this.logger.error(
        `Login email (${mail.kind}) to ${mail.to} failed: ${error}`,
      );
      return { status: 'FAILED', error };
    } finally {
      this.lastSendFinishedAt = Date.now();
    }
  }
}

/** What nodemailer's error codes mean, in words a coordinator can act on. */
const ERROR_HINTS: Record<string, string> = {
  EAUTH:
    'Gmail rejected the sign-in. Check GMAIL_USER and GMAIL_APP_PASSWORD (an app password, not the account password).',
  EENVELOPE: 'Gmail rejected the recipient address.',
  ECONNECTION: 'Could not connect to Gmail.',
  ETIMEDOUT: 'The connection to Gmail timed out.',
  ESOCKET: 'The connection to Gmail was interrupted.',
  EDNS: 'Could not find the Gmail server (no internet connection?).',
};

/**
 * A short, storable reason for a failed send.
 *
 * Built from the error's code where it is one we recognise, and otherwise from
 * its message — with any secret the caller names removed and the length
 * capped, since this is stored on the user row and shown to the coordinator.
 */
export function describeMailError(
  err: unknown,
  secrets: readonly string[] = [],
): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String(err.code)
      : '';
  let message =
    ERROR_HINTS[code] ??
    (err instanceof Error ? err.message : 'The email could not be sent.');

  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[hidden]');
  }
  message = message.replace(/\s+/g, ' ').trim();
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…`
    : message;
}
