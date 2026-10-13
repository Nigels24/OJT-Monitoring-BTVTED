import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ConcernService } from './concern.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';

export const CONCERN_CATEGORIES = [
  'CONDUCT',
  'PERFORMANCE',
  'ATTENDANCE',
  'OTHER',
] as const;

/**
 * `studentId`, `raisedById` and `status` are absent on purpose: the server
 * derives the first two from the assignment and the JWT, and a concern is
 * always born OPEN. `forbidNonWhitelisted` rejects a body that supplies them.
 */
class RaiseConcernDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsIn(CONCERN_CATEGORIES)
  category!: (typeof CONCERN_CATEGORIES)[number];

  // Required and not trivially short: a concern with no explanation gives the
  // coordinator nothing to act on — the same rule as a decline reason.
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;
}

@Controller('supervisor/concerns')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPERVISOR')
export class SupervisorConcernController {
  constructor(private concerns: ConcernService) {}

  @Post()
  raise(@Req() req: AuthedRequest, @Body() dto: RaiseConcernDto) {
    return this.concerns.raise(req.user.userId, dto);
  }

  /** The concerns this supervisor raised, with their status and response. */
  @Get()
  listMine(@Req() req: AuthedRequest) {
    return this.concerns.listMine(req.user.userId);
  }
}
