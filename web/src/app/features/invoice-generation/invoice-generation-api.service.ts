import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface InvoiceView {
  id: string;
  orderId: string;
  vendorUserId: string;
  customerUserId: string;
  number: string;
  totalCents: number;
  createdAt: string;
}

/** Relative base so the browser resolves it against the document base href. */
const API = 'api';
const opts = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class InvoiceGenerationApi {
  private readonly http = inject(HttpClient);

  list(): Observable<InvoiceView[]> {
    return this.http.get<InvoiceView[]>(`${API}/invoices`, opts);
  }

  generate(orderId: string): Observable<InvoiceView> {
    return this.http.post<InvoiceView>(`${API}/vendor/orders/${encodeURIComponent(orderId)}/invoice`, {}, opts);
  }

  /** Cookie-authenticated download URL (Content-Disposition: attachment). */
  downloadUrl(orderId: string): string {
    return `${API}/orders/${encodeURIComponent(orderId)}/invoice/download`;
  }
}
