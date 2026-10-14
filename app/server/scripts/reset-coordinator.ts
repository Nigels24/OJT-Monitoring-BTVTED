import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/**
 * Recovers a locked-out coordinator.
 *
 * The coordinator is the root account: they reset everyone else's password
 * through the app, but nobody inside the app can reset theirs. This script is
 * that escape hatch, and it deliberately lives on the command line — running it
 * requires the database credentials in `.env`, which is authority enough. There
 * is no web-reachable equivalent, by design.
 *
 *   npm run reset-coordinator                          # generates a password
 *   npm run reset-coordinator -- 'my-new-password'
 *   npm run reset-coordinator -- 'my-new-password' coordinator@wphi.edu
 *
 * The second argument (username or email) is only needed when more than one
 * coordinator exists.
 */

const MIN_LENGTH = 8;

const prisma = new PrismaClient();

async function main() {
  const [passwordArg, identifierArg] = process.argv.slice(2);

  // Checked before anything is read or written, and against `undefined` rather
  // than truthiness: `''` is falsy, so it used to skip the length check below
  // and then survive `??` as the new password. Only a missing argument means
  // "generate one".
  if (passwordArg !== undefined && passwordArg.trim() === '') {
    throw new Error(
      'The password cannot be empty or only spaces. Leave the argument out to have one generated.',
    );
  }

  const coordinators = await prisma.user.findMany({
    where: { role: 'COORDINATOR' },
    select: { id: true, email: true, username: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (coordinators.length === 0) {
    throw new Error(
      'No coordinator account exists. Run `npm run seed` to create one.',
    );
  }

  let target = coordinators[0];

  if (identifierArg) {
    const found = coordinators.find(
      (c) => c.email === identifierArg || c.username === identifierArg,
    );
    if (!found) {
      throw new Error(
        `No coordinator matches "${identifierArg}". Known: ${coordinators
          .map((c) => c.username ?? c.email)
          .join(', ')}`,
      );
    }
    target = found;
  } else if (coordinators.length > 1) {
    throw new Error(
      `${coordinators.length} coordinators exist — pass one as the second argument: ` +
        coordinators.map((c) => c.username ?? c.email).join(', '),
    );
  }

  if (passwordArg !== undefined && passwordArg.length < MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_LENGTH} characters (the app enforces the same).`,
    );
  }

  // A generated password is safer than a memorable one typed into shell
  // history; it's meant to be changed from inside the app straight after.
  const password = passwordArg ?? `ojt-${randomBytes(6).toString('hex')}`;

  await prisma.user.update({
    where: { id: target.id },
    data: {
      password: await bcrypt.hash(password, 10),
      // Only a generated password forces the change-on-next-login flow — an
      // operator who passed their own password on the command line already
      // made a deliberate choice, same as a coordinator typing one into the
      // student/supervisor create form instead of leaving it blank.
      mustChangePassword: passwordArg === undefined,
    },
  });

  console.log(`Password reset for ${target.name}:`);
  console.log(
    `  username  ${target.username ?? '(none — sign in with email)'}`,
  );
  console.log(`  email     ${target.email}`);
  console.log(`  password  ${password}`);
  if (passwordArg === undefined) {
    console.log(
      '\nThis password was generated. Sign in and change it from the sidebar.',
    );
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
