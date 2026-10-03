/**
 * Sign-in success and failure are recorded as audit events through
 * AuditLogService. No database is touched: prisma.runAsAdmin runs the callback
 * against a tx stub and AuditLogService.write is a jest mock.
 */
import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

async function makeService(user: Record<string, unknown> | null) {
  const tx = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const prisma = { runAsAdmin: (fn: (t: typeof tx) => unknown) => fn(tx) } as any;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt') } as any;
  const auditLog = { write: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new AuthService(prisma, jwt, {} as any, {} as any, auditLog);
  return { service, auditLog };
}

describe('AuthService.login audit events', () => {
  const passwordHash = bcrypt.hashSync('correct-horse', 4);

  it('writes auth.login with the user role as actor on success', async () => {
    const { service, auditLog } = await makeService({
      id: 'u-1', email: 'admin@example.com', role: 'ADMIN', passwordHash, firmId: null,
    });
    jest.spyOn(service as any, 'issueToken').mockResolvedValue('signed.jwt');

    await service.login({ email: 'admin@example.com', password: 'correct-horse' });

    expect(auditLog.write).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'ADMIN', actorUserId: 'u-1', action: 'auth.login' }),
    );
  });

  it('writes a redacted auth.login_failed SYSTEM event on bad password', async () => {
    const { service, auditLog } = await makeService({
      id: 'u-2', email: 'user@example.com', role: 'USER', passwordHash, firmId: null,
    });

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditLog.write).toHaveBeenCalledTimes(1);
    const params = auditLog.write.mock.calls[0][0];
    expect(params).toEqual(expect.objectContaining({ actor: 'SYSTEM', action: 'auth.login_failed' }));
    const serialized = JSON.stringify(params.payload ?? {});
    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('wrong-password');
  });

  it('writes auth.login_failed for an unknown account without leaking the email', async () => {
    const { service, auditLog } = await makeService(null);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'whatever123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const params = auditLog.write.mock.calls[0][0];
    expect(params).toEqual(
      expect.objectContaining({ actor: 'SYSTEM', actorUserId: null, action: 'auth.login_failed' }),
    );
    expect(JSON.stringify(params.payload ?? {})).not.toContain('ghost@example.com');
  });
});
