/**
 * invoice-generation.spec.ts — Story: invoice-generation.
 * All /api/** traffic is intercepted; nothing reaches the network. One shared
 * in-memory state lets the vendor and customer flows observe each other.
 */
import { test, expect, type Page } from '@playwright/test';

interface Invoice {
  id: string; orderId: string; vendorUserId: string; customerUserId: string;
  number: string; totalCents: number; createdAt: string;
}

interface State {
  user: { id: string; email: string; name: string; role: string } | null;
  orders: { id: string; customerUserId: string; vendorUserId: string; status: 'PENDING' | 'CONFIRMED';
    estimatedDeliveryDate: string | null; createdAt: string;
    items: { productId: string; quantity: number; unitPriceCents: number; product: { name: string } }[] }[];
  invoices: Invoice[];
  downloads: string[];
}

function newState(): State {
  return {
    user: null,
    orders: [{
      id: 'o1', customerUserId: 'u1', vendorUserId: 'v1', status: 'CONFIRMED',
      estimatedDeliveryDate: '2026-11-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
      items: [{ productId: 'p1', quantity: 3, unitPriceCents: 500, product: { name: 'Widget' } }],
    }],
    invoices: [],
    downloads: [],
  };
}

async function mockApi(page: Page, state: State): Promise<void> {
  // Register at context level so download navigation requests are also intercepted.
  await page.context().route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = new URL(req.url());
    const apiPath = url.pathname.replace(/^.*\/api\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      const email = (req.postDataJSON() as { email?: string })?.email ?? '';
      const role = email.includes('manager') ? 'MANAGER' : 'USER';
      state.user = { id: role === 'MANAGER' ? 'v1' : 'u1', email, name: email.split('@')[0], role };
      return json(state.user);
    }
    if (method === 'GET' && (apiPath === 'users/me' || apiPath === 'auth/me')) {
      return state.user ? json(state.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'GET' && apiPath === 'vendor/orders') {
      const status = (url.searchParams.get('status') ?? '').toUpperCase();
      return json(state.orders.filter((o) => o.vendorUserId === state.user?.id && (!status || o.status === status)));
    }
    if (method === 'GET' && apiPath === 'invoices') {
      const id = state.user?.id;
      return json(state.invoices.filter((i) => i.vendorUserId === id || i.customerUserId === id));
    }
    const gen = /^vendor\/orders\/([^/]+)\/invoice$/.exec(apiPath);
    if (method === 'POST' && gen) {
      const o = state.orders.find((x) => x.id === gen[1] && x.vendorUserId === state.user?.id);
      if (!o) return json({ message: 'not found' }, 404);
      if (state.invoices.some((i) => i.orderId === o.id)) return json({ message: 'exists' }, 409);
      const inv: Invoice = {
        id: `i${state.invoices.length + 1}`, orderId: o.id, vendorUserId: o.vendorUserId,
        customerUserId: o.customerUserId, number: `INV-${String(state.invoices.length + 1).padStart(6, '0')}`,
        totalCents: o.items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0),
        createdAt: new Date().toISOString(),
      };
      state.invoices.push(inv);
      return json(inv, 201);
    }
    const dl = /^orders\/([^/]+)\/invoice\/download$/.exec(apiPath);
    if (method === 'GET' && dl) {
      const inv = state.invoices.find((i) => i.orderId === dl[1] && i.customerUserId === state.user?.id);
      if (!inv) return json({ message: 'not found' }, 404);
      state.downloads.push(inv.number);
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': `attachment; filename="${inv.number}.pdf"` },
        body: '%PDF-1.4\n%%EOF\n',
      });
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
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out visitor to /#/invoices is redirected to /#/login', async ({ page }) => {
  await mockApi(page, newState());
  await page.goto('/#/invoices');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('vendor generates an invoice; customer sees and downloads it as a PDF', async ({ browser }) => {
  const state = newState();

  const vendorCtx = await browser.newContext({ serviceWorkers: 'block' });
  const vendor = await vendorCtx.newPage();
  await mockApi(vendor, state);
  await loginAs(vendor, 'manager@example.com');
  await vendor.goto('/#/invoices');
  await expect(vendor.getByTestId('invoices-page')).toBeVisible();
  await vendor.getByTestId('generate-invoice-o1').click();
  await expect(vendor.getByTestId('invoice-status-o1')).toContainText('Invoice generated');
  await expect(vendor.getByTestId('generate-invoice-o1')).toHaveCount(0);
  await expect(vendor.getByTestId('invoice-list')).toContainText('INV-000001');
  await expect(vendor.getByTestId('invoices-error')).toHaveCount(0);
  expect(state.invoices).toHaveLength(1);
  expect(state.invoices[0].totalCents).toBe(1500);

  const customerCtx = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  const customer = await customerCtx.newPage();
  await mockApi(customer, state);
  await loginAs(customer, 'user@example.com');
  await customer.goto('/#/invoices');
  await expect(customer.getByTestId('invoices-page')).toBeVisible();
  await expect(customer.locator('[data-testid^="generate-invoice-"]')).toHaveCount(0);
  await expect(customer.getByTestId('invoice-list')).toContainText(/INV-\d{6}/);
  const [download] = await Promise.all([
    customer.waitForEvent('download'),
    customer.getByTestId('invoice-download-i1').click(),
  ]);
  // Await save to disk so the route handler has finished before we read state.
  await download.path();
  expect(download.suggestedFilename()).toBe('INV-000001.pdf');
  expect(state.downloads).toEqual(['INV-000001']);
  await expect(customer.getByTestId('invoices-error')).toHaveCount(0);

  await vendorCtx.close();
  await customerCtx.close();
});
