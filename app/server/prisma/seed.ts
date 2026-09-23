import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Bootstraps the single account the system cannot create for itself.
 *
 * The coordinator is the root of the account tree: they create every student
 * and supervisor through the app, and those accounts get their username and
 * password issued by hand at that point. So this seed deliberately creates
 * *only* the coordinator — no sample students, supervisors or establishments.
 * (The prototype's login page advertises three demo logins; those are a mock-up
 * device, not a description of how accounts really come to exist.)
 *
 * Safe to re-run: if the coordinator already exists this is a no-op. It never
 * overwrites an existing password, and never deletes anything.
 */
const COORDINATOR = {
  email: process.env.SEED_COORDINATOR_EMAIL ?? 'coordinator@wphi.edu',
  username: process.env.SEED_COORDINATOR_USERNAME ?? 'coordinator',
  name: process.env.SEED_COORDINATOR_NAME ?? 'Admin Coordinator',
  password: process.env.SEED_COORDINATOR_PASSWORD ?? 'admin123',
};

async function seedCoordinator() {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: COORDINATOR.email }, { username: COORDINATOR.username }],
    },
  });

  if (existing) {
    console.log(
      `Coordinator "${existing.username ?? existing.email}" already exists — nothing to do.`,
    );
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: COORDINATOR.email,
      username: COORDINATOR.username,
      password: await bcrypt.hash(COORDINATOR.password, 10),
      name: COORDINATOR.name,
      role: 'COORDINATOR',
      coordinatorProfile: { create: {} },
    },
  });

  console.log('Created the bootstrap coordinator:');
  console.log(`  username  ${user.username}`);
  console.log(`  email     ${user.email}`);
  console.log(`  password  ${COORDINATOR.password}`);
  console.log(
    '\nSign in as this account to create the establishments, supervisors and students.',
  );
  if (!process.env.SEED_COORDINATOR_PASSWORD) {
    console.log(
      'This is the default password — change it, or set SEED_COORDINATOR_PASSWORD before seeding.',
    );
  }
}

/**
 * Bootstraps the one course program this school runs OJT for, plus its
 * current requirement and blocks. Unlike sample students/supervisors/
 * establishments (still deliberately not seeded — see `seedCoordinator`'s
 * comment), this is real reference data the coordinator needs before they can
 * record a TrainingAssignment at all, so it belongs in the seed rather than
 * behind a "create course" UI that doesn't exist yet.
 *
 * Safe to re-run: every row is `upsert`ed on its own unique key (Course.code;
 * CourseRequirement's (courseId, yearLevel); Block's (courseId, yearLevel,
 * name, academicYear)) rather than skipped once the course exists, so
 * re-running after adding a block name here, or after a real coordinator has
 * since created more courses by hand, still converges instead of being a
 * silent no-op. `update: {}` on every upsert — an existing row is never
 * overwritten, only created if missing, matching `seedCoordinator`'s "never
 * overwrites, never deletes" rule.
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

async function seedCourse() {
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
    await prisma.block.upsert({
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
  }

  console.log(
    `Course "${course.code}" ready: year ${COURSE.yearLevel} requires ${COURSE.requiredHours}h (placeholder, see TODO), blocks ${COURSE.blockNames.join(', ')} for ${COURSE.academicYear}.`,
  );
}

async function main() {
  await seedCoordinator();
  await seedCourse();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
