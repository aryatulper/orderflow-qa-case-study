import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#products .product').first().waitFor();
  await mkdir('docs/assets', { recursive: true });
  await page.screenshot({ path: 'docs/assets/storefront.png', animations: 'disabled' });
  console.log('Captured docs/assets/storefront.png');
} finally {
  await browser.close();
}
