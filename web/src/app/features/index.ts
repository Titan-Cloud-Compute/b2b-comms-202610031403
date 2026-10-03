import { Routes } from '@angular/router';
import { authGuard, roleGuard } from '../shared/auth.guard';
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
  // Story: customer-invite — ADMIN invite form inside the authenticated layout.
  {
    path: 'customers',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: 'invite',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () =>
          import('./customer-invite/customer-invite.component').then(m => m.CustomerInviteComponent),
      },
    ],
  },
  // Story: customer-invite — PUBLIC activation page opened from the invitation email.
  {
    path: 'customer-invite/accept',
    loadComponent: () =>
      import('./customer-invite/customer-invite-accept.component').then(m => m.CustomerInviteAcceptComponent),
    data: { hideSupportFooter: true },
  },
  // Story: shared-channel — rendered inside the authenticated layout.
  {
    path: 'channels',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./shared-channel/shared-channel.component').then(m => m.SharedChannelComponent),
      },
    ],
  },
  // Story: order-management — customer catalog/purchase orders + vendor order queue.
  {
    path: 'orders',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./order-management/order-management.component').then(m => m.OrderManagementComponent),
      },
    ],
  },
  // Story: invoice-generation — vendors invoice confirmed orders, customers download PDFs.
  {
    path: 'invoices',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./invoice-generation/invoice-generation.component').then(m => m.InvoiceGenerationComponent),
      },
    ],
  },
  // Story: notification-preferences — alert toggles + filtered alerts feed.
  {
    path: 'notifications',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    data: { rendersSupportFooterInLayout: true },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./notification-preferences/notification-preferences.component').then(
            m => m.NotificationPreferencesComponent,
          ),
      },
    ],
  },
];
