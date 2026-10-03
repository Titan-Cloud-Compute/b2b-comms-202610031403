import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../shared/auth.service';
import {
  OrderManagementApi,
  OrderNotificationView,
  OrderView,
  ProductView,
  VendorOption,
} from './order-management-api.service';

function arr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

@Component({
  selector: 'app-order-management',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="orders-page" data-testid="orders-page">
      <header class="page-header">
        <h1>Orders</h1>
        <a href="#/invoices" data-testid="orders-invoices-link">Invoices</a>
      </header>

      @if (error()) { <p class="error" role="alert" data-testid="orders-error">{{ error() }}</p> }

      @if (isVendor()) {
        <section class="panel" data-testid="vendor-products">
          <h2>My products</h2>
          <ul>
            @for (p of ownProducts(); track p.id) {
              <li [attr.data-testid]="'vendor-product-' + p.id">{{ p.name }} — {{ price(p.unitPriceCents) }}</li>
            } @empty {
              <li class="muted">No products yet.</li>
            }
          </ul>
          <form class="inline-form" data-testid="product-form" (ngSubmit)="addProduct()">
            <input name="productName" [(ngModel)]="newProductName" placeholder="Product name" data-testid="product-name-input" />
            <input name="productPrice" type="number" min="0" step="0.01" [(ngModel)]="newProductPrice" placeholder="Price" data-testid="product-price-input" />
            <button type="submit" class="btn-primary" [disabled]="!newProductName.trim() || busy()" data-testid="product-add">Add product</button>
          </form>
        </section>

        <section class="panel" data-testid="order-queue">
          <h2>Order queue</h2>
          <ul class="orders">
            @for (o of queue(); track o.id) {
              <li [attr.data-testid]="'queue-order-' + o.id">
                <div><strong>Order {{ o.id }}</strong> — <span [attr.data-testid]="'queue-status-' + o.id">{{ statusLabel(o.status) }}</span></div>
                <div class="muted">{{ itemsText(o) }}</div>
                @if (o.status === 'PENDING') {
                  <label>
                    Estimated delivery
                    <input type="date" [ngModel]="deliveryDates()[o.id] || ''" (ngModelChange)="setDeliveryDate(o.id, $event)" [ngModelOptions]="{standalone: true}" [attr.data-testid]="'delivery-date-' + o.id" />
                  </label>
                  <button type="button" class="btn-primary" [disabled]="!deliveryDates()[o.id] || busy()" (click)="confirmOrder(o.id)" [attr.data-testid]="'confirm-order-' + o.id">Confirm</button>
                } @else if (o.estimatedDeliveryDate) {
                  <div>Delivery: {{ o.estimatedDeliveryDate | date: 'mediumDate' : 'UTC' }}</div>
                }
              </li>
            } @empty {
              <li class="muted">No orders yet.</li>
            }
          </ul>
        </section>
      } @else {
        <section class="panel" data-testid="product-catalog">
          <h2>Vendor catalog</h2>
          <label>
            Vendor
            <select [ngModel]="vendorId()" (ngModelChange)="selectVendor($event)" [ngModelOptions]="{standalone: true}" data-testid="vendor-select">
              <option value="">Select a vendor…</option>
              @for (v of vendors(); track v.id) {
                <option [value]="v.id">{{ v.name }}</option>
              }
            </select>
          </label>
          <ul class="catalog">
            @for (p of catalog(); track p.id) {
              <li [attr.data-testid]="'catalog-product-' + p.id">
                <span>{{ p.name }} — {{ price(p.unitPriceCents) }}</span>
                <input type="number" min="0" step="1" [ngModel]="quantities()[p.id] || 0" (ngModelChange)="setQuantity(p.id, $event)" [ngModelOptions]="{standalone: true}" [attr.data-testid]="'product-qty-' + p.id" />
              </li>
            } @empty {
              <li class="muted">{{ vendorId() ? 'This vendor has no products yet.' : 'Choose a vendor to see its catalog.' }}</li>
            }
          </ul>
          <button type="button" class="btn-primary" [disabled]="!canSubmit() || busy()" (click)="submitOrder()" data-testid="submit-order">Submit purchase order</button>
        </section>

        <section class="panel" data-testid="order-notifications">
          <h2>Notifications</h2>
          <ul>
            @for (n of notifications(); track n.id) {
              <li data-testid="notification-item">{{ n.body }}</li>
            } @empty {
              <li class="muted">No notifications.</li>
            }
          </ul>
        </section>

        <section class="panel" data-testid="my-orders">
          <h2>My orders</h2>
          <ul class="orders">
            @for (o of myOrders(); track o.id) {
              <li [attr.data-testid]="'my-order-' + o.id">
                <strong>Order {{ o.id }}</strong> — <span [attr.data-testid]="'my-order-status-' + o.id">{{ statusLabel(o.status) }}</span>
                @if (o.estimatedDeliveryDate) { — delivery {{ o.estimatedDeliveryDate | date: 'mediumDate' : 'UTC' }} }
                <div class="muted">{{ itemsText(o) }}</div>
              </li>
            } @empty {
              <li class="muted">No orders yet.</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: [`
    .orders-page { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
    .panel { margin-bottom: 1.5rem; }
    .panel ul { list-style: none; padding: 0; }
    .panel li { padding: 0.25rem 0; }
    .inline-form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  `],
})
export class OrderManagementComponent implements OnInit {
  private readonly api = inject(OrderManagementApi);
  private readonly auth = inject(AuthService);

  readonly isVendor = computed(() => this.auth.hasRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  // Customer state
  readonly vendors = signal<VendorOption[]>([]);
  readonly vendorId = signal('');
  readonly catalog = signal<ProductView[]>([]);
  readonly quantities = signal<Record<string, number>>({});
  readonly myOrders = signal<OrderView[]>([]);
  readonly notifications = signal<OrderNotificationView[]>([]);
  readonly canSubmit = computed(
    () => !!this.vendorId() && Object.values(this.quantities()).some((q) => q > 0),
  );

  // Vendor state
  readonly ownProducts = signal<ProductView[]>([]);
  readonly queue = signal<OrderView[]>([]);
  readonly deliveryDates = signal<Record<string, string>>({});
  newProductName = '';
  newProductPrice: number | null = null;

  ngOnInit(): void {
    if (this.isVendor()) {
      this.loadOwnProducts();
      this.loadQueue();
    } else {
      this.api.vendors().subscribe({
        next: (v) => this.vendors.set(arr(v)),
        error: () => this.vendors.set([]),
      });
      this.loadCustomerData();
    }
  }

  price(cents: number): string {
    return `$${((cents ?? 0) / 100).toFixed(2)}`;
  }

  statusLabel(status: string): string {
    return status === 'CONFIRMED' ? 'Confirmed' : 'Pending';
  }

  itemsText(o: OrderView): string {
    return arr(o.items)
      .map((i) => `${i.quantity} × ${i.product?.name ?? i.productId}`)
      .join(', ');
  }

  selectVendor(id: string): void {
    this.vendorId.set(id ?? '');
    this.quantities.set({});
    this.catalog.set([]);
    if (!id) return;
    this.api.catalog(id).subscribe({
      next: (list) => this.catalog.set(arr(list)),
      error: () => this.catalog.set([]),
    });
  }

  setQuantity(productId: string, value: unknown): void {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    this.quantities.set({ ...this.quantities(), [productId]: n });
  }

  submitOrder(): void {
    const items = Object.entries(this.quantities())
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    if (!this.vendorId() || items.length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.submitOrder({ vendorId: this.vendorId(), items }).subscribe({
      next: () => {
        this.busy.set(false);
        this.quantities.set({});
        this.loadCustomerData();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not submit the order.');
      },
    });
  }

  setDeliveryDate(orderId: string, value: string): void {
    this.deliveryDates.set({ ...this.deliveryDates(), [orderId]: value ?? '' });
  }

  confirmOrder(orderId: string): void {
    const date = this.deliveryDates()[orderId];
    if (!date) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.confirm(orderId, date).subscribe({
      next: () => {
        this.busy.set(false);
        this.loadQueue();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not confirm the order.');
      },
    });
  }

  addProduct(): void {
    const name = this.newProductName.trim();
    if (!name) return;
    const unitPriceCents = Math.max(0, Math.round(Number(this.newProductPrice ?? 0) * 100));
    this.busy.set(true);
    this.api.createProduct({ name, unitPriceCents }).subscribe({
      next: () => {
        this.busy.set(false);
        this.newProductName = '';
        this.newProductPrice = null;
        this.loadOwnProducts();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not add the product.');
      },
    });
  }

  private loadCustomerData(): void {
    this.api.myOrders().subscribe({
      next: (list) => this.myOrders.set(arr(list)),
      error: () => this.myOrders.set([]),
    });
    this.api.notifications().subscribe({
      next: (list) => this.notifications.set(arr(list)),
      error: () => this.notifications.set([]),
    });
  }

  private loadOwnProducts(): void {
    this.api.ownProducts().subscribe({
      next: (list) => this.ownProducts.set(arr(list)),
      error: () => this.ownProducts.set([]),
    });
  }

  private loadQueue(): void {
    this.api.vendorQueue().subscribe({
      next: (list) => this.queue.set(arr(list)),
      error: () => this.queue.set([]),
    });
  }
}
