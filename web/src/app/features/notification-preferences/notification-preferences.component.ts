import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AlertView, NotificationPreferencesApi } from './notification-preferences-api.service';

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="notifications-page" data-testid="notification-preferences">
      <header class="page-header">
        <h1>Notifications</h1>
      </header>

      @if (error()) { <p class="error" role="alert" data-testid="prefs-error">{{ error() }}</p> }

      <section class="panel">
        <h2>Alert preferences</h2>
        <form data-testid="prefs-form" (ngSubmit)="save()">
          <label>
            <input type="checkbox" name="orderAlerts" data-testid="pref-order-alerts" [(ngModel)]="orderAlerts" />
            Order alerts
          </label>
          <label>
            <input type="checkbox" name="messageAlerts" data-testid="pref-message-alerts" [(ngModel)]="messageAlerts" />
            Message alerts
          </label>
          <button type="submit" data-testid="save-preferences" [disabled]="busy()">Save</button>
          @if (saved()) { <span data-testid="prefs-saved">Saved</span> }
        </form>
      </section>

      <section class="panel">
        <h2>Alerts</h2>
        <ul data-testid="alerts-list">
          @for (a of alerts(); track a.id) {
            <li [attr.data-testid]="'alert-' + a.id" [attr.data-type]="a.type">
              {{ a.type === 'ORDER' ? 'Order' : 'Message' }}: {{ a.body }}
              <small>{{ a.createdAt | date: 'short' }}</small>
            </li>
          } @empty {
            <li class="muted" data-testid="alerts-empty">No alerts.</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .notifications-page { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
    .panel { margin-bottom: 1.5rem; }
    .panel ul { list-style: none; padding: 0; }
    .panel li { padding: 0.25rem 0; }
    form { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
  `],
})
export class NotificationPreferencesComponent implements OnInit {
  private readonly api = inject(NotificationPreferencesApi);

  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);
  readonly alerts = signal<AlertView[]>([]);
  orderAlerts = true;
  messageAlerts = true;

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (p) => {
        this.orderAlerts = p?.orderAlerts !== false;
        this.messageAlerts = p?.messageAlerts !== false;
      },
      error: () => this.error.set('Could not load notification preferences.'),
    });
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.api.alerts().subscribe({
      next: (list) => this.alerts.set(Array.isArray(list) ? list : []),
      error: () => this.error.set('Could not load alerts.'),
    });
  }

  save(): void {
    this.busy.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.api.save({ orderAlerts: this.orderAlerts, messageAlerts: this.messageAlerts }).subscribe({
      next: (p) => {
        this.orderAlerts = p?.orderAlerts ?? this.orderAlerts;
        this.messageAlerts = p?.messageAlerts ?? this.messageAlerts;
        this.busy.set(false);
        this.saved.set(true);
        this.loadAlerts();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not save notification preferences.');
      },
    });
  }
}
