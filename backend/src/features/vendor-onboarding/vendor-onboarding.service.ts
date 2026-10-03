import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../../lib/integrations/minio.service';
import type {
  UpsertVendorProfileRequest,
  VendorDocumentDto,
  VendorProfileDto,
} from '../../shared/contracts/vendor-onboarding';

export interface UploadedVendorFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Owner-scoped vendor onboarding: every query is keyed on the session userId. */
@Injectable()
export class VendorOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  async getProfile(userId: string): Promise<VendorProfileDto | null> {
    const p = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    return p ? this.toProfileDto(p) : null;
  }

  async upsertProfile(userId: string, body: unknown): Promise<VendorProfileDto> {
    const input = (body ?? {}) as Partial<UpsertVendorProfileRequest>;
    const companyName = str(input.companyName);
    const contactName = str(input.contactName);
    const contactEmail = str(input.contactEmail);
    const contactPhone = str(input.contactPhone) || null;
    const address = str(input.address) || null;
    if (!companyName) throw new BadRequestException('companyName is required');
    if (!contactName) throw new BadRequestException('contactName is required');
    if (!EMAIL_RE.test(contactEmail)) throw new BadRequestException('contactEmail must be a valid email');

    const data = { companyName, contactName, contactEmail, contactPhone, address, completed: true };
    const p = await this.prisma.vendorProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.toProfileDto(p);
  }

  async listDocuments(userId: string): Promise<VendorDocumentDto[]> {
    const profile = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!profile) return [];
    const docs = await this.prisma.vendorDocument.findMany({
      where: { vendorId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((d) => this.toDocumentDto(d));
  }

  async uploadDocument(
    userId: string,
    file: UploadedVendorFile | undefined,
    type: unknown,
  ): Promise<VendorDocumentDto> {
    if (!file || !file.buffer) throw new BadRequestException('file is required');
    const profile = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!profile || !profile.completed) {
      throw new ConflictException('complete your vendor profile before uploading documents');
    }
    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_');
    const fileKey = `vendor-documents/${profile.id}/${randomUUID()}-${safeName}`;
    await this.minio.putObject(fileKey, file.buffer, file.size, file.mimetype);
    const doc = await this.prisma.vendorDocument.create({
      data: {
        vendorId: profile.id,
        fileKey,
        name: file.originalname,
        type: str(type) || 'compliance',
      },
    });
    return this.toDocumentDto(doc);
  }

  private toProfileDto(p: {
    id: string; companyName: string; contactName: string; contactEmail: string;
    contactPhone: string | null; address: string | null; completed: boolean;
    createdAt: Date; updatedAt: Date;
  }): VendorProfileDto {
    return {
      id: p.id,
      companyName: p.companyName,
      contactName: p.contactName,
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone,
      address: p.address,
      completed: p.completed,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toDocumentDto(d: {
    id: string; name: string; type: string; status: VendorDocumentDto['status']; createdAt: Date;
  }): VendorDocumentDto {
    return { id: d.id, name: d.name, type: d.type, status: d.status, createdAt: d.createdAt.toISOString() };
  }
}
