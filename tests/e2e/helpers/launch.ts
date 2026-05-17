// tests/e2e/helpers/launch.ts
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const distMain = join(process.cwd(), 'dist-electron', 'main', 'index.js');

export interface LaunchResult {
  app: ElectronApplication;
  page: Page;
  sherpaHome: string;
  projectPath: string;
  cleanup: () => Promise<void>;
}

export function buildEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === 'ELECTRON_RUN_AS_NODE') continue;
    if (typeof v === 'string') env[k] = v;
  }
  return {
    ...env,
    SHERPA_DEV_BUILD: '1',
    NODE_ENV: 'production',
    ...extra,
  };
}

/**
 * Launch Electron, add a temp project, open it, and wait for the workspace sentinel.
 * Returns app, page, and an async cleanup() to call in afterEach/finally.
 */
export async function launchWithProject(options: {
  projectPath?: string;
  extraEnv?: Record<string, string>;
  scaffoldSherpaDir?: boolean;
} = {}): Promise<LaunchResult> {
  const sherpaHome = mkdtempSync(join(tmpdir(), 'sherpa-test-home-'));
  const ownsProjectPath = !options.projectPath;
  const projectPath = options.projectPath ?? mkdtempSync(join(tmpdir(), 'sherpa-test-proj-'));

  if (options.scaffoldSherpaDir !== false) {
    mkdirSync(join(projectPath, '.sherpa'), { recursive: true });
  }

  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [distMain],
      env: buildEnv({ SHERPA_TEST_USER_HOME: sherpaHome, ...options.extraEnv }),
    });
    const page = await app.firstWindow();

    await page.evaluate(async (p: string) => {
      await window.sherpa.project.add({ path: p, scaffold: false });
    }, projectPath);
    await page.reload();
    await page.locator(`text=${projectPath}`).waitFor({ timeout: 15000 });
    await page.locator(`text=${projectPath}`).click();
    await page.locator('[data-testid="workspace-loaded"]').waitFor({ timeout: 15000 });

    const cleanup = async () => {
      try { await app!.close(); } catch { /* ignore */ }
      try { rmSync(sherpaHome, { recursive: true, force: true }); } catch { /* ignore */ }
      if (ownsProjectPath) {
        try { rmSync(projectPath, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    };

    return { app, page, sherpaHome, projectPath, cleanup };
  } catch (err) {
    try { if (app) await app.close(); } catch { /* ignore */ }
    try { rmSync(sherpaHome, { recursive: true, force: true }); } catch { /* ignore */ }
    if (ownsProjectPath) {
      try { rmSync(projectPath, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    throw err;
  }
}
