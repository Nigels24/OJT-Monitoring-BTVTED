import { readMailConfig } from './mail.config';
import {
  LoginCredentialsMail,
  MailOptions,
  MailService,
  MailTransport,
  describeMailError,
  isDeliverableEmail,
} from './mail.service';

const CONFIGURED_ENV = {
  MAIL_ENABLED: 'true',
  GMAIL_USER: 'ojt@school.example',
  GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  APP_PUBLIC_URL: 'http://192.168.1.10:3001/',
};

const mail = (
  over: Partial<LoginCredentialsMail> = {},
): LoginCredentialsMail => ({
  to: 'juan@example.com',
  name: 'Juan D. Mundo',
  role: 'STUDENT',
  loginId: 'juan.mundo',
  temporaryPassword: 'Xk7mPq2vRt',
  kind: 'CREATED',
  ...over,
});

type SentMessage = Parameters<MailTransport['sendMail']>[0];

function serviceWith(
  env: Record<string, string | undefined>,
  sendMail: (message: SentMessage) => Promise<unknown>,
  gapMs = 0,
) {
  const createTransport = jest.fn((): MailTransport => ({
    sendMail: jest.fn(sendMail),
  }));
  const options: MailOptions = {
    config: readMailConfig(env),
    createTransport,
    gapMs,
  };
  return { service: new MailService(options), createTransport };
}

describe('MailService — not configured', () => {
  it('returns NOT_CONFIGURED without touching the transport when mail is disabled', async () => {
    const sendMail = jest.fn();
    const { service, createTransport } = serviceWith(
      { ...CONFIGURED_ENV, MAIL_ENABLED: 'false' },
      sendMail,
    );

    await expect(service.sendLoginCredentials(mail())).resolves.toEqual({
      status: 'NOT_CONFIGURED',
      error: 'Email is not configured',
    });
    expect(service.isConfigured()).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('treats an absent MAIL_ENABLED as disabled', async () => {
    const { service } = serviceWith({}, jest.fn());
    await expect(service.sendLoginCredentials(mail())).resolves.toMatchObject({
      status: 'NOT_CONFIGURED',
    });
  });

  it('returns NOT_CONFIGURED, naming the missing keys but no values, when enabled but incomplete', async () => {
    const { service, createTransport } = serviceWith(
      { MAIL_ENABLED: 'true', GMAIL_USER: 'ojt@school.example' },
      jest.fn(),
    );

    const result = await service.sendLoginCredentials(mail());
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.error).toBe(
      'Email is not configured (missing GMAIL_APP_PASSWORD, APP_PUBLIC_URL)',
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('does not throw at startup whatever the configuration', () => {
    for (const env of [{}, { MAIL_ENABLED: 'true' }, CONFIGURED_ENV]) {
      const { service } = serviceWith(env, jest.fn());
      expect(() => service.onModuleInit()).not.toThrow();
    }
  });

  it('does not attempt a send to a missing or malformed address', async () => {
    const sendMail = jest.fn();
    const { service } = serviceWith(CONFIGURED_ENV, sendMail);

    for (const to of ['', 'not-an-email', 'a@b', 'two words@x.com']) {
      await expect(service.sendLoginCredentials(mail({ to }))).resolves.toEqual(
        {
          status: 'NOT_CONFIGURED',
          error: 'The account has no valid email address',
        },
      );
    }
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('MailService — sending', () => {
  it('sends one email from the institution account and reports SENT', async () => {
    const sent: SentMessage[] = [];
    const { service, createTransport } = serviceWith(CONFIGURED_ENV, (m) => {
      sent.push(m);
      return Promise.resolve();
    });

    await expect(service.sendLoginCredentials(mail())).resolves.toEqual({
      status: 'SENT',
      error: null,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('juan@example.com');
    expect(sent[0].from).toEqual({
      name: 'OJT-Track — West Prime Horizon Institute',
      address: 'ojt@school.example',
    });
    // The public URL (trailing slash trimmed), login ID and password.
    expect(sent[0].text).toContain('Address: http://192.168.1.10:3001\n');
    expect(sent[0].text).toContain('juan.mundo');
    expect(sent[0].text).toContain('Xk7mPq2vRt');
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it('builds the transport once, with the app password stripped of spaces', async () => {
    const { service, createTransport } = serviceWith(CONFIGURED_ENV, () =>
      Promise.resolve(),
    );

    await service.sendLoginCredentials(mail());
    await service.sendLoginCredentials(mail({ to: 'ana@example.com' }));

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport.mock.calls[0]).toEqual([
      expect.objectContaining({
        user: 'ojt@school.example',
        appPassword: 'abcdefghijklmnop',
      }),
    ]);
  });

  it('reports FAILED with a short reason, and never throws', async () => {
    const { service } = serviceWith(CONFIGURED_ENV, () =>
      Promise.reject(
        Object.assign(new Error('Invalid login: 535-5.7.8'), { code: 'EAUTH' }),
      ),
    );

    const result = await service.sendLoginCredentials(mail());
    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('Gmail rejected the sign-in');
  });

  it('keeps going after a failure: the next email still sends', async () => {
    let call = 0;
    const { service } = serviceWith(CONFIGURED_ENV, () =>
      ++call === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(),
    );

    const results = await service.sendLoginCredentialsBatch([
      mail({ to: 'a@example.com' }),
      mail({ to: 'b@example.com' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['FAILED', 'SENT']);
  });
});

describe('MailService — queue', () => {
  it('sends strictly one at a time, in the order requested', async () => {
    const events: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const { service } = serviceWith(CONFIGURED_ENV, async (message) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      events.push(`start ${message.to}`);
      await new Promise((resolve) => setTimeout(resolve, 15));
      events.push(`end ${message.to}`);
      inFlight -= 1;
    });

    // Fired together, as a batch of new accounts would be.
    const results = await service.sendLoginCredentialsBatch([
      mail({ to: 'a@example.com' }),
      mail({ to: 'b@example.com' }),
      mail({ to: 'c@example.com' }),
    ]);

    expect(maxInFlight).toBe(1);
    expect(events).toEqual([
      'start a@example.com',
      'end a@example.com',
      'start b@example.com',
      'end b@example.com',
      'start c@example.com',
      'end c@example.com',
    ]);
    expect(results.map((r) => r.status)).toEqual(['SENT', 'SENT', 'SENT']);
  });

  it('shares one queue between single sends and a batch', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const { service } = serviceWith(CONFIGURED_ENV, async (message) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(message.to);
      inFlight -= 1;
    });

    await Promise.all([
      service.sendLoginCredentials(mail({ to: 'first@example.com' })),
      service.sendLoginCredentialsBatch([
        mail({ to: 'second@example.com' }),
        mail({ to: 'third@example.com' }),
      ]),
    ]);

    expect(maxInFlight).toBe(1);
    expect(order).toEqual([
      'first@example.com',
      'second@example.com',
      'third@example.com',
    ]);
  });

  it('leaves a gap between one send finishing and the next starting', async () => {
    const gapMs = 60;
    const startedAt: number[] = [];
    const finishedAt: number[] = [];
    const { service } = serviceWith(
      CONFIGURED_ENV,
      async () => {
        startedAt.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 5));
        finishedAt.push(Date.now());
      },
      gapMs,
    );

    await service.sendLoginCredentialsBatch([
      mail({ to: 'a@example.com' }),
      mail({ to: 'b@example.com' }),
      mail({ to: 'c@example.com' }),
    ]);

    // Timers may fire a millisecond or two early; allow for that.
    expect(startedAt[1] - finishedAt[0]).toBeGreaterThanOrEqual(gapMs - 5);
    expect(startedAt[2] - finishedAt[1]).toBeGreaterThanOrEqual(gapMs - 5);
  });
});

describe('describeMailError', () => {
  it('removes any secret it is told about', () => {
    const message = describeMailError(
      new Error(
        'auth failed for pass abcdefghijklmnop while sending Xk7mPq2vRt',
      ),
      ['abcdefghijklmnop', 'Xk7mPq2vRt'],
    );
    expect(message).not.toContain('abcdefghijklmnop');
    expect(message).not.toContain('Xk7mPq2vRt');
    expect(message).toContain('[hidden]');
  });

  it('caps the length so it is safe to store and show', () => {
    expect(describeMailError(new Error('x'.repeat(5000))).length).toBe(200);
  });

  it('copes with a non-Error rejection', () => {
    expect(describeMailError('nope')).toBe('The email could not be sent.');
  });
});

describe('isDeliverableEmail', () => {
  it('accepts an ordinary address and rejects the rest', () => {
    expect(isDeliverableEmail('juan@example.com')).toBe(true);
    expect(isDeliverableEmail(' juan@example.com ')).toBe(true);
    for (const bad of [null, undefined, '', 'juan', 'juan@', '@x.com', 'a@b']) {
      expect(isDeliverableEmail(bad)).toBe(false);
    }
  });
});
