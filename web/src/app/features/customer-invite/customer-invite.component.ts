import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

/** Relative base so the browser resolves it against the document base href. */
export const CUSTOMER_INVITE_API = 'api/customer-invites';

export function inviteErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const msg = (err.error as { message?: unknown } | null)?.message;
    if (typeof msg === 'string' && msg) return msg;
    if (Array.isArray(msg) && msg.length) return String(msg[0]);
  }
  return fallback;
}

/** Story: customer-invite — ADMIN form that emails a customer an activation link. */
@Component({
  selector: 'app-customer-invite',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="customer-invite-page">
      <header class="page-header">
        <h1>Invite customer</h1>
        <p class="muted">The customer receives an email with a single-use activation link.</p>
      </header>
      <form class="invite-form" data-testid="customer-invite-form" (ngSubmit)="send()">
        <label for="customer-invite-email">Customer email</label>
        <input id="customer-invite-email" name="email" type="email" required [(ngModel)]="email"
               data-testid="customer-invite-email" autocomplete="off" />
        <label for="customer-invite-company">Company name (optional)</label>
        <input id="customer-invite-company" name="companyName" [(ngModel)]="companyName"
               data-testid="customer-invite-company" />
        <button type="submit" class="btn-primary" [disabled]="!email.trim() || busy()"
                data-testid="customer-invite-submit">Send invitation</button>
        @if (sentTo()) {
          <p class="success" role="status" data-testid="customer-invite-success">Invitation sent to {{ sentTo() }}.</p>
        }
        @if (error()) {
          <p class="error" role="alert" data-testid="customer-invite-error">{{ error() }}</p>
        }
      </form>
    </div>
  `,
  styles: [`
    .customer-invite-page { max-width: 560px; margin: 0 auto; padding: 2rem 1rem; }
    .invite-form { display: flex; flex-direction: column; gap: 0.5rem; }
  `],
})
export class CustomerInviteComponent {
  private readonly http = inject(HttpClient);

  email = '';
  companyName = '';
  readonly busy = signal(false);
  readonly sentTo = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  async send(): Promise<void> {
    const email = this.email.trim();
    if (!email || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.sentTo.set(null);
    try {
      const body: { email: string; companyName?: string } = { email };
      if (this.companyName.trim()) body.companyName = this.companyName.trim();
      const res = await firstValueFrom(
        this.http.post<{ email: string }>(CUSTOMER_INVITE_API, body, { withCredentials: true }),
      );
      this.sentTo.set(res?.email ?? email);
      this.email = '';
      this.companyName = '';
    } catch (err) {
      this.error.set(inviteErrorMessage(err, 'Could not send the invitation. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }
}
