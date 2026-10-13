/**
 * Outgoing-mail settings, read from the environment the same way the rest of
 * the server reads its settings (`jwt.constants.ts`, `storage.ts`): plain
 * `process.env`, loaded by `dotenv/config` — there is no `@nestjs/config`.
 *
 * Unlike `JWT_SECRET`, nothing here is required to boot. Mail is an optional
 * convenience on top of a flow that already works without it (the coordinator
 * is shown the temporary password once and hands it over), so a missing or
 * half-filled configuration turns sending off rather than stopping the server.
 */
export const DEFAULT_MAIL_FROM_NAME =
  'OJT-Track — West Prime Horizon Institute';

export interface MailConfig {
  /** `MAIL_ENABLED=true`. Anything else, or absent, is off. */
  enabled: boolean;
  /** The institution's dedicated Gmail address — also the From address. */
  user: string;
  /** A Gmail *app password*, not the account's own. Never logged. */
  appPassword: string;
  fromName: string;
  /** The address users open in a browser, with no trailing slash. */
  publicUrl: string;
  /**
   * What is missing while mail is enabled, by env key. Empty when mail is
   * disabled (nothing is needed) or fully configured.
   */
  missing: string[];
}

export function readMailConfig(
  env: Record<string, string | undefined> = process.env,
): MailConfig {
  const enabled = (env.MAIL_ENABLED ?? '').trim().toLowerCase() === 'true';
  const user = (env.GMAIL_USER ?? '').trim();
  // Google shows app passwords in four space-separated groups; accept them
  // pasted either way.
  const appPassword = (env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '');
  const publicUrl = (env.APP_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');

  const missing: string[] = [];
  if (enabled) {
    if (!user) missing.push('GMAIL_USER');
    if (!appPassword) missing.push('GMAIL_APP_PASSWORD');
    if (!publicUrl) missing.push('APP_PUBLIC_URL');
  }

  return {
    enabled,
    user,
    appPassword,
    fromName: (env.MAIL_FROM_NAME ?? '').trim() || DEFAULT_MAIL_FROM_NAME,
    publicUrl,
    missing,
  };
}

/** Enabled and nothing missing — the only state in which a send is attempted. */
export function isMailConfigured(config: MailConfig): boolean {
  return config.enabled && config.missing.length === 0;
}

/**
 * Why mail is not being sent, worded for the coordinator. Names env keys but
 * never their values.
 */
export function mailNotConfiguredReason(config: MailConfig): string {
  if (!config.enabled) return 'Email is not configured';
  return `Email is not configured (missing ${config.missing.join(', ')})`;
}
