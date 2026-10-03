import { Body, Controller, Get, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireAdmin } from '../../auth/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CustomerInviteService } from './customer-invite.service';

@ApiTags('customer-invites')
@Controller('api/customer-invites')
export class CustomerInviteController {
  constructor(private readonly invites: CustomerInviteService) {}

  /** ADMIN only — JwtAuthGuard + RolesGuard are global APP_GUARDs. */
  @RequireAdmin()
  @Post()
  invite(@Req() req: Request, @Body() body: { email?: unknown; companyName?: unknown }) {
    if (!req.session) throw new UnauthorizedException('not authenticated');
    return this.invites.invite(req.session.userId, body ?? {});
  }

  @Public()
  @Get('check')
  check(@Query('token') token: string) {
    return this.invites.check(token);
  }

  @Public()
  @Post('accept')
  accept(@Body() body: { token?: unknown; name?: unknown; password?: unknown }) {
    return this.invites.accept(body ?? {});
  }
}
