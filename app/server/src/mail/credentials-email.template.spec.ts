import {
  buildCredentialsEmail,
  CredentialsEmailInput,
} from './credentials-email.template';

const input: CredentialsEmailInput = {
  name: 'Juan D. Mundo',
  role: 'STUDENT',
  loginId: 'juan.mundo',
  temporaryPassword: 'Xk7mPq2vRt',
  appUrl: 'http://192.168.1.10:3001',
  kind: 'CREATED',
};

/** A bcrypt hash, as stored in `User.password` — must never appear in mail. */
const HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

describe('buildCredentialsEmail', () => {
  it.each(['text', 'html'] as const)(
    'puts the address, login ID and temporary password in the %s body',
    (part) => {
      const body = buildCredentialsEmail(input)[part];
      expect(body).toContain('http://192.168.1.10:3001');
      expect(body).toContain('juan.mundo');
      expect(body).toContain('Xk7mPq2vRt');
      expect(body).toContain('Juan D. Mundo');
    },
  );

  it('tells the recipient a new password is required and not to share this one', () => {
    const { text, html } = buildCredentialsEmail(input);
    for (const body of [text, html]) {
      expect(body).toContain(
        'You will be asked to set a new password the first time you sign in.',
      );
      expect(body).toContain('Do not share this password');
    }
  });

  it('says the account was created for a new account', () => {
    const email = buildCredentialsEmail(input);
    expect(email.subject).toBe('OJT-Track: your account has been created');
    expect(email.text).toContain('Your OJT-Track account has been created.');
    expect(email.text).not.toContain('has been reset');
  });

  it('says the login was reset for a resend', () => {
    const email = buildCredentialsEmail({ ...input, kind: 'RESET' });
    expect(email.subject).toBe('OJT-Track: your login has been reset');
    expect(email.text).toContain('Your OJT-Track login has been reset.');
    expect(email.text).toContain('Your previous password no longer works.');
    expect(email.text).not.toContain('has been created');
  });

  it('names the role in plain words', () => {
    expect(buildCredentialsEmail(input).text).toContain('as a student');
    expect(
      buildCredentialsEmail({ ...input, role: 'SUPERVISOR' }).text,
    ).toContain('as a company supervisor');
  });

  it('keeps the password out of the subject line', () => {
    expect(buildCredentialsEmail(input).subject).not.toContain('Xk7mPq2vRt');
  });

  it('never contains a password hash — it is not given one, and builds none', () => {
    const { subject, text, html } = buildCredentialsEmail(input);
    const everything = `${subject}\n${text}\n${html}`;
    expect(everything).not.toContain(HASH);
    // No bcrypt-shaped string of any kind.
    expect(everything).not.toMatch(/\$2[aby]\$\d{2}\$/);
    // And the input type has no field a hash could arrive in.
    expect(Object.keys(input).sort()).toEqual([
      'appUrl',
      'kind',
      'loginId',
      'name',
      'role',
      'temporaryPassword',
    ]);
  });

  it('escapes user-supplied text in the HTML body', () => {
    const { html, text } = buildCredentialsEmail({
      ...input,
      name: '<script>alert(1)</script>',
      loginId: 'a&b"c',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a&amp;b&quot;c');
    // Plain text is not HTML, so it is left as typed.
    expect(text).toContain('<script>alert(1)</script>');
  });
});
