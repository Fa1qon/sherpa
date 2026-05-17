// tests/e2e/tabs.spec.ts
import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

const METH = `---
id: t
version: 1.0.0
name: Test
description: ''
---

## Stage: s1
mode: auto
`;

test('multi-tab: open Library + Settings, switch, close', async () => {
  const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-test-proj-'));
  mkdirSync(join(projectPath, '.sherpa', 'core', 'methodologies'), { recursive: true });
  writeFileSync(join(projectPath, '.sherpa/core/methodologies/t.md'), METH);

  const { app, page, cleanup } = await launchWithProject({
    projectPath,
    scaffoldSherpaDir: false,
  });
  const errors = collectErrors(page);
  try {
    // Initially: workspace tab is active.
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    await expect(
      page.locator('[role="tab"]').filter({ hasText: /Workspace|Рабочая/ }),
    ).toBeVisible();

    // Open Library tab (via Tools menu).
    await page.locator('text=Tools').first().click();
    await page.locator('text=Methodology library').click();
    await expect(
      page.locator('[role="tab"]').filter({ hasText: /Library|Библиотека/ }),
    ).toBeVisible();

    // Open Settings tab (via Project menu).
    await page.locator('text=Project').first().click();
    await page.locator('text=Project settings').click();
    await expect(
      page.locator('[role="tab"]').filter({ hasText: /Settings|Настройки/ }),
    ).toBeVisible();

    // Should have 3 tabs now (workspace + library + settings).
    await expect(page.locator('[role="tab"]')).toHaveCount(3);

    // Switch back to Library — the methodology "Test" should be visible in the library view.
    await page
      .locator('[role="tab"]')
      .filter({ hasText: /Library|Библиотека/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Test' })).toBeVisible({ timeout: 10000 });

    // Close Settings tab via its × button.
    const settingsTab = page
      .locator('[role="tab"]')
      .filter({ hasText: /Settings|Настройки/ });
    await settingsTab.locator('button[aria-label="Close tab"]').click();
    await expect(page.locator('[role="tab"]')).toHaveCount(2);

    assertNoErrors(errors);
  } finally {
    await cleanup();
  }
});
