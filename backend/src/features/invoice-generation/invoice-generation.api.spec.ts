/**
 * Story: invoice-generation — API behaviour (generate, list, metadata, download).
 * Prisma is mocked.
 */
import { ConflictException, ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import { FEATURE_MODULES } from '../index';
import { InvoiceGenerationController } from './invoice-generation.controller';
import { InvoiceGenerationModule } from './invoice-generation.module';
import { InvoiceGenerationService, formatInvoiceNumber } from './invoice-generation.service';

type Inv = {
  id: string; orderId: string; vendorUserId: string; customerUserId: string;
  number: string; totalCents: number; createdAt: Date;
};

function makeService() {
  const orders = [
    { id: 'o1', vendorUserId: 'vendor', customerUserId: 'cust', status: 'CONFIRMED',
      items: [{ productId: 'p1', quantity: 3, unitPriceCents: 500 }, { productId: 'p2', quantity: 1, unitPriceCents: 1200 }] },
    { id: 'o2', vendorUserId: 'vendor', customerUserId: 'cust', status: 'PENDING', items: [] },
  ];
  const invoices: Inv[] = [];
  const prisma = {
    order: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => orders.find((o) => o.id === where.id) ?? null) },
    invoice: {
      findUnique: jest.fn(async ({ where }: { where: { orderId: string } }) => invoices.find((i) => i.orderId === where.orderId) ?? null),
      findMany: jest.fn(async ({ where }: { where: { OR: { vendorUserId?: string; customerUserId?: string }[] } }) =>
        invoices.filter((i) => where.OR.some((c) => (c.vendorUserId ?? c.customerUserId) === (c.vendorUserId ? i.vendorUserId : i.customerUserId)))),
      count: jest.fn(async () => invoices.length),
      create: jest.fn(async ({ data }: { data: Omit<Inv, 'id' | 'createdAt'> }) => {
        if (invoices.some((i) => i.orderId === data.orderId)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['orderId'] } });
        }
        const inv = { ...data, id: `i${invoices.length + 1}`, createdAt: new Date('2026-10-03T00:00:00Z') };
        invoices.push(inv);
        return inv;
      }),
    },
    orderItem: { findMany: jest.fn(async () => [{ productId: 'p1', quantity: 3, unitPriceCents: 500, product: { name: 'Widget' } }]) },
    user: { findMany: jest.fn(async () => [{ id: 'vendor', name: 'V', email: 'v@x' }, { id: 'cust', name: 'C', email: 'c@x' }]) },
    vendorProfile: { findFirst: jest.fn(async () => ({ companyName: 'Acme' })) },
  };
  return { svc: new InvoiceGenerationService(prisma as unknown as PrismaService), invoices };
}

const vendor = { userId: 'vendor', role: 'MANAGER' };
const customer = { userId: 'cust', role: 'USER' };
const stranger = { userId: 'x', role: 'USER' };

describe('invoice-generation API', () => {
  it('is registered and guarded', () => {
    expect(FEATURE_MODULES).toContain(InvoiceGenerationModule);
    expect(Reflect.getMetadata(GUARDS_METADATA, InvoiceGenerationController)).toContain(JwtAuthGuard);
    const proto = InvoiceGenerationController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, proto.generate)).toBe('vendor/orders/:id/invoice');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.generate)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, proto.forOrder)).toBe('orders/:id/invoice');
    expect(Reflect.getMetadata(PATH_METADATA, proto.download)).toBe('orders/:id/invoice/download');
    expect(Reflect.getMetadata(PATH_METADATA, proto.list)).toBe('invoices');
  });

  it('formats invoice numbers as INV-NNNNNN', () => {
    expect(formatInvoiceNumber(7)).toBe('INV-000007');
  });

  it('vendor generates an invoice for a confirmed order with the computed total', async () => {
    const { svc } = makeService();
    const inv = await svc.generate(vendor, 'o1');
    expect(inv).toMatchObject({ orderId: 'o1', number: 'INV-000001', totalCents: 2700, customerUserId: 'cust' });
    await expect(svc.generate(vendor, 'o1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects non-vendors, foreign orders and unconfirmed orders', async () => {
    const { svc } = makeService();
    await expect(svc.generate(customer, 'o1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.generate({ userId: 'other', role: 'MANAGER' }, 'o1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.generate(vendor, 'o2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('customer lists and reads the invoice; strangers cannot', async () => {
    const { svc } = makeService();
    await svc.generate(vendor, 'o1');
    expect(await svc.list(customer)).toHaveLength(1);
    expect(await svc.list(stranger)).toHaveLength(0);
    expect((await svc.forOrder(customer, 'o1')).number).toBe('INV-000001');
    await expect(svc.forOrder(stranger, 'o1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('download streams a PDF attachment to the customer only', async () => {
    const { svc } = makeService();
    await svc.generate(vendor, 'o1');
    const { filename, body } = await svc.pdf(customer, 'o1');
    expect(filename).toBe('INV-000001.pdf');
    expect(body.toString('latin1').startsWith('%PDF-')).toBe(true);
    await expect(svc.pdf(stranger, 'o1')).rejects.toBeInstanceOf(NotFoundException);

    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v), end: jest.fn() };
    const ctrl = new InvoiceGenerationController(svc);
    await ctrl.download({ session: { userId: 'cust', role: 'USER' } } as never, 'o1', res as never);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toBe('attachment; filename="INV-000001.pdf"');
    expect(res.end).toHaveBeenCalled();
  });
});
