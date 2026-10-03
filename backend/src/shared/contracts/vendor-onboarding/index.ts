/** Shared request/response contracts for the vendor-onboarding story. */

export type VendorDocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/** Human-readable labels — the UI must never render the raw enum value. */
export const VENDOR_DOCUMENT_STATUS_LABELS: Record<VendorDocumentStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export interface VendorProfileDto {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  address: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertVendorProfileRequest {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  address?: string | null;
}

export interface VendorDocumentDto {
  id: string;
  name: string;
  type: string;
  status: VendorDocumentStatus;
  createdAt: string;
}
