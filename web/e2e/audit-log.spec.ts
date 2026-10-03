/**
 * Admin Audit Log page: /admin/audit-log with a sidebar entry, ADMIN-only guard
 * and a newest-first table. Runs under playwright.hermetic.config.ts (static SPA,
 * hash routing, every /api/** call mocked here — nothing reaches the network).
 */
import { test, expect, type Page } from '@playwright/test';

const ROWS = [
  { id: 'r1', actor: 'SYSTEM', actorUserId: null, actorUser: null, action: 'system.seed', payloadJson: {}, createdAt: '2026-10-01T08:00:00.000Z' },
  { id: 'r3', actor: 'ADMIN', actorUserId: '1', actorUser: { id: '1', email: 'admin@example.com', name: 'Admin' }, action: 'auth.login', payloadJson: {}, createdAt: '2026-10-03T10:00:00.000Z' },
  { id: 'r2', actor: 'USER', actorUserId: '2', actorUser: { id: '2', email: 'user@example.com', name: 'User' }, action: 'auth.password_change', payloadJson: {}, createdAt: '2026-10-02T09:00:00.000Z' },
];

async function mockApi(page: Page): Promise<void> {
  const store: { user: { id: string; email: string; role: string } | null } = { user: null };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      let postBody: { email?: string } = {};
      try { postBody = req.postDataJSON() as { email?: string }; } catch { /* ignore */ }
      const email = postBody?.email ?? 'user@example.com';
      const role = email.includes('admin') ? 'ADMIN' : 'USER';
      store.user = { id: '1', email, role };
      return json(store.user);
    }
    if (method === 'GET' && (apiPath === 'users/me' || apiPath === 'auth/me')) {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'GET' && apiPath === 'admin/audit-log') {
      if (store.user?.role !== 'ADMIN') return json({ message: 'Forbidden' }, 403);
      return json({ rows: ROWS, total: ROWS.length, page: 1, pageSize: 50 });
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function loginAs(page: Page, email: string, landing: RegExp): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(landing, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); });

test('admin sees the audit log via the sidebar, newest event first', async ({ page }) => {
  await loginAs(page, 'admin@example.com', /#\/admin\/overview/);

  const link = page.locator('aside.sidebar a[href*="admin/audit-log"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#\/admin\/audit-log/);

  const rows = page.locator('[data-testid="audit-log-row"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('[data-testid="audit-log-action"]')).toHaveText('auth.login');
  await expect(rows.last().locator('[data-testid="audit-log-action"]')).toHaveText('system.seed');
  await expect(page.locator('[data-testid="audit-log-error"]')).toHaveCount(0);
});

test('non-admin cannot open the audit log', async ({ page }) => {
  await loginAs(page, 'user@example.com', /#\/dashboard/);
  await expect(page.locator('aside.sidebar a[href*="admin/audit-log"]')).toHaveCount(0);
  await page.goto('/#/admin/audit-log');
  await page.waitForLoadState('networkidle');
  expect(page.url()).not.toMatch(/#\/admin\/audit-log/);
  await expect(page.locator('[data-testid="audit-log-row"]')).toHaveCount(0);
});
