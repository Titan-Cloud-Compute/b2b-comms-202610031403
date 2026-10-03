import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { SessionPayload } from '../../auth/session.types';
import { ChannelStreamEvent, SharedChannelService } from './shared-channel.service';

function sessionOf(req: Request): SessionPayload {
  if (!req.session) throw new UnauthorizedException('not authenticated');
  return req.session;
}

@ApiTags('channels')
@UseGuards(JwtAuthGuard)
@Controller('api/channels')
export class SharedChannelController {
  constructor(private readonly channels: SharedChannelService) {}

  @Get()
  list(@Req() req: Request) {
    return this.channels.listChannels(sessionOf(req).userId);
  }

  @Get('customers')
  customers(@Req() req: Request) {
    sessionOf(req);
    return this.channels.listCustomers();
  }

  @Post()
  create(@Req() req: Request, @Body() body: { name?: unknown; customerIds?: unknown }) {
    const s = sessionOf(req);
    return this.channels.createChannel({ userId: s.userId, role: s.role }, body ?? {});
  }

  @Get(':id/messages')
  messages(@Req() req: Request, @Param('id') id: string) {
    return this.channels.listMessages(id, sessionOf(req).userId);
  }

  @Post(':id/messages')
  post(@Req() req: Request, @Param('id') id: string, @Body() body: { body?: unknown }) {
    return this.channels.postMessage(id, sessionOf(req).userId, body ?? {});
  }

  @Sse(':id/stream')
  stream(@Req() req: Request, @Param('id') id: string): Observable<ChannelStreamEvent> {
    return this.channels.stream(id, sessionOf(req).userId);
  }
}
