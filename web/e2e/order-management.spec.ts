/**
 * order-management.spec.ts — Story: order-management.
 * All /api/** traffic is intercepted; nothing reaches the network. One shared
 * in-memory state lets the customer and vendor flows observe each other.
 */
import { test, expect, type Page } from '@playwright/test';

interface Order {
  id: string;
  customerUserId: string;
  vendorUserId: string;
  status: 'PENDING' | 'CONFIRMED';
  estimatedDeliveryDate: string | null;
  createdAt: string;
  items: { productId: string; quantity: number; unitPriceCents: number; product: { name: string } }[];
}

interface State {
  user: { id: string; email: string; name: string; role: string } | null;
  products: { id: string; vendorUserId: string; name: string; description: null; unitPriceCents: number }[];
  orders: Order[];
  notifications: { id: string; userId: string; orderId: string; kind: string; body: string; createdAt: string }[];
  submitted: unknown[];
  confirmed: unknown[];
}

function newState(): State {
  return {
    user: null,
    products: [
      { id: 'p1', vendorUserId: 'v1', name: 'Widget', description: null, unitPriceCents: 500 },
      { id: 'p2', vendorUserId: 'v1', name: 'Gadget', description: null, unitPriceCents: 1200 },
    ],
    orders: [],
    notifications: [],
    submitted: [],
    confirmed: [],
  };
}

async function mockApi(page: Page, state: State): Promise<void> {
  await page.route('**/api/**', async (route) => {
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
    if (method === 'GET' && apiPath === 'vendors') {
      return json([{ id: 'v1', name: 'Acme Supplies', email: 'manager@example.com' }]);
    }
    const catalog = /^vendors\/([^/]+)\/products$/.exec(apiPath);
    if (method === 'GET' && catalog) {
      return json(state.products.filter((p) => p.vendorUserId === catalog[1]));
    }
    if (method === 'GET' && apiPath === 'vendor/products') {
      return json(state.products.filter((p) => p.vendorUserId === state.user?.id));
    }
    if (method === 'POST' && apiPath === 'orders') {
      const body = req.postDataJSON() as { vendorId: string; items: { productId: string; quantity: number }[] };
      state.submitted.push(body);
      const order: Order = {
        id: `o${state.orders.length + 1}`,
        customerUserId: state.user?.id ?? '',
        vendorUserId: body.vendorId,
        status: 'PENDING',
        estimatedDeliveryDate: null,
        createdAt: new Date().toISOString(),
        items: body.items.map((i) => {
          const p = state.products.find((x) => x.id === i.productId)!;
          return { ...i, unitPriceCents: p.unitPriceCents, product: { name: p.name } };
        }),
      };
      state.orders.push(order);
      return json(order);
    }
    if (method === 'GET' && apiPath === 'orders') {
      return json(state.orders.filter((o) => o.customerUserId === state.user?.id));
    }
    if (method === 'GET' && apiPath === 'orders/notifications') {
      return json(state.notifications.filter((n) => n.userId === state.user?.id));
    }
    if (method === 'GET' && apiPath === 'vendor/orders') {
      const status = (url.searchParams.get('status') ?? '').toUpperCase();
      return json(
        state.orders.filter((o) => o.vendorUserId === state.user?.id && (!status || o.status === status)),
      );
    }
    const confirm = /^orders\/([^/]+)\/confirm$/.exec(apiPath);
    if (method === 'PATCH' && confirm) {
      const { estimatedDeliveryDate } = req.postDataJSON() as { estimatedDeliveryDate: string };
      state.confirmed.push({ id: confirm[1], estimatedDeliveryDate });
      const o = state.orders.find((x) => x.id === confirm[1])!;
      o.status = 'CONFIRMED';
      o.estimatedDeliveryDate = `${estimatedDeliveryDate}T00:00:00.000Z`;
      state.notifications.push({
        id: `n${state.notifications.length + 1}`,
        userId: o.customerUserId,
        orderId: o.id,
        kind: 'ORDER_CONFIRMED',
        body: `Your order ${o.id} has been confirmed. Estimated delivery: ${estimatedDeliveryDate}.`,
        createdAt: new Date().toISOString(),
      });
      return json(o);
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

test('signed-out visitor to /#/orders is redirected to /#/login', async ({ page }) => {
  await mockApi(page, newState());
  await page.goto('/#/orders');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('customer orders from the catalog; vendor confirms; customer is notified', async ({ browser }) => {
  const state = newState();

  // Customer submits a purchase order from the vendor catalog.
  const customerCtx = await browser.newContext({ serviceWorkers: 'block' });
  const customer = await customerCtx.newPage();
  await mockApi(customer, state);
  await loginAs(customer, 'user@example.com');
  await customer.goto('/#/orders');
  await expect(customer.getByTestId('orders-page')).toBeVisible();
  await expect(customer.getByTestId('product-catalog')).toBeVisible();
  await expect(customer.getByTestId('order-queue')).toHaveCount(0);
  await customer.getByTestId('vendor-select').selectOption('v1');
  await expect(customer.getByTestId('catalog-product-p1')).toContainText('Widget');
  await customer.getByTestId('product-qty-p1').fill('3');
  await customer.getByTestId('submit-order').click();
  await expect(customer.getByTestId('my-order-status-o1')).toHaveText('Pending');
  expect(state.submitted).toEqual([{ vendorId: 'v1', items: [{ productId: 'p1', quantity: 3 }] }]);

  // Vendor sees it pending in the queue and confirms with a delivery date.
  const vendorCtx = await browser.newContext({ serviceWorkers: 'block' });
  const vendor = await vendorCtx.newPage();
  await mockApi(vendor, state);
  await loginAs(vendor, 'manager@example.com');
  await vendor.goto('/#/orders');
  await expect(vendor.getByTestId('order-queue')).toBeVisible();
  await expect(vendor.getByTestId('vendor-products')).toContainText('Widget');
  await expect(vendor.getByTestId('queue-status-o1')).toHaveText('Pending');
  await vendor.getByTestId('delivery-date-o1').fill('2026-11-01');
  await vendor.getByTestId('confirm-order-o1').click();
  await expect(vendor.getByTestId('queue-status-o1')).toHaveText('Confirmed');
  expect(state.confirmed).toEqual([{ id: 'o1', estimatedDeliveryDate: '2026-11-01' }]);

  // Customer sees the confirmation notification and the confirmed status.
  state.user = { id: 'u1', email: 'user@example.com', name: 'user', role: 'USER' };
  await customer.reload();
  await expect(customer.getByTestId('order-notifications')).toContainText('has been confirmed');
  await expect(customer.getByTestId('my-order-status-o1')).toHaveText('Confirmed');

  await customerCtx.close();
  await vendorCtx.close();
});
