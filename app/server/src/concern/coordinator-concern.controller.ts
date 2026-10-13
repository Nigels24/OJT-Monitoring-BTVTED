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
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConcernService } from './concern.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';
import { EmptyToNull, EmptyToUndefined } from '../common/transforms';

const CONCERN_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;

class ListConcernsQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['block', 'all'])
  scope?: 'block' | 'all';

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(CONCERN_STATUSES)
  status?: (typeof CONCERN_STATUSES)[number];

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  assignmentId?: string;
}

/** `respondedById`/`respondedAt` are stamped by the server, never sent. */
class RespondConcernDto {
  // Never OPEN: a concern does not go back to unseen.
  @IsIn(['ACKNOWLEDGED', 'RESOLVED'])
  status!: 'ACKNOWLEDGED' | 'RESOLVED';

  // Nullable column, so EmptyToNull: clearing the box clears the response.
  // Absent from the body still means "leave unchanged".
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(2000)
  response?: string | null;
}

@Controller('coordinator/concerns')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('COORDINATOR')
export class CoordinatorConcernController {
  constructor(private concerns: ConcernService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListConcernsQueryDto) {
    return this.concerns.listForCoordinator(req.user.userId, query);
  }

  /** The dashboard tile's count of OPEN concerns. */
  @Get('open-count')
  openCount(
    @Req() req: AuthedRequest,
    @Query('scope') scope?: 'block' | 'all',
  ) {
    return this.concerns.countOpen(
      req.user.userId,
      scope === 'all' ? 'all' : 'block',
    );
  }

  @Patch(':id')
  respond(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: RespondConcernDto,
  ) {
    return this.concerns.respond(req.user.userId, id, dto);
  }
}
