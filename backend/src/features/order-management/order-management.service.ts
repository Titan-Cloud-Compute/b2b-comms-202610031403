import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import { SharedChannelService, VENDOR_ROLES } from '../shared-channel/shared-channel.service';

export type OrderStatusValue = 'PENDING' | 'CONFIRMED';

export interface Caller {
  userId: string;
  role: string;
}

export interface OrderItemInput {
  productId?: unknown;
  quantity?: unknown;
}

export const ORDER_CONFIRMED_KIND = 'ORDER_CONFIRMED';

@Injectable()
export class OrderManagementService {
  private readonly logger = new Logger(OrderManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly channels: SharedChannelService,
    private readonly prefs: NotificationPreferencesService,
  ) {}

  private assertVendor(caller: Caller): void {
    if (!VENDOR_ROLES.includes(caller.role)) {
      throw new ForbiddenException('only vendors can perform this action');
    }
  }

  /** Vendors a customer can order from (users with a vendor role). */
  async listVendors() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [...VENDOR_ROLES] as UserRole[] } },
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
    });
    const profiles = await this.prisma.vendorProfile.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, companyName: true },
    });
    const byUser = new Map(profiles.map((p) => [p.userId, p.companyName]));
    return users.map((u) => ({
      id: u.id,
      name: byUser.get(u.id) ?? u.name ?? u.email,
      email: u.email,
    }));
  }

  /** A vendor's product catalog (active products only). */
  listCatalog(vendorUserId: string) {
    return this.prisma.product.findMany({
      where: { vendorUserId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async listOwnProducts(caller: Caller) {
    this.assertVendor(caller);
    return this.listCatalog(caller.userId);
  }

  async createProduct(
    caller: Caller,
    input: { name?: unknown; description?: unknown; unitPriceCents?: unknown },
  ) {
    this.assertVendor(caller);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new BadRequestException('name is required');
    const price = Number(input.unitPriceCents ?? 0);
    if (!Number.isInteger(price) || price < 0) {
      throw new BadRequestException('unitPriceCents must be a non-negative integer');
    }
    const description =
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim()
        : null;
    return this.prisma.product.create({
      data: { vendorUserId: caller.userId, name, description, unitPriceCents: price },
    });
  }

  /** Customer submits a purchase order. The order always starts PENDING. */
  async createOrder(caller: Caller, input: { vendorId?: unknown; items?: unknown }) {
    const vendorUserId = typeof input.vendorId === 'string' ? input.vendorId : '';
    if (!vendorUserId) throw new BadRequestException('vendorId is required');
    if (vendorUserId === caller.userId) {
      throw new BadRequestException('cannot order from yourself');
    }
    const rawItems = Array.isArray(input.items) ? (input.items as OrderItemInput[]) : [];
    const quantities = new Map<string, number>();
    for (const it of rawItems) {
      const productId = typeof it?.productId === 'string' ? it.productId : '';
      const quantity = Number(it?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity <= 0) continue;
      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
    }
    if (quantities.size === 0) throw new BadRequestException('at least one item is required');

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...quantities.keys()] }, vendorUserId, active: true },
    });
    if (products.length !== quantities.size) {
      throw new BadRequestException('unknown product for this vendor');
    }

    const order = await this.prisma.order.create({
      data: {
        customerUserId: caller.userId,
        vendorUserId,
        status: 'PENDING',
        items: {
          create: products.map((p) => ({
            productId: p.id,
            quantity: quantities.get(p.id) ?? 0,
            unitPriceCents: p.unitPriceCents,
          })),
        },
      },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    await this.audit.record({
      actor: 'USER',
      actorUserId: caller.userId,
      action: 'order.created',
      payload: { orderId: order.id, vendorUserId, itemCount: quantities.size },
    });
    return order;
  }

  /** The calling vendor's order queue, optionally filtered by status. */
  async listVendorOrders(caller: Caller, status?: string) {
    this.assertVendor(caller);
    const s = typeof status === 'string' ? status.trim().toUpperCase() : '';
    if (s && s !== 'PENDING' && s !== 'CONFIRMED') {
      throw new BadRequestException('invalid status');
    }
    return this.prisma.order.findMany({
      where: { vendorUserId: caller.userId, ...(s ? { status: s as OrderStatusValue } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
  }

  listCustomerOrders(caller: Caller) {
    return this.prisma.order.findMany({
      where: { customerUserId: caller.userId },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
  }

  /** Order alerts for the caller, kept only where the preference in effect at the time allowed them. */
  async listNotifications(caller: Caller) {
    const rows = await this.prisma.orderNotification.findMany({
      where: { userId: caller.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.prefs.filterOrderNotifications(caller.userId, rows);
  }

  /** Vendor confirms a pending order with an estimated delivery date and notifies the customer. */
  async confirmOrder(caller: Caller, orderId: string, input: { estimatedDeliveryDate?: unknown }) {
    this.assertVendor(caller);
    const raw = typeof input.estimatedDeliveryDate === 'string' ? input.estimatedDeliveryDate : '';
    const eta = raw ? new Date(raw) : null;
    if (!eta || Number.isNaN(eta.getTime())) {
      throw new BadRequestException('estimatedDeliveryDate is required');
    }
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing || existing.vendorUserId !== caller.userId) {
      throw new NotFoundException('order not found');
    }
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('only pending orders can be confirmed');
    }
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', estimatedDeliveryDate: eta, confirmedAt: new Date() },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    const etaText = eta.toISOString().slice(0, 10);
    const body = `Your order ${order.id} has been confirmed. Estimated delivery: ${etaText}.`;
    // Respect the customer's order-alert preference; the channel message below is
    // the shared conversation and is always written (the feed gates message alerts).
    if (await this.prefs.allows(order.customerUserId, 'ORDER')) {
      await this.prisma.orderNotification.create({
        data: { userId: order.customerUserId, orderId: order.id, kind: ORDER_CONFIRMED_KIND, body },
      });
    }
    await this.notifyViaChannel(caller.userId, order.customerUserId, body);
    await this.audit.record({
      actor: 'USER',
      actorUserId: caller.userId,
      action: 'order.confirmed',
      payload: { orderId: order.id, estimatedDeliveryDate: eta.toISOString() },
    });
    return order;
  }

  /** Best-effort: post the confirmation into a shared channel both parties belong to. */
  private async notifyViaChannel(vendorUserId: string, customerUserId: string, body: string) {
    try {
      const channel = await this.prisma.sharedChannel.findFirst({
        where: {
          AND: [
            { members: { some: { userId: vendorUserId } } },
            { members: { some: { userId: customerUserId } } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (channel) await this.channels.postMessage(channel.id, vendorUserId, { body });
    } catch (err) {
      this.logger.warn(`channel notification failed: ${(err as Error).message}`);
    }
  }
}
