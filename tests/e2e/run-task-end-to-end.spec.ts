// tests/e2e/run-task-end-to-end.spec.ts
//
// End-to-end task creation flow. Updated for Plan 8b task flow
// (NewTaskDialog + forced methodology removed; TaskSettingsPanel is optional).
//
// SHERPA_STUB_ADAPTER=1: engine resolves turns immediately, no real Claude CLI.

import { test, expect } from '@playwright/test';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

test('Create Task → TaskWorkspace renders → no errors', async () => {
  const { page, cleanup } = await launchWithProject({
    extraEnv: { SHERPA_STUB_ADAPTER: '1' },
  });
  const errors = collectErrors(page);
  try {
    await expect(page.locator('[data-testid="workspace-loaded"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="new-task-button"]').click();
    await expect(page.locator('[data-testid="task-workspace"]')).toBeVisible({ timeout: 10000 });
    assertNoErrors(errors);
  } finally {
    await cleanup();
  }
});
