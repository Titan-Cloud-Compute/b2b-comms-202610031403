import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CUSTOMER_INVITE_API, inviteErrorMessage } from './customer-invite.component';

/** Story: customer-invite — PUBLIC activation page opened from the invitation email. */
@Component({
  selector: 'app-customer-invite-accept',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="customer-invite-page">
      <h1>Activate your customer account</h1>
      @if (loading()) {
        <p class="muted">Checking your invitation…</p>
      } @else if (activated()) {
        <p class="success" role="status" data-testid="customer-activate-success">
          Your account is ready. <a routerLink="/login">Sign in</a>
        </p>
      } @else if (invalid()) {
        <p class="error" role="alert" data-testid="customer-activate-invalid">{{ invalid() }}</p>
      } @else {
        <form class="invite-form" data-testid="customer-activate-form" (ngSubmit)="activate()">
          <p>Invitation for <strong data-testid="customer-activate-email">{{ email() }}</strong></p>
          <label for="customer-activate-name">Your name</label>
          <input id="customer-activate-name" name="name" [(ngModel)]="name" data-testid="customer-activate-name" />
          <label for="customer-activate-password">Choose a password (min. 8 characters)</label>
          <input id="customer-activate-password" name="password" type="password" required minlength="8"
                 [(ngModel)]="password" data-testid="customer-activate-password" />
          <button type="submit" class="btn-primary" [disabled]="password.length < 8 || busy()"
                  data-testid="customer-activate-submit">Activate account</button>
          @if (error()) { <p class="error" role="alert" data-testid="customer-activate-error">{{ error() }}</p> }
        </form>
      }
    </div>
  `,
  styles: [`
    .customer-invite-page { max-width: 560px; margin: 0 auto; padding: 2rem 1rem; }
    .invite-form { display: flex; flex-direction: column; gap: 0.5rem; }
  `],
})
export class CustomerInviteAcceptComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  private token = '';
  name = '';
  password = '';
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly email = signal('');
  readonly invalid = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly activated = signal(false);

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.invalid.set('This activation link is missing its token.');
      this.loading.set(false);
      return;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<{ email: string }>(`${CUSTOMER_INVITE_API}/check`, { params: { token: this.token } }),
      );
      this.email.set(res.email);
    } catch (err) {
      this.invalid.set(inviteErrorMessage(err, 'This invitation is invalid or has expired.'));
    } finally {
      this.loading.set(false);
    }
  }

  async activate(): Promise<void> {
    if (this.busy() || this.password.length < 8) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post(`${CUSTOMER_INVITE_API}/accept`, {
          token: this.token,
          name: this.name.trim() || undefined,
          password: this.password,
        }),
      );
      this.activated.set(true);
    } catch (err) {
      this.error.set(inviteErrorMessage(err, 'Could not activate your account.'));
    } finally {
      this.busy.set(false);
    }
  }
}
