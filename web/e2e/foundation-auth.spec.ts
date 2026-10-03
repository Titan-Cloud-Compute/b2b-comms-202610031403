/**
 * foundation-auth.spec.ts
 *
 * E2E tests for authGuard and roleGuard (web/src/app/shared/auth.guard.ts).
 * All /api/** traffic is intercepted — nothing reaches the network.
 */
import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page): Promise<void> {
  const store: { user: { id: string; email: string; name: string; role: string } | null } = {
    user: null,
  };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '')
      .replace(/^api\//, '')
      .replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      let postBody: { email?: string } = {};
      try {
        postBody = req.postDataJSON() as { email?: string };
      } catch {
        /* ignore parse errors */
      }
      const email = postBody?.email ?? '';
      const role = email.includes('admin') ? 'ADMIN' : email.includes('manager') ? 'MANAGER' : 'USER';
      store.user = { id: '1', email, name: email.split('@')[0], role };
      return json(store.user);
    }
    if (method === 'GET' && (apiPath === 'users/me' || apiPath === 'auth/me')) {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('signed-out visitor to /#/dashboard is redirected to /#/login', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('signed-out visitor to /#/admin/overview is redirected to /#/login', async ({ page }) => {
  await page.goto('/#/admin/overview');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('USER visiting /#/admin/users is redirected to /#/dashboard', async ({ page }) => {
  await loginAs(page, 'user@example.com');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await page.goto('/#/admin/users');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/dashboard/);
});

test('MANAGER session persists across a page reload', async ({ page }) => {
  await loginAs(page, 'manager@example.com');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await expect(page.locator('aside.sidebar')).toBeVisible();
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/dashboard/);
  await expect(page.locator('aside.sidebar')).toBeVisible();
});
