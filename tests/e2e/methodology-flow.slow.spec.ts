// tests/e2e/methodology-flow.slow.spec.ts
//
// Methodology flow tests with SHERPA_STUB_ADAPTER=1.

import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Stage IDs in the feature-dev methodology (order matters for progress check).
const FEATURE_DEV_STAGES = [
  'requirements',
  'research',
  'design',
  'cases-synthesis',
  'plan',
  'implement',
  'finish',
] as const;

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
      await expect(page.getByText('Test Flow')).toBeVisible({ timeout: 8000 });

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

  // -------------------------------------------------------------------------
  // MF-03: feature-dev methodology runs all 7 stages autonomously
  //
  // Uses SHERPA_STUB_ADAPTER=1 (agent responds immediately) + strictness_mode
  // 'autonomous' (all gate items auto-pass, no artifact checks needed).
  // The supervisor engine drives the full RDPI pipeline without user input.
  //
  // Tests:
  //   1. E2E test infrastructure can exercise methodology stage progression
  //   2. feature-dev methodology definition is syntactically valid and runnable
  //   3. StagesPanel correctly reflects all-stages-completed state in the UI
  // -------------------------------------------------------------------------
  test('MF-03 — feature-dev methodology runs all stages autonomously (stub adapter)', async () => {
    // Build a temp project dir pre-populated with the feature-dev methodology.
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-mf03-'));
    mkdirSync(join(projectPath, '.sherpa', 'core', 'methodologies'), { recursive: true });
    // The service resolves `${id}.yaml` so the file must be named `feature-dev.yaml`
    // (matching the methodology id), not `feature_dev.yaml` (the source file name).
    copyFileSync(
      join(process.cwd(), '.sherpa', 'core', 'methodologies', 'feature_dev.yaml'),
      join(projectPath, '.sherpa', 'core', 'methodologies', 'feature-dev.yaml'),
    );

    const { page, cleanup } = await launchWithProject({
      projectPath,
      scaffoldSherpaDir: false,
      extraEnv: { SHERPA_STUB_ADAPTER: '1' },
    });
    const errors = collectErrors(page);

    try {
      // Open the Tasks sidebar so TasksPanel mounts and subscribes to task events
      // BEFORE creating the task — ensures live event-driven refresh works.
      await page.locator('[aria-label="Tasks"]').click();
      await page.locator('[aria-label="Tasks"][data-active="true"]').waitFor({ timeout: 5000 });

      // Create a task with:
      //   - methodology_selection_mode: 'manual' → supervisor bootstraps engine
      //   - methodologyId: 'feature-dev'
      //   - strictness_mode: 'autonomous' → all gate items auto-pass
      //   - autoStart: true (default) → supervisor.start() fires immediately
      // The MethodologyRunner walks all 7 stages in one fire-and-forget run.
      await page.evaluate(async (args: { pp: string }) => {
        await window.sherpa.task.create({
          title: 'Proxy Feature',
          methodology_selection_mode: 'manual' as const,
          methodologyId: 'feature-dev',
          strictness_mode: 'autonomous' as const,
          projectPath: args.pp,
          autoStart: true,
        });
      }, { pp: projectPath });

      // Task appears in the sidebar (TasksPanel refreshes on incoming task events).
      await page.locator('button[title="Proxy Feature"]').waitFor({ timeout: 15000 });
      await page.locator('button[title="Proxy Feature"]').click();

      // Workspace loads.
      await expect(page.locator('[data-testid="task-workspace"]')).toBeVisible({ timeout: 10000 });

      // Stages panel must be visible — methodology task always shows it.
      await expect(page.locator('[data-testid="stages-panel"]')).toBeVisible({ timeout: 10000 });

      // All 7 stages should reach 'completed'.
      // StagesPanel reads from both runtime events (if engine still running) and
      // meta.stage_history (persisted) — so this assertion holds even if the
      // engine finished before the workspace opened.
      for (const stageId of FEATURE_DEV_STAGES) {
        await expect(page.locator(`[data-testid="stage-row-${stageId}"]`))
          .toHaveAttribute('data-status', 'completed', { timeout: 30000 });
      }

      assertNoErrors(errors);
    } finally {
      await cleanup();
    }
  });
});
