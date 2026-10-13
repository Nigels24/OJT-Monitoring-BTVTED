/**
 * The login-credentials email — the only email this system sends.
 *
 * Kept in its own file, with no imports, so the wording can be changed without
 * touching how mail is sent. It is a pure function of its input: the same
 * details in, the same subject, text and HTML out.
 *
 * It is given the *plaintext* temporary password, because that is the one
 * thing the recipient needs — and nothing else secret. It never sees the
 * password hash, and nothing built here is logged (`MailService`).
 */
export type CredentialsEmailKind =
  /** A new account. */
  | 'CREATED'
  /** "Resend login": the previous password has been replaced. */
  | 'RESET';

export interface CredentialsEmailInput {
  name: string;
  role: 'STUDENT' | 'SUPERVISOR';
  /** What they type in the login box: the username if set, else the email. */
  loginId: string;
  temporaryPassword: string;
  /** `APP_PUBLIC_URL` — where the system is opened. */
  appUrl: string;
  kind: CredentialsEmailKind;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

const SYSTEM_NAME = 'OJT-Track';

const ROLE_LABEL: Record<CredentialsEmailInput['role'], string> = {
  STUDENT: 'student',
  SUPERVISOR: 'company supervisor',
};

export function buildCredentialsEmail(
  input: CredentialsEmailInput,
): BuiltEmail {
  const isReset = input.kind === 'RESET';
  const subject = isReset
    ? `${SYSTEM_NAME}: your login has been reset`
    : `${SYSTEM_NAME}: your account has been created`;
  const headline = isReset
    ? `Your ${SYSTEM_NAME} login has been reset.`
    : `Your ${SYSTEM_NAME} account has been created.`;
  const intro = isReset
    ? `A new temporary password has been issued for your ${ROLE_LABEL[input.role]} account. Your previous password no longer works.`
    : `You have been registered in ${SYSTEM_NAME} as a ${ROLE_LABEL[input.role]}. Use the details below to sign in.`;
  const firstLogin =
    'You will be asked to set a new password the first time you sign in.';
  const doNotShare =
    'Do not share this password with anyone. If you did not expect this email, please inform your OJT coordinator.';

  const text = [
    `Hello ${input.name},`,
    '',
    headline,
    intro,
    '',
    `Address: ${input.appUrl}`,
    `Login ID: ${input.loginId}`,
    `Temporary password: ${input.temporaryPassword}`,
    '',
    firstLogin,
    doNotShare,
    '',
    'This is an automated message. Please do not reply to it.',
  ].join('\n');

  const row = (label: string, value: string, mono = true) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#555;">${label}</td>` +
    `<td style="padding:6px 0;${mono ? 'font-family:Consolas,Menlo,monospace;' : ''}font-weight:bold;">${value}</td></tr>`;

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px;">',
    `<p>Hello ${escapeHtml(input.name)},</p>`,
    `<p><strong>${escapeHtml(headline)}</strong><br>${escapeHtml(intro)}</p>`,
    '<table style="border-collapse:collapse;margin:16px 0;">',
    row(
      'Address',
      `<a href="${escapeHtml(input.appUrl)}">${escapeHtml(input.appUrl)}</a>`,
      false,
    ),
    row('Login ID', escapeHtml(input.loginId)),
    row('Temporary password', escapeHtml(input.temporaryPassword)),
    '</table>',
    `<p>${escapeHtml(firstLogin)}</p>`,
    `<p>${escapeHtml(doNotShare)}</p>`,
    '<p style="color:#777;font-size:13px;">This is an automated message. Please do not reply to it.</p>',
    '</div>',
  ].join('\n');

  return { subject, text, html };
}

/** Names and login ids are user-supplied, so they are escaped before they go into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
