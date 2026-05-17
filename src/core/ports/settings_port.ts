// src/core/ports/settings_port.ts
// SettingsPort — read/write user-scope and project-scope settings.

import type { UserSettings, ProjectSettings } from '../domain/settings';

export interface SettingsPort {
  /** Returns the user-scope settings, or defaults if file is missing/unreadable. */
  getUserSettings(): Promise<UserSettings>;

  /** Atomically writes user-scope settings to ~/.sherpa/global.config.json. */
  setUserSettings(s: UserSettings): Promise<void>;

  /**
   * Returns project-scope settings for the given project root, or defaults if
   * the file is missing/unreadable. Does NOT auto-create the file.
   */
  getProjectSettings(projectPath: string): Promise<ProjectSettings>;

  /**
   * Atomically writes project-scope settings to
   * <projectPath>/.sherpa/sherpa.config.json. Creates `.sherpa/` if missing.
   */
  setProjectSettings(projectPath: string, s: ProjectSettings): Promise<void>;
}
