/**
 * Story: shared-channel — API behaviour (membership scoping, vendor-only
 * create, real-time fan-out). Prisma is mocked; no database needed.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { firstValueFrom, take } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import { FEATURE_MODULES } from '../index';
import { SharedChannelController } from './shared-channel.controller';
import { SharedChannelModule } from './shared-channel.module';
import { SharedChannelService } from './shared-channel.service';

type Member = { channelId: string; userId: string; role: string };

function makePrisma() {
  const members: Member[] = [
    { channelId: 'c1', userId: 'vendor', role: 'VENDOR' },
    { channelId: 'c1', userId: 'cust', role: 'CUSTOMER' },
  ];
  const prisma = {
    channelMember: {
      findUnique: jest.fn(async ({ where }: { where: { channelId_userId: { channelId: string; userId: string } } }) =>
        members.find(
          (m) =>
            m.channelId === where.channelId_userId.channelId &&
            m.userId === where.channelId_userId.userId,
        ) ?? null,
      ),
    },
    sharedChannel: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: { name: string; createdById: string } }) => ({
        id: 'c2',
        name: data.name,
        createdById: data.createdById,
        createdAt: new Date(),
      })),
    },
    user: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) =>
        (where.id?.in ?? []).filter((id) => id.startsWith('cust')).map((id) => ({ id })),
      ),
    },
    customer: { upsert: jest.fn(async () => ({})) },
    message: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: { channelId: string; authorId: string; body: string } }) => ({
        id: 'm1',
        ...data,
        createdAt: new Date(),
        author: { name: 'Cust', email: 'cust@x' },
      })),
    },
  };
  return prisma;
}

describe('shared-channel API', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: SharedChannelService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new SharedChannelService(prisma as unknown as PrismaService);
  });

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(SharedChannelModule);
  });

  it('controller is JWT guarded and mounted at api/channels', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SharedChannelController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, SharedChannelController)).toBe('api/channels');
  });

  it('lists only channels the caller is a member of', async () => {
    await svc.listChannels('cust');
    expect(prisma.sharedChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { members: { some: { userId: 'cust' } } } }),
    );
  });

  it('only vendors can create channels', async () => {
    await expect(
      svc.createChannel({ userId: 'cust', role: 'USER' }, { name: 'x', customerIds: ['cust2'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('vendor creates a channel with customer members', async () => {
    const ch = await svc.createChannel(
      { userId: 'vendor', role: 'MANAGER' },
      { name: 'Acme', customerIds: ['cust'] },
    );
    expect(ch.id).toBe('c2');
    const arg = prisma.sharedChannel.create.mock.calls[0][0] as unknown as {
      data: { members: { create: Member[] } };
    };
    expect(arg.data.members.create).toEqual([
      { userId: 'vendor', role: 'VENDOR' },
      { userId: 'cust', role: 'CUSTOMER' },
    ]);
  });

  it('rejects a channel without customers', async () => {
    await expect(
      svc.createChannel({ userId: 'vendor', role: 'MANAGER' }, { name: 'Acme', customerIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('non-members cannot read, post or stream', async () => {
    await expect(svc.listMessages('c1', 'stranger')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.postMessage('c1', 'stranger', { body: 'hi' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(firstValueFrom(svc.stream('c1', 'stranger'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('a customer message is pushed to the channel SSE stream in real time', async () => {
    const next = firstValueFrom(svc.stream('c1', 'vendor').pipe(take(1)));
    // let the membership check resolve and the subscription attach
    await new Promise((r) => setTimeout(r, 0));
    const posted = await svc.postMessage('c1', 'cust', { body: 'hello vendor' });
    const evt = await next;
    expect(evt.data.id).toBe(posted.id);
    expect(evt.data.body).toBe('hello vendor');
  });
});
