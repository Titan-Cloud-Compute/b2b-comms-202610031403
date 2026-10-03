import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export type AuditActorKind = 'USER' | 'ADMIN' | 'SYSTEM';

export interface AuditLogRow {
  id: string;
  actor: AuditActorKind;
  actorUserId?: string | null;
  actorUser?: { id: string; email?: string | null; name?: string | null } | null;
  action: string;
  payloadJson?: unknown;
  createdAt: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogQuery {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  template: `
    <section class="audit-log" data-testid="audit-log">
      <div class="filters">
        <label>
          Actor
          <select data-testid="audit-log-actor-filter" [value]="actor()" (change)="onActorChange($any($event.target).value)">
            <option value="">All</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SYSTEM">System</option>
          </select>
        </label>
      </div>

      @if (loading()) {
        <p data-testid="audit-log-loading">Loading audit log…</p>
      } @else if (error()) {
        <p class="error" data-testid="audit-log-error" role="alert">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <p data-testid="audit-log-empty">No audit events recorded yet.</p>
      } @else {
        <table data-testid="audit-log-table">
          <thead>
            <tr><th>Time</th><th>Actor</th><th>User</th><th>Action</th><th>Details</th></tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr data-testid="audit-log-row">
                <td data-testid="audit-log-time">{{ formatTime(row.createdAt) }}</td>
                <td data-testid="audit-log-actor">{{ row.actor }}</td>
                <td data-testid="audit-log-user">{{ actorLabel(row) }}</td>
                <td data-testid="audit-log-action">{{ row.action }}</td>
                <td data-testid="audit-log-details">{{ details(row) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      <div class="pager">
        <button type="button" data-testid="audit-log-prev" [disabled]="page() <= 1 || loading()" (click)="prev()">Prev</button>
        <span>Page {{ page() }} of {{ totalPages() }}</span>
        <button type="button" data-testid="audit-log-next" [disabled]="page() >= totalPages() || loading()" (click)="next()">Next</button>
      </div>
    </section>
  `,
  styles: [`
    .filters { margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--color-border, #ddd); }
    .pager { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
    .error { color: var(--color-error-600, #b00020); }
  `],
})
export class AdminAuditLogComponent implements OnInit {
  private api = inject(ApiClient);

  rows = signal<AuditLogRow[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = 50;
  actor = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  getAuditLog(q: AuditLogQuery): Promise<AuditLogPage> {
    return this.api.get<AuditLogPage>('admin/audit-log', {
      params: {
        actor: q.actor || undefined,
        action: q.action || undefined,
        from: q.from || undefined,
        to: q.to || undefined,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.getAuditLog({ actor: this.actor(), page: this.page(), pageSize: this.pageSize });
      const rows = Array.isArray(res) ? (res as AuditLogRow[]) : (res?.rows ?? []);
      // Newest first, regardless of server ordering.
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.rows.set(rows);
      this.total.set(Array.isArray(res) ? rows.length : (res?.total ?? rows.length));
    } catch {
      this.rows.set([]);
      this.error.set('Could not load the audit log.');
    } finally {
      this.loading.set(false);
    }
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize));
  }

  onActorChange(value: string): void {
    this.actor.set(value);
    this.page.set(1);
    this.load();
  }

  prev(): void {
    if (this.page() > 1) { this.page.update(p => p - 1); this.load(); }
  }

  next(): void {
    if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.load(); }
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB');
  }

  actorLabel(row: AuditLogRow): string {
    const u = row.actorUser;
    if (u) return u.name || u.email || u.id;
    return row.actorUserId || '—';
  }

  details(row: AuditLogRow): string {
    const p = row.payloadJson;
    if (p == null) return '';
    if (typeof p === 'string') return p;
    try { return JSON.stringify(p); } catch { return ''; }
  }
}
