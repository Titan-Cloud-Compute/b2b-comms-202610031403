import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../shared/auth.service';
import { OrderManagementApi, OrderView } from '../order-management/order-management-api.service';
import { InvoiceGenerationApi, InvoiceView } from './invoice-generation-api.service';

function arr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** Story: invoice-generation — vendors invoice confirmed orders; customers download them. */
@Component({
  selector: 'app-invoice-generation',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="invoices-page" data-testid="invoices-page">
      <header class="page-header">
        <h1>Invoices</h1>
      </header>

      @if (error()) { <p class="error" role="alert" data-testid="invoices-error">{{ error() }}</p> }

      @if (isVendor()) {
        <section class="panel" data-testid="invoice-orders">
          <h2>Confirmed orders</h2>
          <ul class="orders">
            @for (o of confirmedOrders(); track o.id) {
              <li [attr.data-testid]="'invoice-order-' + o.id">
                <strong>Order {{ o.id }}</strong> — {{ price(orderTotal(o)) }}
                @if (invoiceFor(o.id); as inv) {
                  <span [attr.data-testid]="'invoice-status-' + o.id">Invoice generated ({{ inv.number }})</span>
                } @else {
                  <button type="button" class="btn-primary" [disabled]="busy()" (click)="generate(o.id)" [attr.data-testid]="'generate-invoice-' + o.id">Generate invoice</button>
                }
              </li>
            } @empty {
              <li class="muted">No confirmed orders yet.</li>
            }
          </ul>
        </section>
      }

      <section class="panel">
        <h2>{{ isVendor() ? 'Issued invoices' : 'My invoices' }}</h2>
        <ul class="orders" data-testid="invoice-list">
          @for (inv of invoices(); track inv.id) {
            <li [attr.data-testid]="'invoice-' + inv.id">
              <strong>{{ inv.number }}</strong> — Order {{ inv.orderId }} — {{ price(inv.totalCents) }}
              — {{ inv.createdAt | date: 'mediumDate' }}
              <a class="btn-link" [href]="downloadUrl(inv.orderId)" [attr.download]="inv.number + '.pdf'" [attr.data-testid]="'invoice-download-' + inv.id">Download PDF</a>
            </li>
          } @empty {
            <li class="muted">No invoices yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .invoices-page { display: flex; flex-direction: column; gap: 1rem; }
    .panel ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .orders li { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .muted { opacity: 0.7; }
  `],
})
export class InvoiceGenerationComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(InvoiceGenerationApi);
  private readonly orders = inject(OrderManagementApi);

  readonly isVendor = computed(() => this.auth.hasRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'));
  readonly invoices = signal<InvoiceView[]>([]);
  readonly confirmedOrders = signal<OrderView[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin({
      invoices: this.api.list(),
      orders: this.isVendor() ? this.orders.vendorQueue('CONFIRMED') : of([] as OrderView[]),
    }).subscribe({
      next: ({ invoices, orders }) => {
        this.invoices.set(arr(invoices));
        this.confirmedOrders.set(arr(orders).filter(o => o.status === 'CONFIRMED'));
      },
      error: () => this.error.set('Could not load invoices.'),
    });
  }

  invoiceFor(orderId: string): InvoiceView | undefined {
    return this.invoices().find(i => i.orderId === orderId);
  }

  generate(orderId: string): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.generate(orderId).subscribe({
      next: inv => {
        this.invoices.update(list => [inv, ...list.filter(i => i.orderId !== inv.orderId)]);
        this.busy.set(false);
      },
      error: () => {
        this.error.set('Could not generate the invoice.');
        this.busy.set(false);
        this.load();
      },
    });
  }

  downloadUrl(orderId: string): string {
    return this.api.downloadUrl(orderId);
  }

  orderTotal(o: OrderView): number {
    return arr(o.items).reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
  }

  price(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
