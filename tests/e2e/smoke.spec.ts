// tests/e2e/smoke.spec.ts
//
// Smoke tests: open each Sherpa screen, verify no JS errors + key elements visible.

import { test, expect } from '@playwright/test';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

test.describe('Smoke — all screens', () => {
  test('S-SMOKE-01 — empty workspace renders without errors', async () => {
    const { page, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await expect(page.locator('[data-testid="workspace-loaded"]')).toBeVisible();
      await expect(page.locator('[data-testid="new-task-button"]')).toBeVisible();
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });

  test('S-SMOKE-02 — kanban board opens without errors', async () => {
    const { page, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await expect(page.locator('[data-testid="open-board-btn"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="open-board-btn"]').click();
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('[data-testid="column-backlog"]')).toBeVisible();
      await expect(page.locator('[data-testid="column-in-progress"]')).toBeVisible();
      await expect(page.locator('[data-testid="column-done"]')).toBeVisible();
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });

  test('S-SMOKE-03 — new task workspace opens without errors', async () => {
    const { page, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await page.locator('[data-testid="new-task-button"]').click();
      await expect(page.locator('[data-testid="task-workspace"]')).toBeVisible({ timeout: 10000 });
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });

  test('S-SMOKE-04 — settings screen opens without errors', async () => {
    const { page, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await page.locator('text=Project').first().click();
      await page.locator('text=Project settings').waitFor({ timeout: 5000 });
      await page.locator('text=Project settings').click();
      await page.waitForTimeout(1000);
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });

  test('S-SMOKE-05 — methodology library opens without errors', async () => {
    const { page, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await page.locator('text=Tools').first().click();
      await page.locator('text=Methodology library').waitFor({ timeout: 5000 });
      await page.locator('text=Methodology library').click();
      await page.waitForTimeout(1000);
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });

  test('S-SMOKE-06 — rapid tab switching produces no errors', async () => {
    const { page, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await page.locator('[data-testid="new-task-button"]').click();
      await expect(page.locator('[data-testid="task-workspace"]')).toBeVisible({ timeout: 10000 });
      await page.locator('[data-testid="open-board-btn"]').click();
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });
      await page.waitForTimeout(500);
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });
});
