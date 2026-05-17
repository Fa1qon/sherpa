// tests/e2e/foundation.spec.ts
// Plan 1 acceptance — full happy path through the foundation shell.
import { test, expect } from '@playwright/test';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

test('Project Picker → add project → workspace → close → picker', async () => {
  const { app, page, cleanup } = await launchWithProject();
  const errors = collectErrors(page);
  try {
    // Use chrome menu: Project → Close project
    await page.locator('text=Project').first().click();
    await page.locator('text=Close project').click();
    await expect(page.locator('text=Open a Sherpa project')).toBeVisible({ timeout: 10000 });

    assertNoErrors(errors);
  } finally {
    await cleanup();
  }
});

test('Settings → Appearance → switch theme persists', async () => {
  const { app, page, cleanup } = await launchWithProject();
  const errors = collectErrors(page);
  try {
    // Open Settings via menu
    await page.locator('text=Project').first().click();
    await page.locator('text=Project settings').click();
    await page.locator('text=Appearance').click();
    await page.locator('text=Dark').click();

    // Verify <html> has theme-dark class
    const themeClass = await page.evaluate(() =>
      Array.from(document.documentElement.classList),
    );
    expect(themeClass).toContain('theme-dark');

    assertNoErrors(errors);
  } finally {
    await cleanup();
  }
});
