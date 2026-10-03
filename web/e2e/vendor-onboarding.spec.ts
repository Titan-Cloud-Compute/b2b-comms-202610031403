/**
 * Story: vendor-onboarding — hermetic e2e (static SPA, every /api/** mocked).
 */
import { test, expect, type Page } from '@playwright/test';

interface Doc { id: string; name: string; type: string; status: string; createdAt: string }

async function mockApi(page: Page): Promise<void> {
  const store: {
    user: { id: string; email: string; role: string } | null;
    profile: Record<string, unknown> | null;
    docs: Doc[];
  } = { user: null, profile: null, docs: [] };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      store.user = { id: 'v1', email: 'vendor@example.com', role: 'USER' };
      return json(store.user);
    }
    if (method === 'GET' && (apiPath === 'users/me' || apiPath === 'auth/me')) {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (apiPath === 'vendor/profile') {
      if (method === 'GET') return json(store.profile);
      const body = req.postDataJSON() as Record<string, unknown>;
      const now = new Date().toISOString();
      store.profile = { id: 'vp1', ...body, completed: true, createdAt: now, updatedAt: now };
      return json(store.profile);
    }
    if (apiPath === 'vendor/documents') {
      if (method === 'GET') return json(store.docs);
      if (!store.profile) return json({ message: 'complete your vendor profile' }, 409);
      const doc: Doc = {
        id: `vd${store.docs.length + 1}`, name: 'iso-9001.pdf', type: 'compliance',
        status: 'PENDING_REVIEW', createdAt: new Date().toISOString(),
      };
      store.docs.unshift(doc);
      return json(doc, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill('vendor@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
}

async function submitProfile(page: Page): Promise<void> {
  await page.goto('/#/vendor/onboarding');
  const form = page.locator('[data-testid="vendor-profile-form"]');
  await form.locator('#companyName').fill('Acme Supplies');
  await form.locator('#contactName').fill('Ann Vendor');
  await form.locator('#contactEmail').fill('ann@acme.test');
  await form.locator('[data-testid="vendor-profile-submit"]').click();
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); await login(page); });

test('vendor dashboard is gated until the profile is submitted', async ({ page }) => {
  await page.goto('/#/vendor/dashboard');
  await expect(page).toHaveURL(/#\/vendor\/onboarding/);
  await expect(page.locator('[data-testid="vendor-profile-form"] #companyName')).toBeVisible();
  await expect(page.locator('[data-placeholder]')).toHaveCount(0);
});

test('submitting the company profile unlocks the vendor dashboard', async ({ page }) => {
  await submitProfile(page);
  await expect(page).toHaveURL(/#\/vendor\/dashboard/);
  await expect(page.locator('[data-testid="vendor-dashboard-company"]')).toHaveText('Acme Supplies');
});

test('uploaded compliance document appears in the library as Pending review', async ({ page }) => {
  await submitProfile(page);
  await expect(page).toHaveURL(/#\/vendor\/dashboard/);
  await page.goto('/#/vendor/documents');
  await expect(page.locator('[data-testid="vendor-document-library"]')).toBeVisible();
  await page.locator('#documentFile').setInputFiles({
    name: 'iso-9001.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4'),
  });
  await page.locator('[data-testid="vendor-document-upload-submit"]').click();
  const status = page.locator('[data-testid="vendor-document-status"]');
  await expect(status).toHaveCount(1);
  await expect(status.first()).toHaveText('Pending review');
  expect(await page.locator('body').innerText()).not.toContain('PENDING_REVIEW');
});
