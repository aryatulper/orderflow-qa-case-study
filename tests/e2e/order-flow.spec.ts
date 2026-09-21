import { expect, test } from '@playwright/test';

// UI tests follow the customer journey; API tests cover deeper edge cases separately.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Arya Customer · customer')).toBeVisible();
  await expect(page.locator('#login-panel')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
});

test('customer places and pays for an order', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Canvas Tote to cart' }).click();
  await expect(page.locator('#cart-items').getByText('1 × Canvas Tote', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();
  const firstOrder = page.locator('.order').first();
  await expect(firstOrder.getByText('PENDING PAYMENT')).toBeVisible();
  await firstOrder.getByRole('button', { name: 'Pay (simulated)' }).click();
  await expect(page.locator('.order').first().getByText('PAID', { exact: true })).toBeVisible();
  await expect(page.locator('.order').first().getByText('Payments: 1')).toBeVisible();
});

test('customer cancels an unpaid order and stock is returned', async ({ page }) => {
  const product = page.locator('.product').filter({ hasText: 'Ceramic Mug' });
  const stockBefore = Number((await product.locator('.stock').textContent())?.split(' ')[0]);
  await product.getByRole('button', { name: 'Add Ceramic Mug to cart' }).click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(product.locator('.stock')).toHaveText(`${stockBefore - 1} in stock`);
  await page.locator('.order').first().getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.locator('.order').first().getByText('CANCELLED')).toBeVisible();
  await expect(product.locator('.stock')).toHaveText(`${stockBefore} in stock`);
});
