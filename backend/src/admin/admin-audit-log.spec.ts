/**
 * GET /api/admin/audit-log — returns each row's actor (id, email, name), keeps
 * the ADMIN-only guard and orders rows newest first. No database is touched:
 * prisma.runAsAdmin runs the callback against a tx stub.
 */
import 'reflect-metadata';
import { AdminAuditController } from './admin-audit.controller';
import { ROLES_KEY } from '../auth/roles.guard';

function makeController(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(rows.length);
  const tx = { auditLog: { findMany, count } };
  const prisma = { runAsAdmin: (fn: (t: typeof tx) => unknown) => fn(tx) } as any;
  return { controller: new AdminAuditController(prisma), findMany, count };
}

describe('AdminAuditController.auditLog', () => {
  it('is restricted to ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminAuditController);
    expect(roles).toEqual(['ADMIN']);
  });

  it('orders newest first and includes the actor user (id, email, name)', async () => {
    const row = {
      id: 'a1',
      actor: 'ADMIN',
      actorUserId: 'u1',
      actorUser: { id: 'u1', email: 'admin@example.com', name: 'Admin' },
      action: 'auth.login',
      payloadJson: {},
      createdAt: new Date('2026-10-01T00:00:00Z'),
    };
    const s = makeController([row]);

    const res = await s.controller.auditLog();

    expect(s.findMany).toHaveBeenCalledTimes(1);
    const args = s.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.include).toEqual({
      actorUser: { select: { id: true, email: true, name: true } },
    });
    expect(res.rows).toEqual([row]);
    expect(res.total).toBe(1);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(50);
  });

  it('applies actor and action filters', async () => {
    const s = makeController([]);
    await s.controller.auditLog('SYSTEM', 'auth.');
    const args = s.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ actor: 'SYSTEM', action: { startsWith: 'auth.' } });
  });
});
