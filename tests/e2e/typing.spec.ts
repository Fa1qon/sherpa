// tests/e2e/typing.spec.ts
// Regression: typing in StageForm name field must persist every character (no focus loss).
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

initial prompt
`;

test('typing in StageForm name field persists every character', async () => {
  const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-test-proj-'));
  mkdirSync(join(projectPath, '.sherpa', 'core', 'methodologies'), { recursive: true });
  writeFileSync(join(projectPath, '.sherpa/core/methodologies/t.md'), METH);

  const { app, page, cleanup } = await launchWithProject({
    projectPath,
    scaffoldSherpaDir: false,
  });
  const errors = collectErrors(page);
  try {
    // Open Library
    await page.locator('text=Tools').first().click();
    await page.locator('text=Methodology library').click();
    await expect(page.getByRole('heading', { name: 'Test' })).toBeVisible({ timeout: 10000 });

    // Enter Edit mode (English locale: "Edit")
    await page.getByRole('button', { name: 'Edit' }).click();

    // Click on the s1 stage node in the canvas to surface StageForm
    await page.locator('.react-flow__node').filter({ hasText: /^s1/ }).first().click();

    // StageForm should be visible
    await expect(page.locator('[data-testid="stage-form"]')).toBeVisible({ timeout: 5000 });

    // Find the name input (default name = id = "s1" from parser).
    // The id field has the same value but is readonly, so we target the writable one.
    const nameInput = page.locator('[data-testid="stage-form"] input:not([readonly])').first();
    await nameInput.click();
    await nameInput.fill('');

    // Type via the page keyboard (Электрон route'ит реальные key events через RFP).
    // pressSequentially with small delay mimics human typing best.
    await nameInput.focus();
    await page.keyboard.type('Renamed', { delay: 30 });

    // Assert the input visibly retained every character + focus did not get stolen mid-typing.
    await expect(nameInput).toHaveValue('Renamed');
    await expect(nameInput).toBeFocused();

    // Also type into the prompt textarea (more text).
    const promptArea = page.locator('[data-testid="stage-form"] textarea').first();
    await promptArea.click();
    await promptArea.fill('');
    await promptArea.focus();
    await page.keyboard.type('Hello world from user', { delay: 30 });
    await expect(promptArea).toHaveValue('Hello world from user');
    await expect(promptArea).toBeFocused();

    // Russian (Cyrillic) input — the original user-reported failure mode used Russian text.
    await promptArea.fill('');
    await promptArea.focus();
    await page.keyboard.type('Привет мир', { delay: 30 });
    await expect(promptArea).toHaveValue('Привет мир');
    await expect(promptArea).toBeFocused();

    assertNoErrors(errors);
  } finally {
    await cleanup();
  }
});
