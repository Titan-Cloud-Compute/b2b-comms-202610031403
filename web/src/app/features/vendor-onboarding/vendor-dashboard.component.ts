import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VendorOnboardingApi } from './vendor-onboarding-api.service';
import { VENDOR_STYLES } from './vendor-onboarding.styles';
import type { VendorProfileDto } from './vendor-onboarding.types';

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,
  imports: [RouterLink],
  styles: [VENDOR_STYLES],
  template: `
    <section class="vendor-page" data-testid="vendor-dashboard">
      <h1>Vendor dashboard</h1>
      @if (profile(); as p) {
        <div class="vendor-card">
          <strong data-testid="vendor-dashboard-company">{{ p.companyName }}</strong>
          <p class="hint">{{ p.contactName }} · {{ p.contactEmail }}</p>
        </div>
      }
      <nav class="vendor-links">
        <a routerLink="/vendor/documents" data-testid="vendor-dashboard-documents-link">Compliance documents</a>
        <a routerLink="/vendor/onboarding" data-testid="vendor-dashboard-edit-profile-link">Edit profile</a>
      </nav>
    </section>
  `,
})
export class VendorDashboardComponent implements OnInit {
  private api = inject(VendorOnboardingApi);
  profile = signal<VendorProfileDto | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.profile.set(await this.api.getProfile());
    } catch {
      this.profile.set(null);
    }
  }
}
