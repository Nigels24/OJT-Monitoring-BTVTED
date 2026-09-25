import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification.service';
import { RolesGuard } from '../auth/roles.guard';
import { AuthedRequest } from '../auth/authed-request';

/**
 * Bare `/notifications`, no `@Roles(...)` — same reasoning as
 * MessagesController (CLAUDE.md §5): a notification is the same resource
 * shape for every role, and ownership is always re-derived from
 * `req.user.userId`, never trusted from a param.
 */
@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationController {
  constructor(private notifications: NotificationService) {}

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notifications.list(req.user.userId, {
      unreadOnly: unreadOnly === 'true',
      cursor,
    });
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthedRequest) {
    return this.notifications.unreadCount(req.user.userId);
  }

  @Patch(':id/read')
  markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.notifications.markRead(req.user.userId, id);
  }

  @Patch('read-all')
  markAllRead(@Req() req: AuthedRequest) {
    return this.notifications.markAllRead(req.user.userId);
  }
}
