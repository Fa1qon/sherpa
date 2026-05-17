// Tests for `.sherpa-build/scripts/cleanup-external-state.mjs`.
// Run: node --test tests/scripts/cleanup-external-state.spec.mjs
//
// Stdlib-only (Node >= 20). No external dependencies (no jest/vitest) —
// the TypeScript toolchain doesn't exist yet at this point in bootstrap
// (T-L0-07 runs before T-L0-01 per DA-V231-02 chicken-egg fix).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.sherpa-build',
  'scripts',
  'cleanup-external-state.mjs'
);

const IS_WIN = process.platform === 'win32';

function makeTempRepo(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherpa-cleanup-test-'));
  if (opts.withSherpaBuild !== false) {
    fs.mkdirSync(path.join(dir, '.sherpa-build'), { recursive: true });
  }
  return dir;
}

function rmTempRepo(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    // ignore
  }
}

function runScript(cwd, args = [], opts = {}) {
  // Override HOME so user-cache cleanup operates in an isolated dir.
  const env = { ...process.env, ...(opts.env ?? {}) };
  if (opts.fakeHome) {
    if (IS_WIN) {
      env.USERPROFILE = opts.fakeHome;
    } else {
      env.HOME = opts.fakeHome;
    }
  }
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// -------------------------------------------------------------------------
// Sanitize: removes sherpa.* entries, preserves user-managed entries
// -------------------------------------------------------------------------

test('settings.json: removes sherpa.* entries from hooks/servers/permissions, preserves others', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const settingsPath = path.join(repo, '.claude', 'settings.json');
  writeJson(settingsPath, {
    hooks: {
      'sherpa.audit.log': { command: 'sherpa-audit' },
      'sherpa.lint': { command: 'sherpa-lint' },
      'user.format': { command: 'prettier' },
    },
    servers: {
      'sherpa.mcp.local': { url: 'http://localhost:1' },
      'user.custom': { url: 'http://localhost:2' },
    },
    permissions: ['sherpa.read', 'sherpa.write', 'user.exec', 'user.spawn'],
    unrelatedTopLevel: { keep: true },
  });
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);

  const out = readJson(settingsPath);
  assert.deepEqual(out.hooks, { 'user.format': { command: 'prettier' } });
  assert.deepEqual(out.servers, { 'user.custom': { url: 'http://localhost:2' } });
  assert.deepEqual(out.permissions, ['user.exec', 'user.spawn']);
  assert.deepEqual(out.unrelatedTopLevel, { keep: true });
});

test('mcp.json: removes sherpa.* entries from servers/permissions, preserves others', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const mcpPath = path.join(repo, '.claude', 'mcp.json');
  writeJson(mcpPath, {
    servers: {
      'sherpa.mcp.audit': { url: 'http://localhost:9' },
      'user.tool': { url: 'http://localhost:10' },
    },
    permissions: {
      'sherpa.allow': true,
      'user.allow': true,
    },
  });
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);

  const out = readJson(mcpPath);
  assert.deepEqual(out.servers, { 'user.tool': { url: 'http://localhost:10' } });
  assert.deepEqual(out.permissions, { 'user.allow': true });
});

// -------------------------------------------------------------------------
// Idempotency
// -------------------------------------------------------------------------

test('idempotent: running twice produces same output, no errors', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const settingsPath = path.join(repo, '.claude', 'settings.json');
  writeJson(settingsPath, {
    hooks: { 'sherpa.x': 1, 'user.y': 2 },
  });
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r1 = runScript(repo, [], { fakeHome });
  assert.equal(r1.status, 0, `run 1 stderr: ${r1.stderr}`);
  const after1 = fs.readFileSync(settingsPath, 'utf8');

  const r2 = runScript(repo, [], { fakeHome });
  assert.equal(r2.status, 0, `run 2 stderr: ${r2.stderr}`);
  const after2 = fs.readFileSync(settingsPath, 'utf8');

  assert.equal(after1, after2);
  // Second run should report no changes for the file.
  assert.match(r2.stdout, /no sherpa\.\* entries/);
});

test('idempotent: file with no sherpa.* entries is not rewritten (mtime preserved)', async (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const settingsPath = path.join(repo, '.claude', 'settings.json');
  writeJson(settingsPath, { hooks: { 'user.only': 1 } });
  const beforeMtime = fs.statSync(settingsPath).mtimeMs;
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  // Wait a tick so any rewrite would advance mtime.
  await new Promise((r) => setTimeout(r, 25));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const afterMtime = fs.statSync(settingsPath).mtimeMs;
  assert.equal(beforeMtime, afterMtime, 'mtime must be preserved (no rewrite)');
});

// -------------------------------------------------------------------------
// Missing files
// -------------------------------------------------------------------------

test('missing .claude/settings.json: no-op, exit 0', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /\.claude[\\/]settings\.json: not present/);
  assert.match(r.stdout, /\.claude[\\/]mcp\.json: not present/);
});

// -------------------------------------------------------------------------
// Malformed JSON
// -------------------------------------------------------------------------

test('malformed JSON: logs error, exits non-zero, does not crash', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const settingsPath = path.join(repo, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, '{ this is not json');
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /malformed JSON/);
  // File should be untouched.
  assert.equal(fs.readFileSync(settingsPath, 'utf8'), '{ this is not json');
});

// -------------------------------------------------------------------------
// .staging/
// -------------------------------------------------------------------------

test('.staging/: removed when present', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const stagingDir = path.join(repo, '.staging');
  fs.mkdirSync(path.join(stagingDir, 'inner'), { recursive: true });
  fs.writeFileSync(path.join(stagingDir, 'inner', 'x.txt'), 'hi');
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(fs.existsSync(stagingDir), false);
  assert.match(r.stdout, /\.staging\/: removed/);
});

test('.staging/: no-op when absent', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /\.staging\/: not present/);
});

// -------------------------------------------------------------------------
// ~/.sherpa/{plugin,agent}_cache.json
// -------------------------------------------------------------------------

test('user cache files: removed when present', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));
  const sherpaDir = path.join(fakeHome, '.sherpa');
  fs.mkdirSync(sherpaDir, { recursive: true });
  const pluginCache = path.join(sherpaDir, 'plugin_cache.json');
  const agentCache = path.join(sherpaDir, 'agent_cache.json');
  fs.writeFileSync(pluginCache, '{}');
  fs.writeFileSync(agentCache, '{}');

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.equal(fs.existsSync(pluginCache), false);
  assert.equal(fs.existsSync(agentCache), false);
});

test('user cache files: no-op when absent', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /plugin_cache\.json: not present/);
  assert.match(r.stdout, /agent_cache\.json: not present/);
});

// -------------------------------------------------------------------------
// REPO_ROOT validation
// -------------------------------------------------------------------------

test('REPO_ROOT validation: refuses to run without .sherpa-build/', (t) => {
  const repo = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /REPO_ROOT validation failed/);
});

test('--force overrides REPO_ROOT validation', (t) => {
  const repo = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, ['--force'], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
});

// -------------------------------------------------------------------------
// --dry-run
// -------------------------------------------------------------------------

test('--dry-run: reports without modifying', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const settingsPath = path.join(repo, '.claude', 'settings.json');
  const original = { hooks: { 'sherpa.x': 1, 'user.y': 2 } };
  writeJson(settingsPath, original);
  const stagingDir = path.join(repo, '.staging');
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.writeFileSync(path.join(stagingDir, 'a'), 'a');

  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));
  const sherpaDir = path.join(fakeHome, '.sherpa');
  fs.mkdirSync(sherpaDir, { recursive: true });
  const pluginCache = path.join(sherpaDir, 'plugin_cache.json');
  fs.writeFileSync(pluginCache, '{}');

  const r = runScript(repo, ['--dry-run'], { fakeHome });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  // Files unchanged.
  assert.deepEqual(readJson(settingsPath), original);
  assert.equal(fs.existsSync(stagingDir), true);
  assert.equal(fs.existsSync(pluginCache), true);
  // Reports planned changes.
  assert.match(r.stdout, /dry-run/);
  assert.match(r.stdout, /would remove/);
});

// -------------------------------------------------------------------------
// CLI: --task-id, --help, positional arg
// -------------------------------------------------------------------------

test('--help: prints usage and exits 0', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const r = runScript(repo, ['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /--dry-run/);
});

test('--task-id and positional arg both populate task id in banner', (t) => {
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r1 = runScript(repo, ['--task-id', 'T-X-1'], { fakeHome });
  assert.equal(r1.status, 0);
  assert.match(r1.stdout, /task=T-X-1/);

  const r2 = runScript(repo, ['T-X-2'], { fakeHome });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /task=T-X-2/);
});

// -------------------------------------------------------------------------
// Permission errors (POSIX only)
// -------------------------------------------------------------------------

test('permission error on read: logged, non-zero exit, no crash', (t) => {
  if (IS_WIN) {
    t.skip('chmod-based permission simulation not portable on Windows; skipped');
    return;
  }
  // Skip if running as root — chmod 000 won't deny root.
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('running as root; chmod 000 has no effect');
    return;
  }
  const repo = makeTempRepo();
  t.after(() => rmTempRepo(repo));
  const settingsPath = path.join(repo, '.claude', 'settings.json');
  writeJson(settingsPath, { hooks: { 'sherpa.x': 1 } });
  fs.chmodSync(settingsPath, 0o000);
  t.after(() => {
    try {
      fs.chmodSync(settingsPath, 0o644);
    } catch (_) {
      /* ignore */
    }
  });
  const fakeHome = makeTempRepo({ withSherpaBuild: false });
  t.after(() => rmTempRepo(fakeHome));

  const r = runScript(repo, [], { fakeHome });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cannot read/);
});

// ENOSPC is hard to simulate portably; documented in README as
// "manually verified". The atomic-write code path is exercised by every
// successful sanitize test above.
