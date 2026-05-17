// tests/e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  retries: 0,
  // Electron e2e cannot run in parallel — each test launches its own Electron
  // process, and concurrent launches conflict on userData / debugger ports.
  workers: 1,
  fullyParallel: false,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
});
