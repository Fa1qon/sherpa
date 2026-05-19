// src/main/services/extension_state_store.ts
// Extension Framework Plan 05 Task 1 — SQLite-backed metadata store for
// installed extensions.
//
// Owns its own `extension_state.db` file under `app.getPath('userData')`
// (separate from `extension_storage.db` which holds per-extension key/value
// pairs — keeping them apart prevents one schema's corruption from wedging
// the other, and the access patterns are different).
//
// Table layout:
//   extensions(id PK, enabled INT, settings TEXT, installed_at INT)
//
// All values are typed at the Map boundary; the JSON column holds the
// per-extension settings blob (a `Record<string, unknown>` controlled by
// the extension manifest).

import type Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  installed_at INTEGER NOT NULL
);
`;

export interface ExtensionRecord {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  installedAt: number;
}

interface ExtensionRow {
  id: string;
  enabled: number;
  settings: string;
  installed_at: number;
}

export class ExtensionStateStore {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  /**
   * Insert a new extension record. Existing rows have their `enabled` flag
   * updated to the supplied value but other fields (settings, installed_at)
   * are preserved — extension reloads after an enable/disable should not
   * reset persisted state.
   */
  upsert(id: string, enabled: boolean, installedAt: number = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO extensions (id, enabled, installed_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled`,
      )
      .run(id, enabled ? 1 : 0, installedAt);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db
      .prepare('UPDATE extensions SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
  }

  setSettings(id: string, settings: Record<string, unknown>): void {
    this.db
      .prepare('UPDATE extensions SET settings = ? WHERE id = ?')
      .run(JSON.stringify(settings), id);
  }

  get(id: string): ExtensionRecord | null {
    const row = this.db
      .prepare(
        'SELECT id, enabled, settings, installed_at FROM extensions WHERE id = ?',
      )
      .get(id) as ExtensionRow | undefined;
    if (!row) return null;
    return rowToRecord(row);
  }

  list(): ExtensionRecord[] {
    const rows = this.db
      .prepare('SELECT id, enabled, settings, installed_at FROM extensions')
      .all() as ExtensionRow[];
    return rows.map(rowToRecord);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM extensions WHERE id = ?').run(id);
  }
}

function rowToRecord(row: ExtensionRow): ExtensionRecord {
  let settings: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.settings) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupted JSON — fall back to empty object rather than crashing the loader.
  }
  return {
    id: row.id,
    enabled: row.enabled === 1,
    settings,
    installedAt: row.installed_at,
  };
}
