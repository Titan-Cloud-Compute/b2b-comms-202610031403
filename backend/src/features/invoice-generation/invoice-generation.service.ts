import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VENDOR_ROLES } from '../shared-channel/shared-channel.service';
import { renderInvoicePdf } from './invoice-pdf';

export interface InvoiceCaller {
  userId: string;
  role: string;
}

export interface InvoiceView {
  id: string;
  orderId: string;
  vendorUserId: string;
  customerUserId: string;
  number: string;
  totalCents: number;
  createdAt: Date;
}

export function formatInvoiceNumber(seq: number): string {
  return `INV-${String(seq).padStart(6, '0')}`;
}

@Injectable()
export class InvoiceGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  private isVendor(caller: InvoiceCaller): boolean {
    return VENDOR_ROLES.includes(caller.role);
  }

  /** Invoices the caller may see: issued by them (vendor) or addressed to them (customer). */
  list(caller: InvoiceCaller): Promise<InvoiceView[]> {
    return this.prisma.invoice.findMany({
      where: { OR: [{ vendorUserId: caller.userId }, { customerUserId: caller.userId }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Vendor generates the invoice for one of their CONFIRMED orders (409 if one exists). */
  async generate(caller: InvoiceCaller, orderId: string): Promise<InvoiceView> {
    if (!this.isVendor(caller)) throw new ForbiddenException('only vendors can generate invoices');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.vendorUserId !== caller.userId) throw new NotFoundException('order not found');
    if (order.status !== 'CONFIRMED') throw new ConflictException('order must be confirmed before invoicing');
    const existing = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (existing) throw new ConflictException('an invoice already exists for this order');
    const totalCents = order.items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);

    for (let attempt = 0; attempt < 5; attempt++) {
      const seq = (await this.prisma.invoice.count()) + 1 + attempt;
      try {
        return await this.prisma.invoice.create({
          data: {
            orderId,
            vendorUserId: order.vendorUserId,
            customerUserId: order.customerUserId,
            number: formatInvoiceNumber(seq),
            totalCents,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        const target = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
        if (target.includes('orderId')) throw new ConflictException('an invoice already exists for this order');
      }
    }
    throw new ConflictException('could not allocate an invoice number, retry');
  }

  /** Invoice metadata for an order; only that order's customer or vendor. */
  async forOrder(caller: InvoiceCaller, orderId: string): Promise<InvoiceView> {
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (!invoice || (invoice.customerUserId !== caller.userId && invoice.vendorUserId !== caller.userId)) {
      throw new NotFoundException('invoice not found');
    }
    return invoice;
  }

  /** Render the invoice PDF for an order; only that order's customer or vendor. */
  async pdf(caller: InvoiceCaller, orderId: string): Promise<{ filename: string; body: Buffer }> {
    const invoice = await this.forOrder(caller, orderId);
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { name: true } } },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [invoice.vendorUserId, invoice.customerUserId] } },
      select: { id: true, name: true, email: true },
    });
    const profile = await this.prisma.vendorProfile.findFirst({
      where: { userId: invoice.vendorUserId },
      select: { companyName: true },
    });
    const nameOf = (id: string) => {
      const u = users.find((x) => x.id === id);
      return u?.name || u?.email || id;
    };
    const body = renderInvoicePdf({
      number: invoice.number,
      orderId,
      issuedAt: invoice.createdAt,
      vendorName: profile?.companyName || nameOf(invoice.vendorUserId),
      customerName: nameOf(invoice.customerUserId),
      lines: items.map((i) => ({
        description: i.product?.name ?? i.productId,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
      })),
      totalCents: invoice.totalCents,
    });
    return { filename: `${invoice.number}.pdf`, body };
  }
}
