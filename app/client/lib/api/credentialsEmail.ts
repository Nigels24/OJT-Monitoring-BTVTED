/**
 * The login email — shared shapes for the three places that deal with it:
 * creating a student, creating a supervisor, and "Resend login".
 *
 * A new account's temporary password is emailed to the user by the server.
 * These types describe only how that went. The password itself reaches the
 * client in exactly one case: the email was NOT sent, so the coordinator has
 * to hand it over (`temporaryPassword` on the response, shown once).
 */

export type CredentialsEmailStatus = "SENT" | "FAILED" | "NOT_CONFIGURED";

/** The outcome of one attempt, returned by create and by resend. */
export interface CredentialsEmailResult {
  status: CredentialsEmailStatus;
  /** A short reason when not SENT. Never contains a secret. */
  error: string | null;
}

/**
 * The last attempt for an account, as stored on its user row and shown in the
 * coordinator's lists. All `null` for an account no attempt was ever made for.
 */
export interface AccountEmailStatus {
  /** Set only when the current temporary password was actually emailed. */
  credentialsSentAt: string | null;
  credentialsEmailStatus: CredentialsEmailStatus | null;
  credentialsEmailError: string | null;
}

/**
 * Why the coordinator is being shown a password instead of a "sent" toast —
 * the one line above the one-time password.
 */
export function credentialsEmailReason(result: CredentialsEmailResult): string {
  if (result.status === "FAILED") {
    return `Email failed: ${result.error ?? "the login email could not be sent"}`;
  }
  return result.error ?? "Email is not configured";
}
