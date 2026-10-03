import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, User } from './auth.service';
import { PREVIEW_MODE } from './preview/preview-mode';

/**
 * Protects all routes inside the signed-in shell (the LayoutComponent parent).
 *
 * Feature cards: add `canActivate: [authGuard]` to the parent layout route,
 * or to individual routes that require authentication.
 *
 * Signed-out visitors are redirected to /login.
 */
export const authGuard: CanActivateFn = () => {
  if (PREVIEW_MODE) return true;
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login']);
};

/**
 * Role-based guard factory for restricted routes.
 *
 * Usage:
 *   canActivate: [roleGuard('ADMIN')]
 *   canActivate: [roleGuard('ADMIN', 'SUPER_ADMIN')]
 *
 * - Signed-out users are redirected to /login.
 * - Signed-in users whose role is not in the allowed list are redirected
 *   to /dashboard.
 * - Signed-in users with a matching role proceed normally.
 */
export function roleGuard(...roles: User['role'][]): CanActivateFn {
  return () => {
    if (PREVIEW_MODE) return true;
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
    const user = auth.user();
    if (user && roles.includes(user.role)) return true;
    return router.createUrlTree(['/dashboard']);
  };
}
