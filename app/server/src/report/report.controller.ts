import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { ReportService } from './report.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToUndefined } from '../common/transforms';
import { StudentFiltersQueryDto } from '../common/student-filters.dto';

/**
 * Which placement. Optional only for a student, who defaults to their own
 * current one; a supervisor or coordinator must name it (the service says so).
 */
class PlacementQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  assignmentId?: string;
}

class DtrQueryDto extends PlacementQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must look like "2026-10"',
  })
  month!: string;
}

class AttendanceSummaryQueryDto extends PlacementQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  from?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  to?: string;
}

/**
 * Bare `/reports`, no class-level `@Roles(...)` — the same deliberate
 * exception `/messages` makes (CLAUDE.md §5). A placement report is the same
 * resource for all three roles; who may read which placement is re-derived
 * per request inside `ReportService.resolvePlacement`, from the JWT and the
 * database, never from the query string. The one coordinator-only report
 * carries its own `@Roles`.
 *
 * Every route is a GET: reports only read.
 */
@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReportController {
  constructor(private reports: ReportService) {}

  /** The Civil Service Form No. 48 daily time record for one month. */
  @Get('dtr')
  dtr(@Req() req: AuthedRequest, @Query() query: DtrQueryDto) {
    return this.reports.dtr(req.user, query.assignmentId, query.month);
  }

  @Get('attendance')
  attendanceSummary(
    @Req() req: AuthedRequest,
    @Query() query: AttendanceSummaryQueryDto,
  ) {
    return this.reports.attendanceSummary(req.user, query.assignmentId, query);
  }

  @Get('progress')
  progress(@Req() req: AuthedRequest, @Query() query: PlacementQueryDto) {
    return this.reports.progress(req.user, query.assignmentId);
  }

  @Get('journal')
  journal(@Req() req: AuthedRequest, @Query() query: PlacementQueryDto) {
    return this.reports.journal(req.user, query.assignmentId);
  }

  @Get('assessment')
  assessment(@Req() req: AuthedRequest, @Query() query: PlacementQueryDto) {
    return this.reports.assessment(req.user, query.assignmentId);
  }

  /** The program/block summary for the same filters the Students list takes. */
  @Get('summary')
  @Roles('COORDINATOR')
  summary(@Req() req: AuthedRequest, @Query() query: StudentFiltersQueryDto) {
    return this.reports.summary(req.user.userId, query);
  }
}
