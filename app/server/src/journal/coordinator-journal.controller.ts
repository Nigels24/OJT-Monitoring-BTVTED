import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { JournalStatus } from '../../generated/prisma/client';
import { JournalService } from './journal.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToUndefined, ToOptionalNumber } from '../common/transforms';

const JOURNAL_STATUSES = ['SUBMITTED', 'ACCEPTED', 'RETURNED'] as const;

/**
 * `scope=block` (the default) narrows the queue to the requesting coordinator's
 * own blocks — a view default, not an authorization boundary (Table 1: "own
 * block, all on request"), exactly as `ListStudentsQueryDto` does.
 */
class ListJournalsQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['block', 'all'])
  scope?: 'block' | 'all';

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(JOURNAL_STATUSES)
  status?: JournalStatus;

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
  blockId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  establishmentId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  from?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString()
  to?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class ReviewJournalDto {
  @IsIn(['ACCEPT', 'RETURN'])
  decision!: 'ACCEPT' | 'RETURN';

  // Required only on RETURN — same shape as the document review note. The
  // @ValidateIf skips every check below for an ACCEPT body.
  @ValidateIf((dto: ReviewJournalDto) => dto.decision === 'RETURN')
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  remarks?: string;
}

@Controller('coordinator/journals')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CoordinatorJournalController {
  constructor(private journals: JournalService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListJournalsQueryDto) {
    return this.journals.listForCoordinator(req.user.userId, query);
  }

  /**
   * The dashboard tile's count. Declared before `:id` — Nest matches handlers in
   * declaration order, so the literal path has to come first or this request
   * would be read as an entry whose id is "awaiting-count".
   */
  @Get('awaiting-count')
  awaitingCount(
    @Req() req: AuthedRequest,
    @Query('scope') scope?: 'block' | 'all',
  ) {
    return this.journals.countAwaitingReview(
      req.user.userId,
      scope === 'all' ? 'all' : 'block',
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.journals.getForCoordinator(id);
  }

  @Patch(':id/review')
  review(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ReviewJournalDto,
  ) {
    return this.journals.review(req.user.userId, id, dto.decision, dto.remarks);
  }
}
