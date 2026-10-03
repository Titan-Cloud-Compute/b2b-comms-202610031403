import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../auth/mailer.service';
import { AuditService } from '../../audit/audit.service';

/** Invitations expire 7 days after they are sent. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function activationUrlFor(token: string): string {
  const base = (process.env.APP_PUBLIC_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:4200').replace(/\/+$/, '');
  return `${base}/#/customer-invite/accept?token=${encodeURIComponent(token)}`;
}

@Injectable()
export class CustomerInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  /** ADMIN: create a single-use, expiring invitation and email the activation link. */
  async invite(
    adminUserId: string,
    input: { email?: unknown; companyName?: unknown },
    now: Date = new Date(),
  ) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) throw new BadRequestException('a valid email address is required');
    const companyName =
      typeof input.companyName === 'string' && input.companyName.trim() ? input.companyName.trim() : null;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('an account with this email already exists');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
    const invitation = await this.prisma.customerInvitation.create({
      data: { email, companyName, tokenHash: hashInviteToken(token), expiresAt, invitedById: adminUserId },
    });

    await this.mailer.sendCustomerInvitation(email, activationUrlFor(token));
    await this.audit.record({
      actor: 'ADMIN',
      actorUserId: adminUserId,
      action: 'customer.invite',
      payload: { invitationId: invitation.id },
    });

    return { id: invitation.id, email, companyName, expiresAt };
  }

  private async findUsable(token: unknown, now: Date) {
    if (typeof token !== 'string' || !token) throw new BadRequestException('token is required');
    const inv = await this.prisma.customerInvitation.findUnique({
      where: { tokenHash: hashInviteToken(token) },
    });
    if (!inv) throw new NotFoundException('invitation not found');
    if (inv.acceptedAt) throw new GoneException('invitation already used');
    if (inv.expiresAt.getTime() <= now.getTime()) throw new GoneException('invitation expired');
    return inv;
  }

  /** PUBLIC: check a token before showing the activation form. */
  async check(token: unknown, now: Date = new Date()) {
    const inv = await this.findUsable(token, now);
    return { email: inv.email, companyName: inv.companyName, expiresAt: inv.expiresAt };
  }

  /** PUBLIC: redeem the token once — creates the customer's account. */
  async accept(
    input: { token?: unknown; name?: unknown; password?: unknown },
    now: Date = new Date(),
  ) {
    const inv = await this.findUsable(input.token, now);
    const password = typeof input.password === 'string' ? input.password : '';
    if (password.length < 8) throw new BadRequestException('password must be at least 8 characters');
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : null;

    // Single-winner claim: only one concurrent request can flip acceptedAt.
    const claimed = await this.prisma.customerInvitation.updateMany({
      where: { id: inv.id, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) throw new GoneException('invitation already used');

    const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });
    if (existing) throw new ConflictException('an account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email: inv.email, name, passwordHash, role: 'USER' },
    });
    await this.prisma.customer.upsert({
      where: { userId: user.id },
      create: { userId: user.id, companyName: inv.companyName },
      update: { companyName: inv.companyName ?? undefined },
    });
    await this.prisma.customerInvitation.update({
      where: { id: inv.id },
      data: { acceptedUserId: user.id },
    });
    await this.audit.record({
      actor: 'USER',
      actorUserId: user.id,
      action: 'customer.invite.accept',
      payload: { invitationId: inv.id },
    });
    return { id: user.id, email: user.email, role: user.role };
  }
}
