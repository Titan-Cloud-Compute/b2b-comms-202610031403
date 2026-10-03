import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';
import type { UpsertVendorProfileRequest, VendorDocumentDto, VendorProfileDto } from './vendor-onboarding.types';

@Injectable({ providedIn: 'root' })
export class VendorOnboardingApi {
  private api = inject(ApiClient);

  /** Returns null for a vendor that has not submitted a profile yet. */
  async getProfile(): Promise<VendorProfileDto | null> {
    const p = await this.api.get<VendorProfileDto | null | ''>('vendor/profile');
    return p && typeof p === 'object' && 'companyName' in p ? p : null;
  }

  saveProfile(body: UpsertVendorProfileRequest): Promise<VendorProfileDto> {
    return this.api.put<VendorProfileDto>('vendor/profile', body);
  }

  async listDocuments(): Promise<VendorDocumentDto[]> {
    const rows = await this.api.get<VendorDocumentDto[]>('vendor/documents');
    return Array.isArray(rows) ? rows : [];
  }

  uploadDocument(file: File, type: string): Promise<VendorDocumentDto> {
    return this.api.upload<VendorDocumentDto>('vendor/documents', file, { type });
  }
}
