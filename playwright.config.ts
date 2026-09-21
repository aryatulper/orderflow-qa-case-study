import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // These journeys share seeded stock; serial execution keeps evidence deterministic.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['junit', { outputFile: 'reports/playwright.xml' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
