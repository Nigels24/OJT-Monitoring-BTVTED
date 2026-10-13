import { PrismaService } from '../prisma/prisma.service';
import {
  CredentialsEmailService,
  DeliverCredentialsInput,
  credentialsEmailColumns,
} from './credentials-email.service';
import { readMailConfig } from './mail.config';
import { MailService, MailTransport } from './mail.service';

type UserUpdate = {
  where: { id: string };
  data: {
    credentialsEmailStatus: string;
    credentialsSentAt: Date | null;
    credentialsEmailError: string | null;
  };
};

/**
 * The real MailService over a mocked transport, and a PrismaService whose only
 * reachable call is `user.update` — so these check what is actually written to
 * the user row after a real send attempt.
 */
function setup(
  env: Record<string, string | undefined>,
  sendMail: () => Promise<unknown>,
) {
  const update = jest.fn<Promise<unknown>, [UserUpdate]>(() =>
    Promise.resolve({}),
  );
  const transportSend = jest.fn(sendMail);
  const mail = new MailService({
    config: readMailConfig(env),
    createTransport: (): MailTransport => ({ sendMail: transportSend }),
    gapMs: 0,
  });
  const prisma = { client: { user: { update } } } as unknown as PrismaService;
  return {
    service: new CredentialsEmailService(prisma, mail),
    update,
    transportSend,
  };
}

const CONFIGURED = {
  MAIL_ENABLED: 'true',
  GMAIL_USER: 'ojt@school.example',
  GMAIL_APP_PASSWORD: 'abcdefghijklmnop',
  APP_PUBLIC_URL: 'http://192.168.1.10:3001',
};

const input: DeliverCredentialsInput = {
  userId: 'user-1',
  email: 'juan@example.com',
  name: 'Juan D. Mundo',
  role: 'STUDENT',
  username: 'juan.mundo',
  temporaryPassword: 'Xk7mPq2vRt',
  kind: 'CREATED',
};

describe('CredentialsEmailService', () => {
  it('records SENT with the time, and clears any earlier error', async () => {
    const { service, update } = setup(CONFIGURED, () => Promise.resolve());

    const before = Date.now();
    await expect(service.deliver(input)).resolves.toEqual({
      status: 'SENT',
      error: null,
    });

    expect(update).toHaveBeenCalledTimes(1);
    const { where, data } = update.mock.calls[0][0];
    expect(where).toEqual({ id: 'user-1' });
    expect(data.credentialsEmailStatus).toBe('SENT');
    expect(data.credentialsEmailError).toBeNull();
    expect(data.credentialsSentAt).toBeInstanceOf(Date);
    expect(data.credentialsSentAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('records FAILED with a short reason and no sent time', async () => {
    const { service, update } = setup(CONFIGURED, () =>
      Promise.reject(
        Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
      ),
    );

    const result = await service.deliver(input);
    expect(result.status).toBe('FAILED');

    const { data } = update.mock.calls[0][0];
    expect(data).toEqual({
      credentialsEmailStatus: 'FAILED',
      credentialsSentAt: null,
      credentialsEmailError: 'The connection to Gmail timed out.',
    });
  });

  it('records NOT_CONFIGURED when mail is off, without sending', async () => {
    const { service, update, transportSend } = setup(
      { MAIL_ENABLED: 'false' },
      () => Promise.resolve(),
    );

    await expect(service.deliver(input)).resolves.toMatchObject({
      status: 'NOT_CONFIGURED',
    });
    expect(transportSend).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toEqual({
      credentialsEmailStatus: 'NOT_CONFIGURED',
      credentialsSentAt: null,
      credentialsEmailError: 'Email is not configured',
    });
  });

  it('never writes the password, or anything but the three status columns', async () => {
    const { service, update } = setup(CONFIGURED, () =>
      Promise.reject(new Error('rejected while sending Xk7mPq2vRt')),
    );

    await service.deliver(input);

    const { data } = update.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual([
      'credentialsEmailError',
      'credentialsEmailStatus',
      'credentialsSentAt',
    ]);
    expect(JSON.stringify(data)).not.toContain('Xk7mPq2vRt');
  });

  it('uses the email as the login ID when the account has no username', async () => {
    const { service, transportSend } = setup(CONFIGURED, () =>
      Promise.resolve(),
    );

    await service.deliver({ ...input, username: null });

    const [message] = transportSend.mock.calls[0] as unknown as [
      { text: string },
    ];
    expect(message.text).toContain('Login ID: juan@example.com');
  });
});

describe('credentialsEmailColumns', () => {
  const now = new Date('2026-10-13T02:00:00.000Z');

  it('sets the sent time only for SENT', () => {
    expect(
      credentialsEmailColumns({ status: 'SENT', error: null }, now),
    ).toEqual({
      credentialsEmailStatus: 'SENT',
      credentialsSentAt: now,
      credentialsEmailError: null,
    });
    expect(
      credentialsEmailColumns({ status: 'FAILED', error: 'nope' }, now),
    ).toEqual({
      credentialsEmailStatus: 'FAILED',
      credentialsSentAt: null,
      credentialsEmailError: 'nope',
    });
  });
});
