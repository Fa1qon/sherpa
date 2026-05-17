import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS tasks (
  id                        TEXT PRIMARY KEY,
  title                     TEXT NOT NULL DEFAULT '',
  project_path              TEXT,
  status                    TEXT NOT NULL DEFAULT 'created',
  methodology_id            TEXT,
  methodology_selection_mode TEXT NOT NULL DEFAULT 'none',
  effort                    TEXT NOT NULL DEFAULT 'normal',
  response_mode             TEXT NOT NULL DEFAULT 'detailed',
  economy_mode              TEXT NOT NULL DEFAULT 'unlimited',
  strictness_mode           TEXT NOT NULL DEFAULT 'standard',
  compliance_review_enabled INTEGER NOT NULL DEFAULT 0,
  settings_locked           INTEGER NOT NULL DEFAULT 0,
  total_input_tokens        INTEGER NOT NULL DEFAULT 0,
  total_output_tokens       INTEGER NOT NULL DEFAULT 0,
  thread_json               TEXT NOT NULL DEFAULT '[]',
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  tags_json       TEXT NOT NULL DEFAULT '[]',
  tags            TEXT NOT NULL DEFAULT '',
  methodology_id  TEXT,
  source_task_id  TEXT,
  confidence      TEXT NOT NULL DEFAULT 'medium',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS cases_fts USING fts5(
  id UNINDEXED,
  title,
  summary,
  content,
  tags,
  content='cases',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS cases_vec USING vec0(
  case_id TEXT PRIMARY KEY,
  embedding float[384]
);

CREATE TABLE IF NOT EXISTS knowledge (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT,
  content     TEXT NOT NULL DEFAULT '',
  tags_json   TEXT NOT NULL DEFAULT '[]',
  tags        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  title,
  category,
  content,
  tags,
  content='knowledge',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
  knowledge_id TEXT PRIMARY KEY,
  embedding float[384]
);

CREATE TABLE IF NOT EXISTS artifact_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  content     TEXT NOT NULL DEFAULT '',
  stage_hint  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracker_board_config (
  sub_project_id  TEXT PRIMARY KEY,
  stages_json     TEXT NOT NULL DEFAULT '[]',
  field_defs_json TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL
);

-- Migration: add tracker columns to existing tasks tables.
-- ALTER TABLE … ADD COLUMN is idempotent on SQLite when the column
-- already exists only via the IF NOT EXISTS check below.
-- SQLite has no ADD COLUMN IF NOT EXISTS, so we use a pragma workaround.
`;

// In a packaged Electron app, require.resolve() returns the asar-virtual path
// (inside app.asar/) instead of the real filesystem path (app.asar.unpacked/).
// Windows LoadLibraryEx cannot open DLLs from inside an asar archive.
// We construct the real path from process.resourcesPath when available.
function loadVecExtension(db: InstanceType<typeof Database>): void {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const ext = process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so';
    const osPart = process.platform === 'win32' ? 'windows' : process.platform;
    const realPath = join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      `sqlite-vec-${osPart}-${process.arch}`,
      `vec0.${ext}`,
    );
    if (existsSync(realPath)) {
      db.loadExtension(realPath);
      return;
    }
  }
  // Dev / test fallback: require.resolve works fine outside asar packaging.
  sqliteVec.load(db);
}

export class ProjectDatabase {
  private readonly db: InstanceType<typeof Database>;

  constructor(projectPath: string) {
    const sherpaDir = join(projectPath, '.sherpa');
    mkdirSync(sherpaDir, { recursive: true });
    this.db = new Database(join(sherpaDir, 'sherpa.db'));
    loadVecExtension(this.db);
    this.db.exec(SCHEMA);
    this.runTrackerMigration();
  }

  private runTrackerMigration(): void {
    const cols = (
      this.db.pragma('table_info(tasks)') as Array<{ name: string }>
    ).map((r) => r.name);
    if (!cols.includes('tracker_stage_id')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN tracker_stage_id TEXT`);
    }
    if (!cols.includes('tracker_fields')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN tracker_fields TEXT NOT NULL DEFAULT '{}'`);
    }
    if (!cols.includes('tracker_session_summary')) {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN tracker_session_summary TEXT`);
    }
    // Seed default board config for root project if absent.
    const existing = this.db
      .prepare("SELECT sub_project_id FROM tracker_board_config WHERE sub_project_id = ''")
      .get();
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO tracker_board_config (sub_project_id, stages_json, field_defs_json, updated_at)
           VALUES ('', ?, '[]', datetime('now'))`,
        )
        .run(
          JSON.stringify([
            { id: 'backlog',     name: 'Backlog',     category: 'backlog',  order: 0 },
            { id: 'in-progress', name: 'In Progress', category: 'active',   order: 1 },
            { id: 'done',        name: 'Done',        category: 'done',     order: 2 },
          ]),
        );
    }
  }

  /** Exposed for direct use in service queries. */
  raw(): InstanceType<typeof Database> {
    return this.db;
  }

  close(): void {
    if (this.db.open) this.db.close();
  }
}
