// tests/e2e/library.spec.ts
import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchWithProject, collectErrors, assertNoErrors } from './helpers';

const SAMPLE_METHOD = `---
id: lite
version: 1.0.0
name: Lite Cycle
description: Short.
---

## Stage: req
mode: interactive

Collect.

## Stage: impl
mode: auto

Implement.
`;

test('Library shows methodologies from project .sherpa/core/methodologies/', async () => {
  const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-test-proj-'));
  const methDir = join(projectPath, '.sherpa', 'core', 'methodologies');
  mkdirSync(methDir, { recursive: true });
  writeFileSync(join(methDir, 'lite.md'), SAMPLE_METHOD);

  const { app, page, cleanup } = await launchWithProject({
    projectPath,
    scaffoldSherpaDir: false,
  });
  const errors = collectErrors(page);
  try {
    // Open Library via Tools menu
    await page.locator('text=Tools').first().click();
    await page.locator('text=Methodology library').waitFor({ timeout: 5000 });
    await page.locator('text=Methodology library').click();

    // Library should show the methodology — heading appears in the detail pane
    // after the list item is auto-selected. Use role-based locators to avoid
    // strict-mode violations from the duplicate list-item + heading text nodes.
    await expect(page.getByRole('heading', { name: 'Lite Cycle' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Short.')).toBeVisible();

    assertNoErrors(errors);
  } finally {
    await cleanup();
  }
});
