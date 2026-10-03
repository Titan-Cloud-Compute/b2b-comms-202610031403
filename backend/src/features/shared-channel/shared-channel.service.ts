import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject, filter, from, map, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/** Roles allowed to act as a vendor and create shared channels. */
export const VENDOR_ROLES: readonly string[] = ['MANAGER', 'ADMIN'];

export interface ChannelMessageDto {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: Date;
}

export interface ChannelStreamEvent {
  data: ChannelMessageDto;
}

@Injectable()
export class SharedChannelService {
  /** In-process fan-out bus for real-time message delivery (SSE). */
  private readonly bus = new Subject<ChannelMessageDto>();

  constructor(private readonly prisma: PrismaService) {}

  /** Throws 404 when the channel does not exist or the caller is not a member. */
  async assertMember(channelId: string, userId: string): Promise<void> {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) throw new NotFoundException('channel not found');
  }

  async listChannels(userId: string) {
    const channels = await this.prisma.sharedChannel.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      createdById: c.createdById,
      createdAt: c.createdAt,
      members: c.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        email: m.user.email,
      })),
    }));
  }

  /** Customers a vendor can add: users with the USER role. */
  async listCustomers() {
    const users = await this.prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
    });
    return users;
  }

  async createChannel(
    creator: { userId: string; role: string },
    input: { name?: unknown; customerIds?: unknown },
  ) {
    if (!VENDOR_ROLES.includes(creator.role)) {
      throw new ForbiddenException('only vendors can create shared channels');
    }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new BadRequestException('name is required');
    const rawIds = Array.isArray(input.customerIds) ? input.customerIds : [];
    const customerIds = [
      ...new Set(rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0)),
    ].filter((id) => id !== creator.userId);
    if (customerIds.length === 0) {
      throw new BadRequestException('at least one customer is required');
    }
    const customers = await this.prisma.user.findMany({
      where: { id: { in: customerIds }, role: 'USER' },
      select: { id: true },
    });
    if (customers.length !== customerIds.length) {
      throw new BadRequestException('unknown customer id');
    }
    const channel = await this.prisma.sharedChannel.create({
      data: {
        name,
        createdById: creator.userId,
        members: {
          create: [
            { userId: creator.userId, role: 'VENDOR' as const },
            ...customerIds.map((userId) => ({ userId, role: 'CUSTOMER' as const })),
          ],
        },
      },
    });
    // Customer profile rows for each added customer (idempotent).
    for (const userId of customerIds) {
      await this.prisma.customer.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    }
    return channel;
  }

  async listMessages(channelId: string, userId: string): Promise<ChannelMessageDto[]> {
    await this.assertMember(channelId, userId);
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: { author: { select: { name: true, email: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      authorId: r.authorId,
      authorName: r.author.name ?? r.author.email,
      body: r.body,
      createdAt: r.createdAt,
    }));
  }

  async postMessage(channelId: string, userId: string, input: { body?: unknown }) {
    await this.assertMember(channelId, userId);
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if (!body) throw new BadRequestException('body is required');
    if (body.length > 5000) throw new BadRequestException('body too long');
    const row = await this.prisma.message.create({
      data: { channelId, authorId: userId, body },
      include: { author: { select: { name: true, email: true } } },
    });
    const dto: ChannelMessageDto = {
      id: row.id,
      channelId: row.channelId,
      authorId: row.authorId,
      authorName: row.author.name ?? row.author.email,
      body: row.body,
      createdAt: row.createdAt,
    };
    this.bus.next(dto);
    return dto;
  }

  /** Real-time stream of new messages for one channel (membership-checked). */
  stream(channelId: string, userId: string): Observable<ChannelStreamEvent> {
    return from(this.assertMember(channelId, userId)).pipe(
      switchMap(() => this.bus.pipe(filter((m) => m.channelId === channelId))),
      map((m) => ({ data: m })),
    );
  }
}
