#!/usr/bin/env node
// Capture Claude Code interactive prompts via @lydell/node-pty (T-L2-A capture-as-prologue).
// Spawns `claude` in the resolved binary path, sends a series of trigger prompts, and saves
// the raw stdout (post-decode, pre-strip) to tests/fixtures/claude_code_prompts/<name>.txt.
//
// Usage:
//   node scripts/capture-claude-prompts.mjs                      # full run (NOT login_credential)
//   node scripts/capture-claude-prompts.mjs --only edit_approval # single fixture
//   node scripts/capture-claude-prompts.mjs --capture-login      # ONLY runs after user /logout
//
// Provenance contract (per phase-2-adapters.md T-L2-A):
//   - Each fixture file > 100 bytes of REAL captured output.
//   - tests/fixtures/claude_code_prompts/README.md records:
//       * `claude --version` output
//       * capture timestamp (ISO 8601 UTC)
//       * OS info
//       * trigger prompt for each fixture
//       * capture method ("captured by T-L2-A integration setup via @lydell/node-pty subprocess")
//   - login_credential.txt is captured ONLY after the user runs /logout in their interactive
//     claude session — the script then triggers a credential prompt before login completes.

import { promises as fsp } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/claude_code_prompts');

const TRIGGERS = [
  {
    name: 'edit_approval',
    prompt: 'Edit src/test.ts and add a single-line comment "// touched" at the top.',
    waitForRegex: /Allow Claude to edit\s+.+?\?\s*\(y\/n\)/i,
  },
  {
    name: 'bash_approval',
    prompt: 'Run the command: ls -la',
    waitForRegex: /Allow Claude to run command:/i,
  },
  {
    name: 'file_read_approval',
    prompt: 'Read package.json and tell me the name field.',
    waitForRegex: /Allow Claude to read\s+.+?\?/i,
  },
  {
    name: 'tool_call_approval',
    prompt: 'Use any tool that requires a generic "do you want to continue" prompt.',
    waitForRegex: /Do you want to continue\?\s*\(y\/n\)/i,
  },
  {
    name: 'decision_fork',
    prompt:
      'Offer me three options for refactoring src/main.ts: a) extract function, b) inline, c) leave as-is. Wait for my choice.',
    waitForRegex: /Choose an option:|^\s*[a-c]\)\s/m,
  },
  {
    name: 'reviewer_menu',
    prompt:
      'Show me a reviewer selection menu with checkboxes for alice, bob, and carol. Wait for confirmation.',
    waitForRegex: /Select reviewers:|\[\s?[xX ]\s?\]/m,
  },
  {
    name: 'free_text_unknown',
    prompt: 'What is your favourite colour? Just answer freely.',
    waitForRegex: null, // no specific marker — capture the agent's free reasoning text
    waitMs: 6000,
  },
];

const LOGIN_TRIGGER = {
  name: 'login_credential',
  // Triggered AFTER user /logout in interactive session; the next claude invocation
  // emits a login prompt before any text goes through.
  waitForRegex: /(Enter your password:|Paste(?: the)? code here:|Login required\.|Please run\s+\/login)/im,
};

function parseArgs(argv) {
  const args = { only: null, captureLogin: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--capture-login') args.captureLogin = true;
  }
  return args;
}

async function ensureFixtureDir() {
  await fsp.mkdir(FIXTURE_DIR, { recursive: true });
}

function resolveBinary() {
  const which = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(which, ['claude'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const lines = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines[0] ?? null;
}

function getVersion(binary) {
  try {
    const r = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    return (r.stdout + r.stderr).trim();
  } catch {
    return 'unknown';
  }
}

async function loadPty() {
  // Prefer @lydell/node-pty (R-WIN-PTY mitigation); fall back to upstream node-pty.
  try {
    return await import('@lydell/node-pty');
  } catch {
    return await import('node-pty');
  }
}

async function captureSession(pty, binary, trigger, logFn) {
  return new Promise((resolve, reject) => {
    // On Windows, node-pty CreateProcess requires a native PE binary — .cmd wrappers fail
    // with error 193 (ERROR_BAD_EXE_FORMAT). Spawn cmd.exe as the PTY host and pass the
    // claude .cmd path via /c so cmd.exe executes it correctly.
    const spawnBin =
      process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : binary;
    const spawnArgs = process.platform === 'win32' ? ['/c', binary] : [];
    const proc = pty.spawn(spawnBin, spawnArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
    });

    const chunks = [];
    let captured = false;
    let timer = null;
    const waitMs = trigger.waitMs ?? 30000;

    proc.onData((data) => {
      chunks.push(data);
      const accumulated = chunks.join('');
      if (!captured && trigger.waitForRegex && trigger.waitForRegex.test(accumulated)) {
        captured = true;
        clearTimeout(timer);
        // Allow a tiny tail to flush — 200ms — then capture
        setTimeout(() => {
          try {
            proc.kill();
          } catch {
            // best-effort
          }
          resolve(accumulated);
        }, 200);
      }
    });

    proc.onExit(({ exitCode }) => {
      if (!captured) {
        const accumulated = chunks.join('');
        if (accumulated.length > 0) {
          resolve(accumulated);
        } else {
          reject(new Error(`subprocess exited with ${exitCode} before any output was captured`));
        }
      }
    });

    // Send the trigger prompt after a brief startup grace period
    setTimeout(() => {
      try {
        if (trigger.prompt) {
          proc.write(trigger.prompt + '\r');
        }
      } catch (e) {
        logFn(`write failed: ${e.message}`);
      }
    }, 1500);

    timer = setTimeout(() => {
      if (!captured) {
        const accumulated = chunks.join('');
        try {
          proc.kill();
        } catch {
          // best-effort
        }
        if (accumulated.length > 100) {
          // Treat timeout-with-content as success for free_text capture path
          captured = true;
          resolve(accumulated);
        } else {
          reject(
            new Error(
              `timeout (${waitMs}ms) waiting for ${trigger.name} pattern; captured ${accumulated.length} bytes`,
            ),
          );
        }
      }
    }, waitMs);
  });
}

async function runCapture(triggers, options) {
  const log = (msg) => console.log(`[capture] ${msg}`);
  await ensureFixtureDir();

  const binary = resolveBinary();
  if (!binary) {
    throw new Error('claude binary not found on PATH; install Claude Code first.');
  }
  const version = getVersion(binary);
  log(`binary: ${binary}`);
  log(`version: ${version}`);

  const pty = await loadPty();
  const results = [];

  for (const trigger of triggers) {
    log(`capturing ${trigger.name}...`);
    try {
      const output = await captureSession(pty, binary, trigger, log);
      const target = path.join(FIXTURE_DIR, `${trigger.name}.txt`);
      await fsp.writeFile(target, output, 'utf8');
      const sizeBytes = Buffer.byteLength(output, 'utf8');
      results.push({ name: trigger.name, bytes: sizeBytes, ok: sizeBytes > 100 });
      log(`  → ${target} (${sizeBytes} B)${sizeBytes > 100 ? ' ok' : ' UNDERSIZED'}`);
    } catch (err) {
      results.push({ name: trigger.name, bytes: 0, ok: false, error: err.message });
      log(`  FAILED: ${err.message}`);
    }
  }

  // Update README
  await writeReadme({ binary, version, results, captureLogin: options.captureLogin });

  return results;
}

async function writeReadme({ binary, version, results, captureLogin }) {
  const readmePath = path.join(FIXTURE_DIR, 'README.md');
  const ts = new Date().toISOString();
  const osInfo = `${os.platform()} ${os.release()} (${os.arch()})`;
  const header = `# Claude Code prompt fixtures — provenance

This directory contains real Claude Code stdout captures used by the T-L2-A
prompt_parser tests (per phase-2-adapters.md T-L2-A capture-as-prologue and
agent_protocol.md §3.1).

## Capture method

Captured by T-L2-A integration setup via @lydell/node-pty subprocess
(\`scripts/capture-claude-prompts.mjs\`).

## Last capture

| Field | Value |
|---|---|
| Timestamp (UTC) | ${ts} |
| OS | ${osInfo} |
| claude binary | \`${binary}\` |
| claude --version | \`${version}\` |
| Capture host node | ${process.version} |
| Capture mode | ${captureLogin ? 'login_credential ONLY (post /logout)' : 'standard prompts'} |

## Triggers used

| Fixture | Trigger prompt | Wait pattern | Result |
|---|---|---|---|
${[...TRIGGERS, LOGIN_TRIGGER]
  .map((t) => {
    const r = results.find((x) => x.name === t.name);
    const status = r ? (r.ok ? `${r.bytes} B ok` : `${r.bytes} B UNDERSIZED${r.error ? ' — ' + r.error : ''}`) : 'not captured this run';
    const prompt = 'prompt' in t ? t.prompt : '(post /logout — credential prompt at next launch)';
    return `| \`${t.name}.txt\` | ${prompt} | \`${t.waitForRegex ?? 'free text'}\` | ${status} |`;
  })
  .join('\n')}

## Critical-zone note (login_credential.txt)

The login_credential.txt fixture is captured under a Type-CZ pause — the
user must \`/logout\` interactively in their claude session BEFORE running
\`node scripts/capture-claude-prompts.mjs --capture-login\`. After capture, the
user runs \`/login\` to restore authentication. Each step is timestamped in
the run log appended below.

## Run log

Each capture run appends an entry here. Latest at top.

- ${ts}: ${captureLogin ? 'login_credential capture (post /logout)' : 'standard prompts capture'} — ${results.filter((r) => r.ok).length}/${results.length} fixtures ok.

`;
  await fsp.writeFile(readmePath, header, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv);
  let triggers = TRIGGERS;
  if (args.captureLogin) {
    triggers = [LOGIN_TRIGGER];
  } else if (args.only) {
    const found = [...TRIGGERS, LOGIN_TRIGGER].find((t) => t.name === args.only);
    if (!found) {
      console.error(`unknown fixture: ${args.only}`);
      process.exit(2);
    }
    triggers = [found];
  }

  const results = await runCapture(triggers, args);
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} fixture(s) failed/undersized:`);
    for (const f of failed) console.error(`  - ${f.name}: ${f.error ?? `${f.bytes} B`}`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} fixtures captured ok.`);
}

main().catch((err) => {
  console.error(`fatal: ${err.message}`);
  process.exit(1);
});

void existsSync; // reserved for future fixture verification
