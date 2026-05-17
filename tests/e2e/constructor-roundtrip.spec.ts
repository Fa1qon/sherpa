// tests/e2e/constructor-roundtrip.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchWithProject, buildEnv, collectErrors, assertNoErrors } from './helpers';

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

const distMain = join(process.cwd(), 'dist-electron', 'main', 'index.js');

test('S6 — constructor round-trip: edits survive close + reopen', async () => {
  // ---- Session 1: open Edit mode, perform S6 edits, save ----
  // launchWithProject creates .sherpa/; we then scaffold the methodology tree inside it.
  const { app, page, sherpaHome, projectPath, cleanup } = await launchWithProject({
    scaffoldSherpaDir: true,
  });
  const errors = collectErrors(page);

  // Scaffold methodology file after .sherpa/ is created by the helper
  const methDir = join(projectPath, '.sherpa', 'core', 'methodologies');
  mkdirSync(methDir, { recursive: true });
  const methFile = join(methDir, 'lite.md');
  writeFileSync(methFile, SAMPLE_METHOD);

  try {
    // Open Library
    await page.locator('text=Tools').first().click();
    await page.locator('text=Methodology library').waitFor({ timeout: 5000 });
    await page.locator('text=Methodology library').click();
    await expect(page.getByRole('heading', { name: 'Lite Cycle' })).toBeVisible({ timeout: 10000 });

    // Apply S6 edits via the public renderer API — drives the same save() path the UI uses.
    // Bypassing xyflow drag/connect interactions keeps the e2e robust; renderer code is
    // exercised by vitest; here we validate end-to-end persistence + reload.
    await page.evaluate(async (pp) => {
      const r = await window.sherpa.methodology.load(pp, 'lite');
      if (!r.ok) throw new Error('load failed: ' + JSON.stringify(r.error));
      const m = r.methodology;
      const mutated = {
        ...m,
        stages: [
          { ...m.stages[0], name: 'Requirements (revised)' },   // Op A: rename req
          m.stages[1],
          { id: 'verify', name: 'Verification', mode: 'gate' as const, contract: { input: [], output: { path: 'verify.md' } } },  // Op B: add verify
        ],
        edges: [
          { from: 'start', to: 'req', condition: { kind: 'always' as const } },
          { from: 'req', to: 'impl', condition: { kind: 'always' as const } },
          { from: 'impl', to: 'verify', condition: { kind: 'always' as const } },     // Op C: reroute impl → end → impl → verify
          { from: 'verify', to: 'end', condition: { kind: 'gate-pass' as const } },
          { from: 'verify', to: 'impl', condition: { kind: 'gate-fail' as const, maxCycles: 2 } },  // Op D
        ],
      };
      await window.sherpa.methodology.save(pp, mutated);
    }, projectPath);

    assertNoErrors(errors);
  } finally {
    await cleanup();
  }

  // ---- Verify on-disk file contains the edits ----
  const written = readFileSync(methFile, 'utf8');
  expect(written).toContain('## Stage: req — Requirements (revised)');
  expect(written).toContain('## Stage: verify');
  expect(written).toContain('## EDGES');
  expect(written).toMatch(/\|\s*verify\s*\|\s*impl\s*\|\s*gate-fail\s*\|\s*\|\s*2\s*\|/);

  // ---- Session 2: relaunch into the same sherpaHome (project is already in recent list) ----
  const app2 = await electron.launch({
    args: [distMain],
    env: buildEnv({ SHERPA_TEST_USER_HOME: sherpaHome }),
  });
  const page2 = await app2.firstWindow();
  const errors2 = collectErrors(page2);
  try {
    await page2.locator(`text=${projectPath}`).waitFor({ timeout: 10000 });
    await page2.locator(`text=${projectPath}`).click();
    await page2.locator('[data-testid="workspace-loaded"]').waitFor({ timeout: 10000 });

    const reloaded = await page2.evaluate(async (pp) => {
      const r = await window.sherpa.methodology.load(pp, 'lite');
      return r;
    }, projectPath);

    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) throw new Error('reparse failed: ' + JSON.stringify(reloaded.error));

    const m = reloaded.methodology;
    expect(m.stages.find((s: { id: string; name: string }) => s.id === 'req')!.name).toBe('Requirements (revised)');
    expect(m.stages.find((s: { id: string }) => s.id === 'verify')).toBeDefined();
    expect(m.edges.find((e: { from: string; to: string }) => e.from === 'impl' && e.to === 'verify')).toBeDefined();
    expect(m.edges.find((e: { from: string; to: string }) => e.from === 'impl' && e.to === 'end')).toBeUndefined();
    const backloop = m.edges.find((e: { from: string; to: string }) => e.from === 'verify' && e.to === 'impl');
    expect(backloop).toBeDefined();
    expect(backloop!.condition).toEqual({ kind: 'gate-fail', maxCycles: 2 });

    assertNoErrors(errors2);
  } finally {
    await app2.close();
    await cleanup();
  }
});
