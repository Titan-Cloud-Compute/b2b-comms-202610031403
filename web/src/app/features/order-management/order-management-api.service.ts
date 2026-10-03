import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type OrderStatus = 'PENDING' | 'CONFIRMED';

export interface VendorOption {
  id: string;
  name: string;
  email: string;
}

export interface ProductView {
  id: string;
  vendorUserId: string;
  name: string;
  description: string | null;
  unitPriceCents: number;
}

export interface OrderItemView {
  id?: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  product?: { name: string };
}

export interface OrderView {
  id: string;
  customerUserId: string;
  vendorUserId: string;
  status: OrderStatus;
  estimatedDeliveryDate: string | null;
  createdAt: string;
  items: OrderItemView[];
}

export interface OrderNotificationView {
  id: string;
  orderId: string;
  kind: string;
  body: string;
  createdAt: string;
}

/** Relative base so the browser resolves it against the document base href. */
const API = 'api';
const opts = { withCredentials: true };

@Injectable({ providedIn: 'root' })
export class OrderManagementApi {
  private readonly http = inject(HttpClient);

  vendors(): Observable<VendorOption[]> {
    return this.http.get<VendorOption[]>(`${API}/vendors`, opts);
  }

  catalog(vendorId: string): Observable<ProductView[]> {
    return this.http.get<ProductView[]>(`${API}/vendors/${encodeURIComponent(vendorId)}/products`, opts);
  }

  ownProducts(): Observable<ProductView[]> {
    return this.http.get<ProductView[]>(`${API}/vendor/products`, opts);
  }

  createProduct(body: { name: string; description?: string; unitPriceCents: number }): Observable<ProductView> {
    return this.http.post<ProductView>(`${API}/vendor/products`, body, opts);
  }

  submitOrder(body: { vendorId: string; items: { productId: string; quantity: number }[] }): Observable<OrderView> {
    return this.http.post<OrderView>(`${API}/orders`, body, opts);
  }

  myOrders(): Observable<OrderView[]> {
    return this.http.get<OrderView[]>(`${API}/orders`, opts);
  }

  notifications(): Observable<OrderNotificationView[]> {
    return this.http.get<OrderNotificationView[]>(`${API}/orders/notifications`, opts);
  }

  vendorQueue(status?: OrderStatus): Observable<OrderView[]> {
    const params = status ? new HttpParams().set('status', status.toLowerCase()) : undefined;
    return this.http.get<OrderView[]>(`${API}/vendor/orders`, { ...opts, params });
  }

  confirm(id: string, estimatedDeliveryDate: string): Observable<OrderView> {
    return this.http.patch<OrderView>(
      `${API}/orders/${encodeURIComponent(id)}/confirm`,
      { estimatedDeliveryDate },
      opts,
    );
  }
}
