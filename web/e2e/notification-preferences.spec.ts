/**
 * notification-preferences.spec.ts — Story: notification-preferences.
 * All /api/** traffic is intercepted; nothing reaches the network. The mock
 * applies the same effective-dated filtering the backend does.
 */
import { test, expect, type Page } from '@playwright/test';

interface Pref { orderAlerts: boolean; messageAlerts: boolean; effectiveAt: string }
interface Event { id: string; type: 'ORDER' | 'MESSAGE'; body: string; createdAt: string }
interface State {
  user: { id: string; email: string; name: string; role: string } | null;
  prefs: Pref[];
  events: Event[];
  saves: unknown[];
}

let clock = Date.UTC(2026, 9, 3, 12, 0);
const tick = () => new Date((clock += 60_000)).toISOString();

function newState(): State {
  return {
    user: null,
    prefs: [],
    events: [
      { id: 'n1', type: 'ORDER', body: 'Order o1 confirmed', createdAt: tick() },
      { id: 'm1', type: 'MESSAGE', body: 'Hello from vendor', createdAt: tick() },
    ],
    saves: [],
  };
}

function prefAt(state: State, at: string) {
  let cur = { orderAlerts: true, messageAlerts: true };
  for (const p of state.prefs) if (p.effectiveAt <= at) cur = p;
  return cur;
}

async function mockApi(page: Page, state: State): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname.replace(/^.*\/api\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      const email = (req.postDataJSON() as { email?: string })?.email ?? '';
      state.user = { id: 'u1', email, name: 'user', role: 'USER' };
      return json(state.user);
    }
    if (method === 'GET' && (apiPath === 'users/me' || apiPath === 'auth/me')) {
      return state.user ? json(state.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (apiPath === 'notification-preferences') {
      if (method === 'PUT') {
        const body = req.postDataJSON() as { orderAlerts: boolean; messageAlerts: boolean };
        state.saves.push(body);
        const row = { ...body, effectiveAt: tick() };
        state.prefs.push(row);
        return json(row);
      }
      const last = state.prefs[state.prefs.length - 1];
      return json(last ?? { orderAlerts: true, messageAlerts: true, effectiveAt: null });
    }
    if (method === 'GET' && apiPath === 'notifications') {
      return json(
        state.events
          .filter((e) => (e.type === 'ORDER' ? prefAt(state, e.createdAt).orderAlerts : prefAt(state, e.createdAt).messageAlerts))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out visitor to /#/notifications is redirected to /#/login', async ({ page }) => {
  await mockApi(page, newState());
  await page.goto('/#/notifications');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
});

test('turning order alerts off hides later order events but keeps messages and earlier alerts', async ({ page }) => {
  const state = newState();
  await mockApi(page, state);
  await login(page);

  await expect(page.locator('a[href*="notifications"]').first()).toBeVisible();
  await page.goto('/#/notifications');
  const root = page.getByTestId('notification-preferences');
  await expect(root.locator('h1')).toHaveText('Notifications');
  const order = page.getByTestId('pref-order-alerts');
  const message = page.getByTestId('pref-message-alerts');
  await expect(order).toBeChecked();
  await expect(message).toBeChecked();
  await expect(page.getByTestId('alert-n1')).toBeVisible();
  await expect(page.getByTestId('alert-m1')).toBeVisible();

  await order.uncheck();
  await page.getByTestId('save-preferences').click();
  await expect(page.getByTestId('prefs-saved')).toBeVisible();
  expect(state.saves).toEqual([{ orderAlerts: false, messageAlerts: true }]);

  state.events.push({ id: 'n2', type: 'ORDER', body: 'Order o2 confirmed', createdAt: tick() });
  state.events.push({ id: 'm2', type: 'MESSAGE', body: 'New message', createdAt: tick() });
  await page.reload();

  await expect(page.getByTestId('pref-order-alerts')).not.toBeChecked();
  await expect(page.getByTestId('pref-message-alerts')).toBeChecked();
  const list = page.getByTestId('alerts-list');
  await expect(list.getByTestId('alert-m2')).toBeVisible();
  await expect(list.getByTestId('alert-n1')).toBeVisible();
  await expect(list.getByTestId('alert-m1')).toBeVisible();
  await expect(list.getByTestId('alert-n2')).toHaveCount(0);
});
