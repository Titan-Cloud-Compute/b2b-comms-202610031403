import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VendorOnboardingApi } from './vendor-onboarding-api.service';
import { VENDOR_STYLES } from './vendor-onboarding.styles';
import type { UpsertVendorProfileRequest } from './vendor-onboarding.types';

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  imports: [FormsModule],
  styles: [VENDOR_STYLES],
  template: `
    <section class="vendor-page">
      <h1>Vendor onboarding</h1>
      <p class="hint">Tell us about your company. Your vendor dashboard unlocks once your profile is saved.</p>
      <form class="vendor-card" data-testid="vendor-profile-form" (ngSubmit)="submit()" #f="ngForm">
        <div class="vendor-field">
          <label for="companyName">Company name</label>
          <input id="companyName" name="companyName" required [(ngModel)]="model.companyName" />
        </div>
        <div class="vendor-field">
          <label for="contactName">Contact name</label>
          <input id="contactName" name="contactName" required [(ngModel)]="model.contactName" />
        </div>
        <div class="vendor-field">
          <label for="contactEmail">Contact email</label>
          <input id="contactEmail" name="contactEmail" type="email" required email [(ngModel)]="model.contactEmail" />
        </div>
        <div class="vendor-field">
          <label for="contactPhone">Contact phone</label>
          <input id="contactPhone" name="contactPhone" type="tel" [(ngModel)]="model.contactPhone" />
        </div>
        <div class="vendor-field">
          <label for="address">Address</label>
          <input id="address" name="address" [(ngModel)]="model.address" />
        </div>
        @if (error()) { <p class="vendor-error" role="alert">{{ error() }}</p> }
        <button class="vendor-btn" type="submit" data-testid="vendor-profile-submit" [disabled]="saving() || f.invalid">
          {{ saving() ? 'Saving…' : 'Save profile' }}
        </button>
      </form>
    </section>
  `,
})
export class VendorProfileComponent implements OnInit {
  private api = inject(VendorOnboardingApi);
  private router = inject(Router);

  model: UpsertVendorProfileRequest = { companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: '' };
  saving = signal(false);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const p = await this.api.getProfile();
      if (p) {
        this.model = {
          companyName: p.companyName,
          contactName: p.contactName,
          contactEmail: p.contactEmail,
          contactPhone: p.contactPhone ?? '',
          address: p.address ?? '',
        };
      }
    } catch {
      /* new vendor — empty form */
    }
  }

  async submit(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.saveProfile(this.model);
      await this.router.navigate(['/vendor/dashboard']);
    } catch (e) {
      this.error.set(e instanceof Error && e.message ? e.message : 'Could not save your profile. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
