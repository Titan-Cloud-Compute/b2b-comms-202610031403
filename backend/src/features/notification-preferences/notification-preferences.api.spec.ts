/**
 * Story: notification-preferences — API behaviour. Prisma is mocked.
 */
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import { FEATURE_MODULES } from '../index';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesModule } from './notification-preferences.module';
import { NotificationPreferencesService, preferenceAt } from './notification-preferences.service';

type Change = { userId: string; orderAlerts: boolean; messageAlerts: boolean; effectiveAt: Date };
const t = (min: number) => new Date(Date.UTC(2026, 9, 3, 12, min));

function makeDeps() {
  const changes: Change[] = [];
  const orderNotes = [
    { id: 'n1', userId: 'u1', orderId: 'o1', kind: 'ORDER_CONFIRMED', body: 'order before', createdAt: t(1) },
  ];
  const messages = [
    { id: 'm1', channelId: 'c1', authorId: 'v1', body: 'msg before', createdAt: t(2) },
    { id: 'm0', channelId: 'c1', authorId: 'u1', body: 'my own', createdAt: t(2) },
  ];
  const sel = (c: Change) => ({ orderAlerts: c.orderAlerts, messageAlerts: c.messageAlerts, effectiveAt: c.effectiveAt });
  const prisma = {
    notificationPreferenceChange: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        changes.filter((c) => c.userId === where.userId).sort((a, b) => +a.effectiveAt - +b.effectiveAt).map(sel),
      ),
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) => {
        const mine = changes.filter((c) => c.userId === where.userId).sort((a, b) => +b.effectiveAt - +a.effectiveAt);
        return mine[0] ? sel(mine[0]) : null;
      }),
      create: jest.fn(async ({ data }: { data: Change }) => {
        changes.push(data);
        return sel(data);
      }),
    },
    orderNotification: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) => orderNotes.filter((n) => n.userId === where.userId)),
    },
    channelMember: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === 'u1' ? [{ channelId: 'c1' }] : [],
      ),
    },
    message: {
      findMany: jest.fn(async ({ where }: { where: { channelId: { in: string[] }; authorId: { not: string } } }) =>
        messages.filter((m) => where.channelId.in.includes(m.channelId) && m.authorId !== where.authorId.not),
      ),
    },
  };
  const service = new NotificationPreferencesService(prisma as unknown as PrismaService);
  return { service, changes, orderNotes, messages };
}

describe('notification-preferences API', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(t(10)));
  afterEach(() => jest.useRealTimers());

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(NotificationPreferencesModule);
  });

  it('routes are guarded by JwtAuthGuard and mounted under /api', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, NotificationPreferencesController)).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPreferencesController)).toBe('api');
    const proto = NotificationPreferencesController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, proto.get)).toBe('notification-preferences');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.get)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, proto.update)).toBe('notification-preferences');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.update)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata(PATH_METADATA, proto.feed)).toBe('notifications');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.feed)).toBe(RequestMethod.GET);
  });

  it('defaults to both alerts on', async () => {
    const { service } = makeDeps();
    await expect(service.get('u1')).resolves.toMatchObject({ orderAlerts: true, messageAlerts: true });
  });

  it('rejects non-boolean toggles', async () => {
    const { service } = makeDeps();
    await expect(service.update('u1', { orderAlerts: 'no' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('turning order alerts off hides later order events only; messages still appear; earlier alerts unchanged', async () => {
    const { service, orderNotes, messages } = makeDeps();
    const before = await service.feed('u1');
    expect(before.map((a) => a.id).sort()).toEqual(['m1', 'n1']);

    await service.update('u1', { orderAlerts: false, messageAlerts: true });
    await expect(service.get('u1')).resolves.toMatchObject({ orderAlerts: false, messageAlerts: true });

    orderNotes.push({ id: 'n2', userId: 'u1', orderId: 'o2', kind: 'ORDER_CONFIRMED', body: 'order after', createdAt: t(20) });
    messages.push({ id: 'm2', channelId: 'c1', authorId: 'v1', body: 'msg after', createdAt: t(21) });

    const after = await service.feed('u1');
    const ids = after.map((a) => a.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('m1');
    expect(ids).toContain('m2');
    expect(ids).not.toContain('n2');
    expect(ids).not.toContain('m0');
    expect(ids[0]).toBe('m2');
    expect(await service.allows('u1', 'ORDER')).toBe(false);
    expect(await service.allows('u1', 'MESSAGE')).toBe(true);
  });

  it('preferenceAt picks the last change at or before the event', () => {
    const changes = [
      { orderAlerts: false, messageAlerts: true, effectiveAt: t(5) },
      { orderAlerts: true, messageAlerts: false, effectiveAt: t(15) },
    ];
    expect(preferenceAt(changes, t(1))).toMatchObject({ orderAlerts: true, messageAlerts: true });
    expect(preferenceAt(changes, t(10))).toMatchObject({ orderAlerts: false, messageAlerts: true });
    expect(preferenceAt(changes, t(30))).toMatchObject({ orderAlerts: true, messageAlerts: false });
  });
});
