/**
 * Web mirror of backend/src/shared/contracts/vendor-onboarding (the web
 * @contracts alias has no folder yet). Keep in sync with the backend contract.
 */
export type VendorDocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export const VENDOR_DOCUMENT_STATUS_LABELS: Record<VendorDocumentStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** Label for a status; unknown values fall back to a human label, never the raw enum. */
export function vendorDocumentStatusLabel(status: string): string {
  return VENDOR_DOCUMENT_STATUS_LABELS[status as VendorDocumentStatus] ?? 'Pending review';
}

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
