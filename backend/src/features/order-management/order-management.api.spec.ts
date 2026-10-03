/**
 * Story: order-management — API behaviour (catalog, order create, vendor queue,
 * confirm with delivery date, customer notification). Prisma is mocked.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { AuditService } from '../../audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import type { SharedChannelService } from '../shared-channel/shared-channel.service';
import { FEATURE_MODULES } from '../index';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementModule } from './order-management.module';
import { OrderManagementService, ORDER_CONFIRMED_KIND } from './order-management.service';

type Order = {
  id: string;
  customerUserId: string;
  vendorUserId: string;
  status: 'PENDING' | 'CONFIRMED';
  estimatedDeliveryDate: Date | null;
  confirmedAt: Date | null;
  items: unknown[];
};

function makeDeps(orderAlerts = true) {
  const products = [
    { id: 'p1', vendorUserId: 'vendor', name: 'Widget', unitPriceCents: 500, active: true },
    { id: 'p2', vendorUserId: 'vendor', name: 'Gadget', unitPriceCents: 1200, active: true },
    { id: 'p3', vendorUserId: 'other', name: 'Other', unitPriceCents: 100, active: true },
  ];
  const orders: Order[] = [];
  const notifications: { userId: string; orderId: string; kind: string; body: string }[] = [];
  const prisma = {
    user: { findMany: jest.fn(async () => [{ id: 'vendor', name: 'V', email: 'v@x' }]) },
    vendorProfile: { findMany: jest.fn(async () => [{ userId: 'vendor', companyName: 'Acme' }]) },
    product: {
      findMany: jest.fn(
        async ({ where }: { where: { vendorUserId: string; id?: { in: string[] } } }) =>
          products.filter(
            (p) => p.vendorUserId === where.vendorUserId && (!where.id || where.id.in.includes(p.id)),
          ),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'pN', ...data })),
    },
    order: {
      create: jest.fn(
        async ({ data }: { data: Omit<Order, 'id' | 'items' | 'estimatedDeliveryDate' | 'confirmedAt'> & { items: { create: unknown[] } } }) => {
          const o: Order = {
            id: `o${orders.length + 1}`,
            customerUserId: data.customerUserId,
            vendorUserId: data.vendorUserId,
            status: data.status,
            estimatedDeliveryDate: null,
            confirmedAt: null,
            items: data.items.create,
          };
          orders.push(o);
          return o;
        },
      ),
      findMany: jest.fn(async ({ where }: { where: Partial<Order> }) =>
        orders.filter(
          (o) =>
            (!where.vendorUserId || o.vendorUserId === where.vendorUserId) &&
            (!where.customerUserId || o.customerUserId === where.customerUserId) &&
            (!where.status || o.status === where.status),
        ),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => orders.find((o) => o.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Order> }) => {
        const o = orders.find((x) => x.id === where.id)!;
        Object.assign(o, data);
        return o;
      }),
    },
    orderNotification: {
      create: jest.fn(async ({ data }: { data: (typeof notifications)[number] }) => {
        notifications.push(data);
        return { id: `n${notifications.length}`, ...data };
      }),
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        notifications.filter((n) => n.userId === where.userId),
      ),
    },
    sharedChannel: { findFirst: jest.fn(async () => ({ id: 'c1' })) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const channels = { postMessage: jest.fn(async () => ({ id: 'm1' })) };
  const prefs = {
    allows: jest.fn(async (_u: string, type: 'ORDER' | 'MESSAGE') => (type === 'ORDER' ? orderAlerts : true)),
    filterOrderNotifications: jest.fn(async <T>(_u: string, rows: T[]) => (orderAlerts ? rows : [])),
  };
  const svc = new OrderManagementService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    channels as unknown as SharedChannelService,
    prefs as unknown as NotificationPreferencesService,
  );
  return { prisma, audit, channels, svc, orders, notifications, prefs };
}

const CUSTOMER = { userId: 'cust', role: 'USER' };
const VENDOR = { userId: 'vendor', role: 'MANAGER' };

describe('order-management API', () => {
  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(OrderManagementModule);
  });

  it('controller is JWT guarded and exposes the story endpoints', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrderManagementController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, OrderManagementController)).toBe('api');
    const proto = OrderManagementController.prototype as unknown as Record<string, object>;
    const route = (name: string) => [
      Reflect.getMetadata(METHOD_METADATA, proto[name]),
      Reflect.getMetadata(PATH_METADATA, proto[name]),
    ];
    expect(route('catalog')).toEqual([RequestMethod.GET, 'vendors/:id/products']);
    expect(route('create')).toEqual([RequestMethod.POST, 'orders']);
    expect(route('vendorOrders')).toEqual([RequestMethod.GET, 'vendor/orders']);
    expect(route('confirm')).toEqual([RequestMethod.PATCH, 'orders/:id/confirm']);
    expect(route('notifications')).toEqual([RequestMethod.GET, 'orders/notifications']);
  });

  it('lists a vendor catalog', async () => {
    const { svc } = makeDeps();
    const list = await svc.listCatalog('vendor');
    expect(list.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('customer submits an order that lands PENDING in the vendor queue', async () => {
    const { svc, audit } = makeDeps();
    const order = await svc.createOrder(CUSTOMER, {
      vendorId: 'vendor',
      items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }],
    });
    expect(order.status).toBe('PENDING');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'order.created' }));
    const queue = await svc.listVendorOrders(VENDOR, 'pending');
    expect(queue.map((o) => o.id)).toEqual([order.id]);
  });

  it('rejects orders with no items or with another vendor\'s products', async () => {
    const { svc } = makeDeps();
    await expect(svc.createOrder(CUSTOMER, { vendorId: 'vendor', items: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.createOrder(CUSTOMER, { vendorId: 'vendor', items: [{ productId: 'p3', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only vendors can read the queue or confirm', async () => {
    const { svc } = makeDeps();
    await expect(svc.listVendorOrders(CUSTOMER, 'pending')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.confirmOrder(CUSTOMER, 'o1', { estimatedDeliveryDate: '2026-11-01' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('vendor confirms with a delivery date; customer is notified', async () => {
    const { svc, audit, channels } = makeDeps();
    const order = await svc.createOrder(CUSTOMER, {
      vendorId: 'vendor',
      items: [{ productId: 'p1', quantity: 1 }],
    });
    await expect(svc.confirmOrder(VENDOR, order.id, {})).rejects.toBeInstanceOf(BadRequestException);
    const confirmed = await svc.confirmOrder(VENDOR, order.id, { estimatedDeliveryDate: '2026-11-01' });
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.estimatedDeliveryDate?.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(await svc.listVendorOrders(VENDOR, 'pending')).toEqual([]);

    const notes = await svc.listNotifications(CUSTOMER);
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe(ORDER_CONFIRMED_KIND);
    expect(notes[0].body).toContain('2026-11-01');
    expect(channels.postMessage).toHaveBeenCalledWith('c1', 'vendor', {
      body: expect.stringContaining('confirmed'),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'order.confirmed' }));

    await expect(
      svc.confirmOrder(VENDOR, order.id, { estimatedDeliveryDate: '2026-11-02' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a vendor cannot confirm another vendor\'s order', async () => {
    const { svc } = makeDeps();
    const order = await svc.createOrder(CUSTOMER, {
      vendorId: 'vendor',
      items: [{ productId: 'p1', quantity: 1 }],
    });
    await expect(
      svc.confirmOrder({ userId: 'other', role: 'MANAGER' }, order.id, { estimatedDeliveryDate: '2026-11-01' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('with order alerts off, confirming creates no order alert but still posts to the channel', async () => {
    const { svc, channels, notifications } = makeDeps(false);
    const order = await svc.createOrder(CUSTOMER, {
      vendorId: 'vendor',
      items: [{ productId: 'p1', quantity: 1 }],
    });
    await svc.confirmOrder(VENDOR, order.id, { estimatedDeliveryDate: '2026-11-01' });
    expect(notifications).toHaveLength(0);
    expect(await svc.listNotifications(CUSTOMER)).toEqual([]);
    expect(channels.postMessage).toHaveBeenCalled();
  });
});
