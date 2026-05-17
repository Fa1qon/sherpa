import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    headless: true,
    screenshot: 'off'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
