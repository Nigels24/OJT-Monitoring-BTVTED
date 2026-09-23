import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CourseService } from './course.service';
import { Roles, RolesGuard } from '../auth/roles.guard';

class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// A program can require OJT at more than one year level (e.g. a 3rd-year
// practicum and a 4th-year internship) — this is one of those requirements,
// not the whole set, which is why it nests under a specific course.
class CreateRequirementDto {
  @IsInt()
  @Min(1)
  @Max(10)
  yearLevel!: number;

  @IsInt()
  @Min(0)
  requiredHours!: number;
}

@Controller('courses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CourseController {
  constructor(private courseService: CourseService) {}

  @Get()
  list() {
    return this.courseService.listCourses();
  }

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.courseService.createCourse(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courseService.updateCourse(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courseService.removeCourse(id);
  }

  @Post(':id/requirements')
  createRequirement(
    @Param('id') courseId: string,
    @Body() dto: CreateRequirementDto,
  ) {
    return this.courseService.createRequirement(courseId, dto);
  }
}
