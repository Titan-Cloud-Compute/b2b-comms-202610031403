import { BadRequestException, ConflictException } from '@nestjs/common';
import { VendorOnboardingService } from './vendor-onboarding.service';

function makeService() {
  const now = new Date('2026-10-03T00:00:00Z');
  const profiles = new Map<string, any>();
  const docs: any[] = [];
  const prisma: any = {
    vendorProfile: {
      findUnique: jest.fn(async ({ where }: any) => profiles.get(where.userId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = profiles.get(where.userId);
        const row = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `vp_${where.userId}`, ...create, createdAt: now, updatedAt: now };
        profiles.set(where.userId, row);
        return row;
      }),
    },
    vendorDocument: {
      findMany: jest.fn(async ({ where }: any) => docs.filter((d) => d.vendorId === where.vendorId)),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `vd_${docs.length}`, status: 'PENDING_REVIEW', createdAt: now, ...data };
        docs.push(row);
        return row;
      }),
    },
  };
  const minio: any = { putObject: jest.fn(async (key: string) => ({ etag: 'e', bucket: 'b', key })) };
  return { svc: new VendorOnboardingService(prisma, minio), minio };
}

const file = { originalname: 'iso cert.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('abc') };

describe('VendorOnboardingService', () => {
  it('returns null profile for a new vendor and saves a completed profile', async () => {
    const { svc } = makeService();
    expect(await svc.getProfile('u1')).toBeNull();
    const p = await svc.upsertProfile('u1', {
      companyName: 'Acme', contactName: 'Ann', contactEmail: 'ann@acme.test',
    });
    expect(p.completed).toBe(true);
    expect((await svc.getProfile('u1'))?.companyName).toBe('Acme');
  });

  it('rejects an invalid profile', async () => {
    const { svc } = makeService();
    await expect(svc.upsertProfile('u1', { companyName: 'Acme', contactName: 'A', contactEmail: 'nope' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks document upload until the profile is complete', async () => {
    const { svc } = makeService();
    await expect(svc.uploadDocument('u1', file, 'compliance')).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores uploaded documents with PENDING_REVIEW status, scoped to the owner', async () => {
    const { svc, minio } = makeService();
    await svc.upsertProfile('u1', { companyName: 'Acme', contactName: 'Ann', contactEmail: 'ann@acme.test' });
    const d = await svc.uploadDocument('u1', file, 'compliance');
    expect(d.status).toBe('PENDING_REVIEW');
    expect(minio.putObject).toHaveBeenCalled();
    expect(await svc.listDocuments('u1')).toHaveLength(1);
    expect(await svc.listDocuments('u2')).toEqual([]);
  });
});
