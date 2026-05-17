// tests/e2e/methodology-flow.slow.spec.ts
//
// Methodology flow tests with SHERPA_STUB_ADAPTER=1.

import { test, expect } from '@playwright/test';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

// Minimal methodology that satisfies isMethodology() type guard:
//   - id, version, name, description: string
//   - stages: Stage[] — each stage needs id, name, mode, contract.input[], contract.output.path
//   - edges: Edge[] — can be empty for a single-stage methodology
const TEST_METHODOLOGY = {
  id: 'test-flow',
  version: '1.0.0',
  name: 'Test Flow',
  description: 'Minimal methodology for E2E flow testing.',
  stages: [
    {
      id: 'stage-a',
      name: 'Stage A',
      mode: 'auto' as const,
      contract: {
        input: [],
        output: { path: 'stage-a-output.md' },
      },
    },
  ],
  edges: [],
};

test.describe('Methodology Flow', () => {
  // -------------------------------------------------------------------------
  // MF-01: Save a methodology via IPC, open library, verify it appears
  // -------------------------------------------------------------------------
  test('MF-01 — saved methodology appears in library', async () => {
    const { page, projectPath, cleanup } = await launchWithProject();
    const errors = collectErrors(page);
    try {
      await page.evaluate(
        async ({ pp, m }) => {
          await window.sherpa.methodology.save(pp, m as Parameters<typeof window.sherpa.methodology.save>[1]);
        },
        { pp: projectPath, m: TEST_METHODOLOGY },
      );

      await page.locator('text=Tools').first().click();
      await page.locator('text=Methodology library').waitFor({ timeout: 5000 });
      await page.locator('text=Methodology library').click();
      await expect(page.getByRole('heading', { name: 'Test Flow' })).toBeVisible({ timeout: 8000 });

      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // MF-02: Create a new task with stub adapter, verify TaskWorkspace renders
  // -------------------------------------------------------------------------
  test('MF-02 — new task opens workspace without errors (stub adapter)', async () => {
    const { page, cleanup } = await launchWithProject({
      extraEnv: { SHERPA_STUB_ADAPTER: '1' },
    });
    const errors = collectErrors(page);
    try {
      await page.locator('[data-testid="new-task-button"]').click();
      await expect(page.locator('[data-testid="task-workspace"]')).toBeVisible({ timeout: 10000 });
      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });
});
