/**
 * shared-channel.spec.ts — Story: shared-channel.
 * All /api/** traffic is intercepted; nothing reaches the network.
 */
import { test, expect, type Page } from '@playwright/test';

interface Msg { id: string; channelId: string; authorId: string; authorName: string; body: string; createdAt: string }

async function mockApi(page: Page): Promise<{ created: unknown[] }> {
  const state = {
    user: null as { id: string; email: string; name: string; role: string } | null,
    created: [] as unknown[],
    channels: [
      {
        id: 'c1',
        name: 'Acme support',
        createdById: 'v1',
        createdAt: '2026-10-01T00:00:00.000Z',
        members: [
          { userId: 'v1', role: 'VENDOR', name: 'Vendor', email: 'manager@example.com' },
          { userId: 'u1', role: 'CUSTOMER', name: 'Customer', email: 'user@example.com' },
        ],
      },
    ],
    messages: [] as Msg[],
  };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname.replace(/^.*\/api\//, '');
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
    if (method === 'GET' && apiPath === 'channels') return json(state.channels);
    if (method === 'GET' && apiPath === 'channels/customers') {
      return json([{ id: 'u1', name: 'Customer', email: 'user@example.com' }]);
    }
    if (method === 'POST' && apiPath === 'channels') {
      const body = req.postDataJSON() as { name: string; customerIds: string[] };
      state.created.push(body);
      const ch = { id: 'c2', name: body.name, createdById: 'v1', createdAt: new Date().toISOString(), members: [] };
      state.channels = [ch, ...state.channels];
      return json(ch);
    }
    const msgMatch = /^channels\/([^/]+)\/messages$/.exec(apiPath);
    if (msgMatch && method === 'GET') return json(state.messages.filter((m) => m.channelId === msgMatch[1]));
    if (msgMatch && method === 'POST') {
      const { body } = req.postDataJSON() as { body: string };
      const m: Msg = {
        id: `m${state.messages.length + 1}`,
        channelId: msgMatch[1],
        authorId: state.user?.id ?? '',
        authorName: state.user?.name ?? '',
        body,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(m);
      return json(m);
    }
    const streamMatch = /^channels\/([^/]+)\/stream$/.exec(apiPath);
    if (streamMatch) {
      const live: Msg = {
        id: 'live-1',
        channelId: streamMatch[1],
        authorId: 'u1',
        authorName: 'Customer',
        body: 'Hello from the customer (live)',
        createdAt: '2026-10-02T00:00:00.000Z',
      };
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'cache-control': 'no-cache' },
        body: `retry: 60000\ndata: ${JSON.stringify(live)}\n\n`,
      });
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
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out visitor to /#/channels is redirected to /#/login', async ({ page }) => {
  await mockApi(page);
  await page.goto('/#/channels');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('vendor (MANAGER) sees channel list and creates a shared channel with a customer', async ({ page }) => {
  const state = await mockApi(page);
  await loginAs(page, 'manager@example.com');
  await page.goto('/#/channels');
  await expect(page.getByTestId('channel-list')).toBeVisible();
  await expect(page.getByTestId('create-channel-form')).toBeVisible();
  await expect(page.getByTestId('channel-list')).toContainText('Acme support');

  await page.getByTestId('channel-name-input').fill('Globex');
  await page.getByTestId('customer-option-u1').check();
  await page.getByTestId('create-channel-submit').click();
  await expect(page.getByTestId('channel-list')).toContainText('Globex');
  expect(state.created).toEqual([{ name: 'Globex', customerIds: ['u1'] }]);
});

test('customer (USER) sees the shared channel, posts, and receives live messages', async ({ page }) => {
  await mockApi(page);
  await loginAs(page, 'user@example.com');
  await page.goto('/#/channels');
  await expect(page.getByTestId('channel-list')).toContainText('Acme support');
  await expect(page.getByTestId('create-channel-form')).toHaveCount(0);

  await page.getByTestId('channel-item-c1').click();
  await expect(page.getByTestId('channel-thread')).toBeVisible();
  // Real-time: message pushed over the SSE stream appears without reload.
  await expect(page.getByTestId('message-list')).toContainText('Hello from the customer (live)');

  await page.getByTestId('message-input').fill('Order #42 status?');
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-list')).toContainText('Order #42 status?');
});
