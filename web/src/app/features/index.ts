import { Routes } from '@angular/router';
import { authGuard } from '../shared/auth.guard';
import { vendorProfileCompleteGuard } from './vendor-onboarding/vendor-onboarding.guard';

/**
 * Feature route registry.
 *
 * Each story appends its Angular routes to this array.
 * app.routes.ts spreads FEATURE_ROUTES before the wildcard catch-all so new
 * feature routes are picked up automatically.
 *
 * Example (in features/my-feature/my-feature.routes.ts):
 *
 *   import { FEATURE_ROUTES } from '../index';
 *   FEATURE_ROUTES.push({ path: 'my-feature', loadComponent: () => ... });
 *
 * Or add routes here directly.
 */
export const FEATURE_ROUTES: Routes = [
  // Story: vendor-onboarding — rendered inside the signed-in sidebar shell.
  {
    path: 'vendor',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'onboarding',
        loadComponent: () => import('./vendor-onboarding/vendor-profile.component').then(m => m.VendorProfileComponent),
      },
      {
        path: 'dashboard',
        canActivate: [vendorProfileCompleteGuard],
        loadComponent: () => import('./vendor-onboarding/vendor-dashboard.component').then(m => m.VendorDashboardComponent),
      },
      {
        path: 'documents',
        loadComponent: () => import('./vendor-onboarding/vendor-documents.component').then(m => m.VendorDocumentsComponent),
      },
    ],
  },
];
