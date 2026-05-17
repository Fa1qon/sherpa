// src/main/services/settings_service.ts
// SettingsService — JSON-backed user-scope and project-scope settings.
// Reads/writes via atomicWrite (temp + fsync + rename). Falls back to
// defaults on missing/corrupt/shape-mismatched file.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import type { SettingsPort } from '../../core/ports/settings_port';
import {
  type UserSettings,
  type ProjectSettings,
  defaultUserSettings,
  defaultProjectSettings,
  isUserSettings,
  isProjectSettings,
} from '../../core/domain/settings';
import { atomicWrite } from '../../core/infrastructure/atomic_write';

export interface SettingsServiceOptions {
  /** Override user home directory (testing). Default: `os.homedir()`. */
  readonly userHome?: string;
}

export class SettingsService implements SettingsPort {
  private readonly userHome: string;

  constructor(opts: SettingsServiceOptions = {}) {
    this.userHome = opts.userHome ?? process.env.SHERPA_TEST_USER_HOME ?? os.homedir();
  }

  async getUserSettings(): Promise<UserSettings> {
    const file = this.userSettingsPath();
    try {
      const raw = await fsp.readFile(file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      // Merge with defaults so legacy files without costTracking fill in gracefully.
      const merged = { ...defaultUserSettings(), ...(typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}) };
      return isUserSettings(merged) ? merged : defaultUserSettings();
    } catch {
      return defaultUserSettings();
    }
  }

  async setUserSettings(s: UserSettings): Promise<void> {
    const file = this.userSettingsPath();
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await atomicWrite(file, JSON.stringify(s, null, 2));
  }

  async getProjectSettings(projectPath: string): Promise<ProjectSettings> {
    const file = this.projectSettingsPath(projectPath);
    return this.readJsonOrDefault(
      file,
      defaultProjectSettings(),
      isProjectSettings,
    );
  }

  async setProjectSettings(
    projectPath: string,
    s: ProjectSettings,
  ): Promise<void> {
    const file = this.projectSettingsPath(projectPath);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await atomicWrite(file, JSON.stringify(s, null, 2));
  }

  private userSettingsPath(): string {
    return path.join(this.userHome, '.sherpa', 'global.config.json');
  }

  private projectSettingsPath(projectPath: string): string {
    return path.join(projectPath, '.sherpa', 'sherpa.config.json');
  }

  private async readJsonOrDefault<T>(
    file: string,
    fallback: T,
    guard: (v: unknown) => v is T,
  ): Promise<T> {
    try {
      const raw = await fsp.readFile(file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return guard(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
}
