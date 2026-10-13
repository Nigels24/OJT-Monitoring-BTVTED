import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnnouncementService } from './announcement.service';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';

/**
 * Bare `/announcements` for the two roles that receive them. One controller,
 * not one per role prefix: the list is the same shape for a student and a
 * supervisor, and which announcements it holds is decided in the service from
 * the caller's own role, block and program — the same reasoning as
 * `/messages` and `/notifications` (CLAUDE.md §5). Coordinators manage
 * announcements under `/coordinator/announcements` instead.
 */
@Controller('announcements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('STUDENT', 'SUPERVISOR')
export class AnnouncementController {
  constructor(private announcements: AnnouncementService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.announcements.listForViewer(req.user.userId, req.user.role);
  }

  @Patch(':id/read')
  markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.announcements.markRead(req.user.userId, req.user.role, id);
  }
}
