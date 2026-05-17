import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsService } from '../../../src/main/services/settings_service';
import {
  defaultUserSettings,
  defaultProjectSettings,
} from '../../../src/core/domain/settings';

describe('SettingsService', () => {
  let userHome: string;
  let projectPath: string;
  let svc: SettingsService;

  beforeEach(() => {
    userHome = mkdtempSync(join(tmpdir(), 'sherpa-test-home-'));
    projectPath = mkdtempSync(join(tmpdir(), 'sherpa-test-proj-'));
    svc = new SettingsService({ userHome });
  });

  afterEach(() => {
    rmSync(userHome, { recursive: true, force: true });
    rmSync(projectPath, { recursive: true, force: true });
  });

  test('getUserSettings returns defaults when file missing', async () => {
    const s = await svc.getUserSettings();
    expect(s).toEqual(defaultUserSettings());
  });

  test('setUserSettings + getUserSettings round-trip', async () => {
    await svc.setUserSettings({
      theme: 'dark',
      language: 'ru',
      defaultAgentCli: 'codex',
      costTracking: { showCost: true, pricePerMillionInputTokens: 3.0, pricePerMillionOutputTokens: 15.0 },
      complianceOutputMode: 'both',
      showEventLog: true,
    });
    const s = await svc.getUserSettings();
    expect(s).toEqual({
      theme: 'dark',
      language: 'ru',
      defaultAgentCli: 'codex',
      costTracking: { showCost: true, pricePerMillionInputTokens: 3.0, pricePerMillionOutputTokens: 15.0 },
      complianceOutputMode: 'both',
      showEventLog: true,
    });
  });

  test('getUserSettings merges legacy file without costTracking with defaults', async () => {
    const dir = join(userHome, '.sherpa');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'global.config.json'),
      JSON.stringify({ theme: 'dark', language: 'ru', defaultAgentCli: 'claude-code' }),
      'utf8',
    );
    const s = await svc.getUserSettings();
    expect(s.theme).toBe('dark');
    expect(s.language).toBe('ru');
    expect(s.costTracking).toEqual(defaultUserSettings().costTracking);
  });

  test('setUserSettings writes to ~/.sherpa/global.config.json', async () => {
    await svc.setUserSettings(defaultUserSettings());
    const path = join(userHome, '.sherpa', 'global.config.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    expect(parsed.theme).toBe('auto');
  });

  test('getUserSettings returns defaults when file is corrupt JSON', async () => {
    const dir = join(userHome, '.sherpa');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'global.config.json'), '{ not valid', 'utf8');
    const s = await svc.getUserSettings();
    expect(s).toEqual(defaultUserSettings());
  });

  test('getUserSettings returns defaults when file has unknown theme', async () => {
    const dir = join(userHome, '.sherpa');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'global.config.json'),
      JSON.stringify({ theme: 'sepia', language: 'en', defaultAgentCli: 'claude-code' }),
    );
    const s = await svc.getUserSettings();
    expect(s).toEqual(defaultUserSettings());
  });

  test('getProjectSettings returns defaults when file missing', async () => {
    const s = await svc.getProjectSettings(projectPath);
    expect(s).toEqual(defaultProjectSettings());
  });

  test('setProjectSettings creates .sherpa/ if missing', async () => {
    await svc.setProjectSettings(projectPath, defaultProjectSettings());
    expect(existsSync(join(projectPath, '.sherpa', 'sherpa.config.json'))).toBe(true);
  });

  test('setProjectSettings + getProjectSettings round-trip', async () => {
    const s = { ...defaultProjectSettings(), agentCli: 'codex' as const };
    await svc.setProjectSettings(projectPath, s);
    const back = await svc.getProjectSettings(projectPath);
    expect(back).toEqual(s);
  });
});
