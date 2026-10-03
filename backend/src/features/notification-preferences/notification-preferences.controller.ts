import { Body, Controller, Get, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotificationPreferencesService } from './notification-preferences.service';

function userIdOf(req: Request): string {
  if (!req.session) throw new UnauthorizedException('not authenticated');
  return req.session.userId;
}

@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@Controller('api')
export class NotificationPreferencesController {
  constructor(private readonly prefs: NotificationPreferencesService) {}

  @Get('notification-preferences')
  get(@Req() req: Request) {
    return this.prefs.get(userIdOf(req));
  }

  @Put('notification-preferences')
  update(@Req() req: Request, @Body() body: { orderAlerts?: unknown; messageAlerts?: unknown }) {
    return this.prefs.update(userIdOf(req), body ?? {});
  }

  @Get('notifications')
  feed(@Req() req: Request) {
    return this.prefs.feed(userIdOf(req));
  }
}
