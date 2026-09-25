import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { JournalService } from './journal.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToUndefined } from '../common/transforms';

class SupervisorJournalQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  studentId?: string;

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
 * Read-only by design (Table 1): a company supervisor witnesses the work and can
 * read what the trainee wrote about it, but the journal is reviewed by the
 * coordinator. There is deliberately no POST/PATCH/DELETE here.
 */
@Controller('supervisor/journals')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPERVISOR')
export class SupervisorJournalController {
  constructor(private journals: JournalService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: SupervisorJournalQueryDto) {
    return this.journals.listForSupervisor(req.user.userId, query);
  }

  @Get(':id')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.journals.getForSupervisor(req.user.userId, id);
  }
}
