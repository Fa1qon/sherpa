// src/extensions/sdk/extension_storage.ts
// Extension Framework Plan 03 Task 2 — per-extension SQLite key/value store.
//
// All extensions share a single `extension_storage` table. The primary key
// is `(extension_id, key)` so each extension sees its own isolated keyspace
// even though the SQLite file is shared. Values are JSON-serialized; the
// caller controls schema.
//
// Owner: composition_root opens `extension_storage.db` under
// `app.getPath('userData')` and hands the connection here. In vitest we
// pass `new Database(':memory:')` to keep the surface library-agnostic.

import type Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS extension_storage (
  extension_id TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (extension_id, key)
);
`;

/**
 * Per-extension keyspace returned by {@link ExtensionStorage.forExtension}.
 * Bound to a single `extension_id` — all operations implicitly scope to it,
 * preventing one extension from reading another's keys.
 */
export interface ExtensionKeyspace {
  get<T = unknown>(key: string): T | null;
  set<T = unknown>(key: string, value: T): void;
  delete(key: string): void;
  keys(): string[];
}

export class ExtensionStorage {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA);
  }

  /**
   * Return a per-extension keyspace handle. The returned object captures
   * `extensionId` by closure; passing it around is safe (the bound id
   * cannot be tampered with by the caller).
   */
  forExtension(extensionId: string): ExtensionKeyspace {
    const db = this.db;
    return {
      get<T = unknown>(key: string): T | null {
        const row = db
          .prepare('SELECT value FROM extension_storage WHERE extension_id = ? AND key = ?')
          .get(extensionId, key) as { value: string } | undefined;
        if (!row) return null;
        return JSON.parse(row.value) as T;
      },
      set<T = unknown>(key: string, value: T): void {
        db
          .prepare(
            'INSERT OR REPLACE INTO extension_storage (extension_id, key, value) VALUES (?,?,?)',
          )
          .run(extensionId, key, JSON.stringify(value));
      },
      delete(key: string): void {
        db
          .prepare('DELETE FROM extension_storage WHERE extension_id = ? AND key = ?')
          .run(extensionId, key);
      },
      keys(): string[] {
        const rows = db
          .prepare('SELECT key FROM extension_storage WHERE extension_id = ?')
          .all(extensionId) as { key: string }[];
        return rows.map((r) => r.key);
      },
    };
  }
}
