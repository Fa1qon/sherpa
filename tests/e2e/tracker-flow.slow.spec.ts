// tests/e2e/tracker-flow.slow.spec.ts
//
// UX scenarios for the Sherpa Tracker. Each test boots the full Electron app,
// opens a temp project, and exercises a real user flow.
//
// Run with: npm run test:e2e -- tests/e2e/tracker-flow.slow.spec.ts
// (Use --timeout=120000 if machine is slow)

import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

test.describe('Tracker E2E', () => {
  let projectPath: string;
  let cleanupFn: (() => Promise<void>) | undefined;

  test.beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'sherpa-tracker-proj-'));
    cleanupFn = undefined;
  });

  test.afterEach(async () => {
    if (cleanupFn) {
      await cleanupFn();
    }
    try { rmSync(projectPath, { recursive: true, force: true }); } catch { }
  });

  // -------------------------------------------------------------------------
  // T-TRACKER-01: Board opens and shows 3 default columns
  // -------------------------------------------------------------------------
  test('T-TRACKER-01 — Board view shows 3 default columns', async () => {
    const { app, page, cleanup } = await launchWithProject({ projectPath });
    cleanupFn = cleanup;
    const errors = collectErrors(page);
    try {
      // Wait for project to be open (task list visible)
      await expect(page.locator('[data-testid="open-board-btn"]')).toBeVisible({ timeout: 10000 });

      // Click the Board button in the sidebar
      await page.locator('[data-testid="open-board-btn"]').click();

      // Kanban board should appear
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });

      // Expect 3 default columns
      await expect(page.locator('[data-testid="column-backlog"]')).toBeVisible();
      await expect(page.locator('[data-testid="column-in-progress"]')).toBeVisible();
      await expect(page.locator('[data-testid="column-done"]')).toBeVisible();

      assertNoErrors(errors);
    } finally {
      await cleanup();
      cleanupFn = undefined; // app already closed; let afterEach skip double-close
    }
  });

  // -------------------------------------------------------------------------
  // T-TRACKER-02: Create a task, add it to board, see it in Backlog
  // -------------------------------------------------------------------------
  test('T-TRACKER-02 — Task added to board appears in Backlog column', async () => {
    const { app, page, cleanup } = await launchWithProject({ projectPath });
    cleanupFn = cleanup;
    const errors = collectErrors(page);
    try {
      // Create a task via IPC and add it to the board
      await page.evaluate(async (p: string) => {
        const task = await window.sherpa.task.create({ title: 'Fix the bug', projectPath: p });
        await window.sherpa.tracker.addTaskToBoard(p, task.id, 'backlog');
      }, projectPath);

      // Open board
      await page.locator('[data-testid="open-board-btn"]').click();
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });

      // Card should be in Backlog
      const backlog = page.locator('[data-testid="column-backlog"]');
      await expect(backlog.locator('text=Fix the bug')).toBeVisible({ timeout: 8000 });

      assertNoErrors(errors);
    } finally {
      await cleanup();
      cleanupFn = undefined;
    }
  });

  // -------------------------------------------------------------------------
  // T-TRACKER-03: Drag task from Backlog to In Progress via mouse
  // -------------------------------------------------------------------------
  test('T-TRACKER-03 — Drag task from Backlog to In Progress', async () => {
    const { app, page, cleanup } = await launchWithProject({ projectPath });
    cleanupFn = cleanup;
    const errors = collectErrors(page);
    let taskId: string;
    try {
      taskId = await page.evaluate(async (p: string) => {
        const task = await window.sherpa.task.create({ title: 'Implement feature', projectPath: p });
        await window.sherpa.tracker.addTaskToBoard(p, task.id, 'backlog');
        return task.id;
      }, projectPath);

      // Open board
      await page.locator('[data-testid="open-board-btn"]').click();
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });

      // Ensure card is visible in Backlog
      const card = page.locator(`[data-testid="task-card-${taskId}"]`);
      await expect(card).toBeVisible({ timeout: 8000 });

      // Drag to In Progress column
      const target = page.locator('[data-testid="column-in-progress"]');
      const cardBox = await card.boundingBox();
      const targetBox = await target.boundingBox();
      if (!cardBox || !targetBox) throw new Error('Could not get bounding boxes');

      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 15 });
      await page.mouse.up();

      // Card should now appear in In Progress
      await expect(
        page.locator('[data-testid="column-in-progress"]').locator('text=Implement feature'),
      ).toBeVisible({ timeout: 8000 });

      // Verify in DB
      const dbPath = join(projectPath, '.sherpa', 'sherpa.db');
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare('SELECT tracker_stage_id FROM tasks WHERE id = ?').get(taskId) as { tracker_stage_id: string };
      db.close();
      expect(row.tracker_stage_id).toBe('in-progress');

      assertNoErrors(errors);
    } finally {
      await cleanup();
      cleanupFn = undefined;
    }
  });

  // -------------------------------------------------------------------------
  // T-TRACKER-04: Click task card opens TaskWorkspace
  // -------------------------------------------------------------------------
  test('T-TRACKER-04 — Clicking task card opens TaskWorkspace', async () => {
    const { app, page, cleanup } = await launchWithProject({ projectPath });
    cleanupFn = cleanup;
    const errors = collectErrors(page);
    let taskId: string;
    try {
      taskId = await page.evaluate(async (p: string) => {
        const task = await window.sherpa.task.create({ title: 'Review PR', projectPath: p });
        await window.sherpa.tracker.addTaskToBoard(p, task.id, 'in-progress');
        return task.id;
      }, projectPath);

      // Open board
      await page.locator('[data-testid="open-board-btn"]').click();
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });

      // Click card
      const card = page.locator(`[data-testid="task-card-${taskId}"]`);
      await expect(card).toBeVisible({ timeout: 8000 });
      await card.click();

      // TaskWorkspace should open (chat input visible)
      await expect(page.locator('textarea')).toBeVisible({ timeout: 8000 });

      assertNoErrors(errors);
    } finally {
      await cleanup();
      cleanupFn = undefined;
    }
  });

  // -------------------------------------------------------------------------
  // T-TRACKER-05: Board settings — add a stage, save, see new column
  // -------------------------------------------------------------------------
  test('T-TRACKER-05 — Add a stage in Board Settings and see new column', async () => {
    const { app, page, cleanup } = await launchWithProject({ projectPath });
    cleanupFn = cleanup;
    const errors = collectErrors(page);
    try {
      // Open board
      await page.locator('[data-testid="open-board-btn"]').click();
      await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible({ timeout: 8000 });

      // Open board settings
      await page.locator('[data-testid="board-settings-btn"]').click();
      await expect(page.locator('[data-testid="board-settings-dialog"]')).toBeVisible({ timeout: 5000 });

      // Add a new stage
      await page.locator('[data-testid="add-stage-btn"]').click();

      // Find the new stage input (last one)
      const inputs = page.locator('[data-testid^="stage-name-input-"]');
      const count = await inputs.count();
      const lastInput = inputs.nth(count - 1);
      await lastInput.fill('Review');

      // Save
      await page.locator('[data-testid="save-board-settings-btn"]').click();

      // Dialog should close and new column appear
      await expect(page.locator('[data-testid="board-settings-dialog"]')).not.toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Review')).toBeVisible({ timeout: 5000 });

      // Verify in DB
      const dbPath = join(projectPath, '.sherpa', 'sherpa.db');
      const db = new Database(dbPath, { readonly: true });
      const row = db.prepare("SELECT stages_json FROM tracker_board_config WHERE sub_project_id = ''").get() as { stages_json: string };
      db.close();
      const stages = JSON.parse(row.stages_json) as Array<{ name: string }>;
      expect(stages.some((s) => s.name === 'Review')).toBe(true);

      assertNoErrors(errors);
    } finally {
      await cleanup();
      cleanupFn = undefined;
    }
  });

  // -------------------------------------------------------------------------
  // T-TRACKER-06: Task stage badge appears in sidebar task list
  // -------------------------------------------------------------------------
  test('T-TRACKER-06 — Stage badge visible in task list for board tasks', async () => {
    const { app, page, cleanup } = await launchWithProject({ projectPath });
    cleanupFn = cleanup;
    const errors = collectErrors(page);
    try {
      await page.evaluate(async (p: string) => {
        const task = await window.sherpa.task.create({ title: 'Has badge', projectPath: p });
        await window.sherpa.tracker.addTaskToBoard(p, task.id, 'backlog');
      }, projectPath);

      // The task list should show a stage badge (.stageBadge element)
      const badgeSelector = '[class*="stageBadge"]';
      await expect(page.locator(badgeSelector)).toBeVisible({ timeout: 10000 });

      assertNoErrors(errors);
    } finally {
      await cleanup();
      cleanupFn = undefined;
    }
  });
});
