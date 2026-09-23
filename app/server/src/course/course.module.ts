import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { CourseRequirementController } from './course-requirement.controller';
import { BlockController } from './block.controller';
import { CourseService } from './course.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CourseController, CourseRequirementController, BlockController],
  providers: [CourseService],
})
export class CourseModule {}
