import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { generateTemporaryPassword } from '../src/common/temp-password';
import { DOCUMENT_REQUIREMENT_SEED } from '../src/common/document-requirements';

const prisma = new PrismaClient();

/**
 * Bootstraps the accounts the system cannot create for itself.
 *
 * Coordinators create every student and supervisor through the app, and
 * those accounts get their username and password issued at that point (Step
 * 4). So this seed deliberately creates only coordinators — no sample
 * students, supervisors or establishments. (The prototype's login page
 * advertises three demo logins; those are a mock-up device, not a
 * description of how accounts really come to exist.)
 *
 * Two coordinators, one per block (Step 5, "two coordinators, one per
 * block"): the first is the known bootstrap account with a fixed,
 * documented password (`mustChangePassword: false` — see its own comment
 * below for why); the second is created the same way `createSupervisor`/
 * `createStudent` create an account with no password supplied — a
 * system-generated temporary one, printed once here, `mustChangePassword:
 * true`.
 *
 * Safe to re-run: each coordinator is a no-op if it already exists. Nothing
 * here ever overwrites an existing password or deletes anything.
 */
const COORDINATOR = {
  email: process.env.SEED_COORDINATOR_EMAIL ?? 'coordinator@wphi.edu',
  username: process.env.SEED_COORDINATOR_USERNAME ?? 'coordinator',
  name: process.env.SEED_COORDINATOR_NAME ?? 'Admin Coordinator',
  password: process.env.SEED_COORDINATOR_PASSWORD ?? 'admin123',
};

const COORDINATOR_2 = {
  email: process.env.SEED_COORDINATOR2_EMAIL ?? 'coordinator2@wphi.edu',
  username: process.env.SEED_COORDINATOR2_USERNAME ?? 'coordinator2',
  name: process.env.SEED_COORDINATOR2_NAME ?? 'Block B Coordinator',
};

/**
 * Creates one coordinator if none of `email`/`username` already exist, and
 * returns their `Coordinator.id` either way — the caller needs it to assign
 * a Block below, whether this run created the row or found it already there.
 */
async function seedCoordinator(config: {
  email: string;
  username: string;
  name: string;
  /** Fixed password, `mustChangePassword: false`. Omit for a generated,
   * `mustChangePassword: true` one — the Step-4 create-account shape. */
  password?: string;
  label: string;
}): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: config.email }, { username: config.username }] },
    include: { coordinatorProfile: true },
  });

  if (existing) {
    console.log(
      `Coordinator "${existing.username ?? existing.email}" already exists — nothing to do.`,
    );
    if (!existing.coordinatorProfile) {
      // Not expected in practice (nothing else creates a COORDINATOR-role
      // user), but a missing profile here would otherwise fail silently
      // three lines later at the block assignment.
      throw new Error(
        `User "${existing.username ?? existing.email}" has role COORDINATOR but no coordinatorProfile.`,
      );
    }
    return existing.coordinatorProfile.id;
  }

  const generatedPassword = config.password ? null : generateTemporaryPassword();
  const password = config.password ?? generatedPassword!;

  const user = await prisma.user.create({
    data: {
      email: config.email,
      username: config.username,
      password: await bcrypt.hash(password, 10),
      name: config.name,
      role: 'COORDINATOR',
      // A fixed, documented bootstrap password (this file, or
      // SEED_COORDINATOR_*) shouldn't force the standalone /change-password
      // flow on first sign-in — `mustChangePassword` defaults to true, which
      // is right for every account the app itself creates, just not this
      // known one. A generated password (no `config.password`) is the
      // opposite case: same as a coordinator leaving the password field
      // blank when creating a student/supervisor, so it keeps the default.
      mustChangePassword: generatedPassword !== null,
      coordinatorProfile: { create: {} },
    },
    include: { coordinatorProfile: true },
  });

  console.log(`Created ${config.label}:`);
  console.log(`  username  ${user.username}`);
  console.log(`  email     ${user.email}`);
  console.log(`  password  ${password}`);
  if (generatedPassword !== null) {
    console.log(
      '  This password was generated and is shown once — it will be asked to change on first sign-in.',
    );
  } else if (!process.env.SEED_COORDINATOR_PASSWORD) {
    console.log(
      '  This is the default password — change it, or set SEED_COORDINATOR_PASSWORD before seeding.',
    );
  }

  return user.coordinatorProfile!.id;
}

/**
 * Bootstraps the one course program this school runs OJT for, plus its
 * current requirement and blocks, then assigns each block to its
 * coordinator (Step 5) if it doesn't already have one.
 *
 * Safe to re-run: every row is `upsert`ed on its own unique key (Course.code;
 * CourseRequirement's (courseId, yearLevel); Block's (courseId, yearLevel,
 * name, academicYear)) rather than skipped once the course exists, so
 * re-running after adding a block name here, or after a real coordinator has
 * since created more courses by hand, still converges instead of being a
 * silent no-op. `update: {}` on every upsert — an existing row is never
 * overwritten, only created if missing, matching `seedCoordinator`'s "never
 * overwrites, never deletes" rule. The block-to-coordinator assignment
 * follows the same rule: only a block with no coordinator yet is assigned,
 * so re-running this after a real coordinator has reassigned a block by hand
 * never stomps on that.
 *
 * TODO: 486 required hours for BTVTED-CHS year 4 is a placeholder — confirm
 * the real figure with the program handbook and correct CourseRequirement
 * before this is relied on for a real cohort.
 */
const COURSE = {
  code: 'BTVTED-CHS',
  name: 'Bachelor in Technical-Vocational Teacher Education major in Computer Hardware Servicing',
  yearLevel: 4,
  requiredHours: 486, // TODO: placeholder, confirm against the program handbook
  academicYear: '2025-2026',
  blockNames: ['Block A', 'Block B'],
};

async function seedCourse(blockCoordinatorId: Record<string, string>) {
  const course = await prisma.course.upsert({
    where: { code: COURSE.code },
    create: { code: COURSE.code, name: COURSE.name },
    update: {},
  });

  await prisma.courseRequirement.upsert({
    where: {
      courseId_yearLevel: { courseId: course.id, yearLevel: COURSE.yearLevel },
    },
    create: {
      courseId: course.id,
      yearLevel: COURSE.yearLevel,
      requiredHours: COURSE.requiredHours,
    },
    update: {},
  });

  for (const name of COURSE.blockNames) {
    const block = await prisma.block.upsert({
      where: {
        courseId_yearLevel_name_academicYear: {
          courseId: course.id,
          yearLevel: COURSE.yearLevel,
          name,
          academicYear: COURSE.academicYear,
        },
      },
      create: {
        courseId: course.id,
        yearLevel: COURSE.yearLevel,
        name,
        academicYear: COURSE.academicYear,
      },
      update: {},
    });

    const coordinatorId = blockCoordinatorId[name];
    if (coordinatorId && !block.coordinatorId) {
      await prisma.block.update({
        where: { id: block.id },
        data: { coordinatorId },
      });
      console.log(`Assigned "${name}" to its coordinator.`);
    }
  }

  console.log(
    `Course "${course.code}" ready: year ${COURSE.yearLevel} requires ${COURSE.requiredHours}h (placeholder, see TODO), blocks ${COURSE.blockNames.join(', ')} for ${COURSE.academicYear}.`,
  );
}

/**
 * The six required documents of thesis Table 3.
 *
 * The `document_requirements` migration inserts these too, so this is normally a
 * no-op; it stays here so a database restored or branched without that
 * migration's data still converges, and so the list has one authority in code
 * (`src/common/document-requirements.ts`). Upserted on `code` with `update: {}`
 * — an existing row is never overwritten, matching the rest of this seed's
 * "never overwrites, never deletes" rule. That means renaming a requirement or
 * retiring it (`isActive: false`) is a coordinator's change to keep, not
 * something a re-seed undoes.
 */
async function seedDocumentRequirements() {
  for (const requirement of DOCUMENT_REQUIREMENT_SEED) {
    await prisma.documentRequirement.upsert({
      where: { code: requirement.code },
      create: requirement,
      update: {},
    });
  }
  console.log(
    `Document requirements ready: ${DOCUMENT_REQUIREMENT_SEED.map((r) => r.code).join(', ')}.`,
  );
}

async function main() {
  const coordinator1Id = await seedCoordinator({
    ...COORDINATOR,
    label: 'the bootstrap coordinator',
  });
  const coordinator2Id = await seedCoordinator({
    ...COORDINATOR_2,
    label: 'the second coordinator',
  });

  await seedCourse({
    'Block A': coordinator1Id,
    'Block B': coordinator2Id,
  });

  await seedDocumentRequirements();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
