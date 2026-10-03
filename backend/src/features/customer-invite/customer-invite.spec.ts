/**
 * Story: customer-invite — admin invite, invitation email, token check and
 * single-use activation. Prisma is mocked; no database needed.
 */
import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/roles.guard';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailerService } from '../../auth/mailer.service';
import type { AuditService } from '../../audit/audit.service';
import { FEATURE_MODULES } from '../index';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerInviteModule } from './customer-invite.module';
import { CustomerInviteService, hashInviteToken } from './customer-invite.service';

type Inv = {
  id: string; email: string; companyName: string | null; tokenHash: string;
  expiresAt: Date; acceptedAt: Date | null; acceptedUserId: string | null; invitedById: string;
};

function setup() {
  const invitations: Inv[] = [];
  const users: { id: string; email: string; role: string; name: string | null }[] = [];
  const customers: { userId: string; companyName: string | null }[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) => users.find((u) => u.email === where.email) ?? null),
      create: jest.fn(async ({ data }: { data: { email: string; role: string; name: string | null } }) => {
        const u = { id: `u${users.length + 1}`, email: data.email, role: data.role, name: data.name };
        users.push(u);
        return u;
      }),
    },
    customer: {
      upsert: jest.fn(async ({ create }: { create: { userId: string; companyName: string | null } }) => {
        customers.push(create);
        return create;
      }),
    },
    customerInvitation: {
      create: jest.fn(async ({ data }: { data: Omit<Inv, 'id' | 'acceptedAt' | 'acceptedUserId'> }) => {
        const inv: Inv = { id: `i${invitations.length + 1}`, acceptedAt: null, acceptedUserId: null, ...data };
        invitations.push(inv);
        return inv;
      }),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) =>
        invitations.find((i) => i.tokenHash === where.tokenHash) ?? null),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; expiresAt: { gt: Date } }; data: { acceptedAt: Date } }) => {
        const inv = invitations.find((i) => i.id === where.id && i.acceptedAt === null && i.expiresAt > where.expiresAt.gt);
        if (!inv) return { count: 0 };
        inv.acceptedAt = data.acceptedAt;
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { acceptedUserId: string } }) => {
        const inv = invitations.find((i) => i.id === where.id)!;
        inv.acceptedUserId = data.acceptedUserId;
        return inv;
      }),
    },
  };
  const sent: { email: string; url: string }[] = [];
  const mailer = { sendCustomerInvitation: jest.fn(async (email: string, url: string) => { sent.push({ email, url }); }) };
  const audit = { record: jest.fn(async () => undefined) };
  const svc = new CustomerInviteService(
    prisma as unknown as PrismaService,
    mailer as unknown as MailerService,
    audit as unknown as AuditService,
  );
  return { svc, prisma, sent, audit, invitations, users, customers };
}

function tokenFrom(url: string): string {
  return decodeURIComponent(/token=([^&]+)/.exec(url)![1]);
}

describe('customer-invite', () => {
  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(CustomerInviteModule);
  });

  it('invite endpoint is ADMIN-only; check/accept are public', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomerInviteController)).toBe('api/customer-invites');
    const proto = CustomerInviteController.prototype;
    expect(Reflect.getMetadata(ROLES_KEY, proto.invite)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.invite)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.check)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.accept)).toBe(true);
  });

  it('admin invite stores only a token hash and emails an activation link', async () => {
    const { svc, sent, invitations, audit } = setup();
    const res = await svc.invite('admin1', { email: ' Cust@Example.com ', companyName: 'Acme' });
    expect(res.email).toBe('cust@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe('cust@example.com');
    expect(sent[0].url).toMatch(/#\/customer-invite\/accept\?token=/);
    const token = tokenFrom(sent[0].url);
    expect(invitations[0].tokenHash).toBe(hashInviteToken(token));
    expect(invitations[0].tokenHash).not.toBe(token);
    expect(invitations[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects invalid emails and already-registered emails', async () => {
    const { svc, users } = setup();
    await expect(svc.invite('admin1', { email: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    users.push({ id: 'x', email: 'taken@example.com', role: 'USER', name: null });
    await expect(svc.invite('admin1', { email: 'taken@example.com' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('activation link, opened once, creates the customer account; second use fails', async () => {
    const { svc, sent, users, customers } = setup();
    await svc.invite('admin1', { email: 'cust@example.com', companyName: 'Acme' });
    const token = tokenFrom(sent[0].url);

    await expect(svc.check(token)).resolves.toMatchObject({ email: 'cust@example.com', companyName: 'Acme' });
    const user = await svc.accept({ token, name: 'Cust', password: 'password1234' });
    expect(user).toMatchObject({ email: 'cust@example.com', role: 'USER' });
    expect(users).toHaveLength(1);
    expect(customers).toEqual([{ userId: user.id, companyName: 'Acme' }]);

    await expect(svc.check(token)).rejects.toBeInstanceOf(GoneException);
    await expect(svc.accept({ token, password: 'password1234' })).rejects.toBeInstanceOf(GoneException);
  });

  it('rejects unknown and expired tokens and short passwords', async () => {
    const { svc, sent } = setup();
    await expect(svc.check('bogus')).rejects.toBeInstanceOf(NotFoundException);
    await svc.invite('admin1', { email: 'cust@example.com' }, new Date('2020-01-01'));
    const token = tokenFrom(sent[0].url);
    await expect(svc.check(token)).rejects.toBeInstanceOf(GoneException);

    const fresh = setup();
    await fresh.svc.invite('admin1', { email: 'c2@example.com' });
    await expect(fresh.svc.accept({ token: tokenFrom(fresh.sent[0].url), password: 'short' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
