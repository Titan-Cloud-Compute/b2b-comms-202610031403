import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { VendorOnboardingApi } from './vendor-onboarding-api.service';

/** The vendor dashboard is only reachable once the vendor profile is complete. */
export const vendorProfileCompleteGuard: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    const profile = await inject(VendorOnboardingApi).getProfile();
    if (profile?.completed) return true;
  } catch {
    /* fall through to onboarding */
  }
  return router.createUrlTree(['/vendor/onboarding']);
};
