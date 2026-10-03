/**
 * customer-invite.spec.ts — Story: customer-invite.
 * All /api/** traffic is intercepted; nothing reaches the network.
 */
import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page) {
  const state = {
    user: null as { id: string; email: string; name: string; role: string } | null,
    invites: [] as { email: string; companyName?: string }[],
    accepted: [] as { token: string; password: string }[],
  };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = new URL(req.url());
    const apiPath = url.pathname.replace(/^.*\/api\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      const email = (req.postDataJSON() as { email?: string })?.email ?? '';
      const role = email.includes('admin') ? 'ADMIN' : 'USER';
      state.user = { id: role === 'ADMIN' ? 'a1' : 'u1', email, name: email.split('@')[0], role };
      return json(state.user);
    }
    if (method === 'GET' && (apiPath === 'users/me' || apiPath === 'auth/me')) {
      return state.user ? json(state.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'POST' && apiPath === 'customer-invites') {
      if (state.user?.role !== 'ADMIN') return json({ message: 'Forbidden' }, 403);
      const body = req.postDataJSON() as { email: string; companyName?: string };
      if (body.email === 'taken@example.com') {
        return json({ message: 'an account with this email already exists' }, 409);
      }
      state.invites.push(body);
      return json({ id: 'i1', email: body.email, companyName: body.companyName ?? null, expiresAt: '2026-10-10T00:00:00.000Z' });
    }
    if (method === 'GET' && apiPath === 'customer-invites/check') {
      const token = url.searchParams.get('token');
      if (token === 'good-token' && state.accepted.length === 0) {
        return json({ email: 'cust@example.com', companyName: 'Acme', expiresAt: '2026-10-10T00:00:00.000Z' });
      }
      return json({ message: 'invitation already used' }, 410);
    }
    if (method === 'POST' && apiPath === 'customer-invites/accept') {
      const body = req.postDataJSON() as { token: string; password: string };
      state.accepted.push(body);
      return json({ id: 'u9', email: 'cust@example.com', role: 'USER' });
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
  return state;
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out visitor to /#/customers/invite is redirected to /#/login', async ({ page }) => {
  await mockApi(page);
  await page.goto('/#/customers/invite');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('admin sends a customer invitation and sees success and error states', async ({ page }) => {
  const state = await mockApi(page);
  await loginAs(page, 'admin@example.com');
  await page.goto('/#/customers/invite');
  await expect(page.getByRole('heading', { name: 'Invite customer' })).toBeVisible();

  await page.getByTestId('customer-invite-email').fill('cust@example.com');
  await page.getByTestId('customer-invite-company').fill('Acme');
  await page.getByTestId('customer-invite-submit').click();
  await expect(page.getByTestId('customer-invite-success')).toContainText('cust@example.com');
  expect(state.invites).toEqual([{ email: 'cust@example.com', companyName: 'Acme' }]);

  await page.getByTestId('customer-invite-email').fill('taken@example.com');
  await page.getByTestId('customer-invite-submit').click();
  await expect(page.getByTestId('customer-invite-error')).toContainText('already exists');
});

test('non-admin cannot open the invite page', async ({ page }) => {
  await mockApi(page);
  await loginAs(page, 'user@example.com');
  await page.goto('/#/customers/invite');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('customer-invite-form')).toHaveCount(0);
});

test('public activation link, opened once, activates the customer account', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/#/customer-invite/accept?token=good-token');
  await expect(page.getByTestId('customer-activate-email')).toHaveText('cust@example.com');
  await page.getByTestId('customer-activate-name').fill('Cust');
  await page.getByTestId('customer-activate-password').fill('password1234');
  await page.getByTestId('customer-activate-submit').click();
  await expect(page.getByTestId('customer-activate-success')).toBeVisible();
  expect(state.accepted).toEqual([{ token: 'good-token', name: 'Cust', password: 'password1234' }]);

  await page.goto('/#/customer-invite/accept?token=good-token');
  await page.reload();
  await expect(page.getByTestId('customer-activate-invalid')).toContainText('already used');
});
