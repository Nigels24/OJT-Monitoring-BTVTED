import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CourseService } from './course.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import {
  EmptyToNull,
  EmptyToUndefined,
  ToOptionalNumber,
} from '../common/transforms';

// "2025-2026", not a bare year — an OJT block can straddle two calendar years.
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/;
const ACADEMIC_YEAR_MESSAGE = 'academicYear must look like "2025-2026"';

class BlockQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  courseId?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  yearLevel?: number;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  academicYear?: string;
}

class CreateBlockDto {
  @IsString()
  @IsNotEmpty()
  courseId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  yearLevel!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Matches(ACADEMIC_YEAR_PATTERN, { message: ACADEMIC_YEAR_MESSAGE })
  academicYear!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  coordinatorId?: string;
}

class UpdateBlockDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  yearLevel?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Matches(ACADEMIC_YEAR_PATTERN, { message: ACADEMIC_YEAR_MESSAGE })
  academicYear?: string;

  // EmptyToNull, not EmptyToUndefined: a coordinator un-assigning themself (or
  // reassigning the block to nobody) has to persist as cleared, matching how
  // every other nullable relation in this app is edited.
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @IsNotEmpty()
  coordinatorId?: string | null;
}

@Controller('blocks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class BlockController {
  constructor(private courseService: CourseService) {}

  @Get()
  list(@Query() query: BlockQueryDto) {
    return this.courseService.listBlocks(query);
  }

  @Post()
  create(@Body() dto: CreateBlockDto) {
    return this.courseService.createBlock(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBlockDto) {
    return this.courseService.updateBlock(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courseService.removeBlock(id);
  }
}
