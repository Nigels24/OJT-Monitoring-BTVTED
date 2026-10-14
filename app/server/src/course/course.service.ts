import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CourseInput {
  code?: string;
  name?: string;
  isActive?: boolean;
}

interface RequirementInput {
  yearLevel?: number;
  requiredHours?: number;
}

interface BlockInput {
  courseId?: string;
  yearLevel?: number;
  name?: string;
  academicYear?: string;
  /** `null` clears the block's coordinator; `undefined` leaves it unchanged. */
  coordinatorId?: string | null;
}

interface BlockFilter {
  courseId?: string;
  yearLevel?: number;
  academicYear?: string;
}

// Not `as const`: Prisma's multi-field `orderBy` wants a mutable array, which
// a `readonly [...]` tuple (what `as const` would produce here) is not
// assignable to.
const BLOCK_INCLUDE = {
  course: { select: { id: true, code: true, name: true } },
  coordinator: {
    select: { id: true, user: { select: { name: true } } },
  },
  _count: { select: { students: true, trainingAssignments: true } },
} as const;

// A course's nested blocks carry the same coordinator and counts as
// `GET /blocks`: the course detail dialog renders its Blocks table from this
// relation, so without them a saved coordinator reads as "Unassigned".
const COURSE_INCLUDE = {
  requirements: { orderBy: { yearLevel: 'asc' as const } },
  blocks: {
    include: {
      coordinator: BLOCK_INCLUDE.coordinator,
      _count: BLOCK_INCLUDE._count,
    },
    orderBy: [{ academicYear: 'desc' as const }, { name: 'asc' as const }],
  },
};

@Injectable()
export class CourseService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------------
  // Courses
  // ---------------------------------------------------------------------

  async listCourses() {
    return this.prisma.client.course.findMany({
      include: COURSE_INCLUDE,
      orderBy: { code: 'asc' },
    });
  }

  async createCourse(data: { code: string; name: string; isActive?: boolean }) {
    await this.assertCourseCodeAvailable(data.code);
    return this.prisma.client.course.create({ data });
  }

  async updateCourse(id: string, data: CourseInput) {
    await this.getCourseOrThrow(id);
    if (data.code) await this.assertCourseCodeAvailable(data.code, id);

    return this.prisma.client.course.update({ where: { id }, data });
  }

  /**
   * The schema restricts Course deletion at the DB level while any
   * CourseRequirement or Block references it (`onDelete: Restrict`) — that
   * would already stop this, but as a raw FK violation (500). Checking first
   * turns it into the same readable 409 the handoff asked for on Student and
   * Block references, which the DB does NOT enforce on its own (both of
   * those FKs are `SET NULL`).
   */
  async removeCourse(id: string) {
    await this.getCourseOrThrow(id);

    const [students, blocks, requirements, announcements] = await Promise.all([
      this.prisma.client.student.count({ where: { courseId: id } }),
      this.prisma.client.block.count({ where: { courseId: id } }),
      this.prisma.client.courseRequirement.count({ where: { courseId: id } }),
      // An announcement limited to this program: deleting the course would
      // either be refused by the FK or (were it SET NULL) widen its audience.
      this.prisma.client.announcement.count({ where: { courseId: id } }),
    ]);

    const blockers: string[] = [];
    if (students > 0) blockers.push(`${students} student(s)`);
    if (blocks > 0) blockers.push(`${blocks} block(s)`);
    if (requirements > 0) blockers.push(`${requirements} requirement(s)`);
    if (announcements > 0) {
      blockers.push(`${announcements} announcement(s)`);
    }

    if (blockers.length > 0) {
      throw new ConflictException(
        `This course has ${blockers.join(', ')} and cannot be deleted. Set it to Inactive instead.`,
      );
    }

    await this.prisma.client.course.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------------
  // Course requirements
  // ---------------------------------------------------------------------

  async createRequirement(
    courseId: string,
    data: { yearLevel: number; requiredHours: number },
  ) {
    await this.getCourseOrThrow(courseId);
    await this.assertRequirementYearLevelAvailable(courseId, data.yearLevel);

    return this.prisma.client.courseRequirement.create({
      data: { courseId, ...data },
    });
  }

  async updateRequirement(id: string, data: RequirementInput) {
    const requirement = await this.prisma.client.courseRequirement.findUnique({
      where: { id },
    });
    if (!requirement) {
      throw new NotFoundException('Course requirement not found');
    }

    if (
      data.yearLevel !== undefined &&
      data.yearLevel !== requirement.yearLevel
    ) {
      await this.assertRequirementYearLevelAvailable(
        requirement.courseId,
        data.yearLevel,
        id,
      );
    }

    return this.prisma.client.courseRequirement.update({
      where: { id },
      data,
    });
  }

  /**
   * `TrainingAssignment.courseRequirementId` is `SET NULL` on delete, so the
   * database alone would silently detach every assignment that pointed here.
   * The handoff wants that blocked instead — a requirement stays traceable
   * from the assignments it produced.
   */
  async removeRequirement(id: string) {
    const requirement = await this.prisma.client.courseRequirement.findUnique({
      where: { id },
    });
    if (!requirement) {
      throw new NotFoundException('Course requirement not found');
    }

    const assignments = await this.prisma.client.trainingAssignment.count({
      where: { courseRequirementId: id },
    });
    if (assignments > 0) {
      throw new ConflictException(
        `This requirement has ${assignments} training assignment(s) referencing it and cannot be deleted.`,
      );
    }

    await this.prisma.client.courseRequirement.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------------
  // Blocks
  // ---------------------------------------------------------------------

  async listBlocks(filter: BlockFilter) {
    return this.prisma.client.block.findMany({
      where: {
        courseId: filter.courseId,
        yearLevel: filter.yearLevel,
        academicYear: filter.academicYear,
      },
      include: BLOCK_INCLUDE,
      orderBy: [{ academicYear: 'desc' }, { name: 'asc' }],
    });
  }

  async createBlock(data: {
    courseId: string;
    yearLevel: number;
    name: string;
    academicYear: string;
    coordinatorId?: string;
  }) {
    await this.getCourseOrThrow(data.courseId);
    if (data.coordinatorId) {
      await this.getCoordinatorOrThrow(data.coordinatorId);
    }
    await this.assertBlockKeyAvailable(
      data.courseId,
      data.yearLevel,
      data.name,
      data.academicYear,
    );

    return this.prisma.client.block.create({
      data,
      include: BLOCK_INCLUDE,
    });
  }

  async updateBlock(id: string, data: BlockInput) {
    const block = await this.prisma.client.block.findUnique({ where: { id } });
    if (!block) {
      throw new NotFoundException('Block not found');
    }
    if (data.coordinatorId) {
      await this.getCoordinatorOrThrow(data.coordinatorId);
    }

    const nextKey = {
      yearLevel: data.yearLevel ?? block.yearLevel,
      name: data.name ?? block.name,
      academicYear: data.academicYear ?? block.academicYear,
    };
    const keyChanged =
      nextKey.yearLevel !== block.yearLevel ||
      nextKey.name !== block.name ||
      nextKey.academicYear !== block.academicYear;
    if (keyChanged) {
      await this.assertBlockKeyAvailable(
        block.courseId,
        nextKey.yearLevel,
        nextKey.name,
        nextKey.academicYear,
        id,
      );
    }

    return this.prisma.client.block.update({
      where: { id },
      data,
      include: BLOCK_INCLUDE,
    });
  }

  /**
   * `Student.blockId` and `TrainingAssignment.blockId` are both `SET NULL` on
   * delete — again the DB would allow this silently. The handoff wants a 409
   * instead, so a block with a live cohort on it can't be deleted out from
   * under them.
   */
  async removeBlock(id: string) {
    const block = await this.prisma.client.block.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!block) {
      throw new NotFoundException('Block not found');
    }

    const [students, assignments, announcements] = await Promise.all([
      this.prisma.client.student.count({ where: { blockId: id } }),
      this.prisma.client.trainingAssignment.count({ where: { blockId: id } }),
      // See removeCourse: an announcement limited to this block blocks it.
      this.prisma.client.announcement.count({ where: { blockId: id } }),
    ]);

    const blockers: string[] = [];
    if (students > 0) blockers.push(`${students} student(s)`);
    if (assignments > 0) blockers.push(`${assignments} training assignment(s)`);
    if (announcements > 0) {
      blockers.push(`${announcements} announcement(s)`);
    }

    if (blockers.length > 0) {
      throw new ConflictException(
        `This block has ${blockers.join(', ')} referencing it and cannot be deleted.`,
      );
    }

    await this.prisma.client.block.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------------
  // Shared lookups
  // ---------------------------------------------------------------------

  private async getCourseOrThrow(id: string) {
    const course = await this.prisma.client.course.findUnique({
      where: { id },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private async getCoordinatorOrThrow(id: string) {
    const coordinator = await this.prisma.client.coordinator.findUnique({
      where: { id },
    });
    if (!coordinator) {
      throw new BadRequestException(
        'coordinatorId does not match a coordinator',
      );
    }
    return coordinator;
  }

  private async assertCourseCodeAvailable(code: string, excludeId?: string) {
    const clash = await this.prisma.client.course.findUnique({
      where: { code },
      select: { id: true },
    });
    if (clash && clash.id !== excludeId) {
      throw new ConflictException(`Course code "${code}" is already in use`);
    }
  }

  private async assertRequirementYearLevelAvailable(
    courseId: string,
    yearLevel: number,
    excludeId?: string,
  ) {
    const clash = await this.prisma.client.courseRequirement.findUnique({
      where: { courseId_yearLevel: { courseId, yearLevel } },
      select: { id: true },
    });
    if (clash && clash.id !== excludeId) {
      throw new ConflictException(
        `This course already has a requirement for year ${yearLevel}`,
      );
    }
  }

  private async assertBlockKeyAvailable(
    courseId: string,
    yearLevel: number,
    name: string,
    academicYear: string,
    excludeId?: string,
  ) {
    const clash = await this.prisma.client.block.findUnique({
      where: {
        courseId_yearLevel_name_academicYear: {
          courseId,
          yearLevel,
          name,
          academicYear,
        },
      },
      select: { id: true },
    });
    if (clash && clash.id !== excludeId) {
      throw new ConflictException(
        `"${name}" already exists for this course, year and academic year`,
      );
    }
  }
}
