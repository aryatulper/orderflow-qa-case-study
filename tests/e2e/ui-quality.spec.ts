import { expect, request, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('direct file preview stays styled and explains how to run the shop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('public/index.html')).href);

  await expect(page.locator('#local-file-help')).toBeVisible();
  await expect(page.locator('#login-panel')).toBeHidden();
  await expect(page.locator('.site-nav')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Open the running shop' })).toHaveAttribute('href', 'http://localhost:3000');
  expect(await page.locator('html').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(243, 241, 233)');
  expect(errors).toEqual([]);
});

test('mobile sign-in is reachable and demo accounts are clear', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.site-nav')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport();

  await page.locator('[data-demo-email="admin@example.test"]').click();
  await expect(page.locator('#email')).toHaveValue('admin@example.test');
  await expect(page.locator('[data-demo-email="admin@example.test"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#current-user')).toContainText('Demo Admin');
  await expect(page.locator('.cart-panel')).toBeHidden();
  await expect(page.locator('.site-nav')).toBeVisible();
});

test('catalog and checkout fit mobile and desktop without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.product')).toHaveCount(4);

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(width);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Add Canvas Tote to cart' }).click();
  await expect(page.locator('#cart-count')).toHaveText('1 item');
  await page.locator('#place-order').click();
  const order = page.locator('.order').first();
  await expect(order).toBeFocused();
  await expect(order.getByText('PENDING PAYMENT')).toBeVisible();
  const orderId = await order.getAttribute('data-order-id');
  await page.locator('#order-filter').selectOption('CANCELLED');
  await expect(page.locator(`.order[data-order-id="${orderId}"]`)).toBeHidden();
  await page.locator('#order-filter').selectOption('');
  await expect(page.locator(`.order[data-order-id="${orderId}"]`)).toBeVisible();
});

test('admin refund form explains the remaining balance before submitting', async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const login = await api.post('/api/login', { data: { email: 'arya@example.test', password: 'demo123' } });
    const token = (await login.json()).token;
    const auth = { Authorization: `Bearer ${token}` };
    const created = await api.post('/api/orders', { headers: auth, data: { items: [{ productId: 2, quantity: 1 }] } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).order.id;
    const paid = await api.post(`/api/orders/${id}/payments`, { headers: { ...auth, 'Idempotency-Key': `ui-refund-${id}` } });
    expect(paid.status()).toBe(201);

    await page.goto('/');
    await page.locator('[data-demo-email="admin@example.test"]').click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const order = page.locator(`.order[data-order-id="${id}"]`);
    await expect(order.locator('.refund-hint')).toContainText('TRY 179.00');
    await order.locator('.refund-input').fill('9999');
    await order.getByRole('button', { name: 'Issue refund' }).click();
    await expect(page.locator('#notice')).toContainText('Enter an amount between');
    await expect(order.getByText('PAID', { exact: true })).toBeVisible();

    await order.locator('.refund-input').fill('20.00');
    await order.getByRole('button', { name: 'Issue refund' }).click();
    await expect(order.getByText('PARTIALLY REFUNDED')).toBeVisible();
    await expect(order.locator('.refund-hint')).toContainText('TRY 159.00');
  } finally {
    await api.dispose();
  }
});
