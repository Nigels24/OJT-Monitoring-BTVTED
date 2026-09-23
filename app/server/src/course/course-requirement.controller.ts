import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CourseService } from './course.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class UpdateRequirementDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  yearLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredHours?: number;
}

// Creation nests under a course (`POST /courses/:id/requirements`, in
// CourseController) because a requirement always belongs to one; edit and
// delete don't need that context, so they get their own flat prefix.
@Controller('course-requirements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CourseRequirementController {
  constructor(private courseService: CourseService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRequirementDto) {
    return this.courseService.updateRequirement(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courseService.removeRequirement(id);
  }
}
