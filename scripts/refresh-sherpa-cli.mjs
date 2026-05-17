#!/usr/bin/env node
// scripts/refresh-sherpa-cli.mjs
//
// Refreshes sherpa CLI binaries (bin/sherpa, bin/sherpa.exe) by re-copying
// them from the upstream sherpa source repo and updating bin/sherpa.provenance.json.
//
// Usage:
//   node scripts/refresh-sherpa-cli.mjs [--dry-run] [--force] [--help]
//
// Flags:
//   --dry-run   Report what would change; perform no copies / writes.
//   --force     Re-copy and rewrite provenance.json even if sha256 matches.
//   --help      Print this usage message.
//
// Constraints:
//   - Node >= 20 stdlib only (no third-party packages).
//   - Forbidden: any compilation step (no `go build`). The script copies
//     pre-built binaries only. Per ADR-001 skill_constraint, the
//     implementation repo is TypeScript-only; Go compilation belongs in
//     the sherpa source repo and is performed by the user.
//   - Atomic write of provenance.json (write to .tmp.<ts>, then rename).
//   - Refuses to run unless cwd contains .sherpa-build/ (REPO_ROOT guard,
//     mirrors the T-L0-07 cleanup script convention).

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HELP_TEXT = `refresh-sherpa-cli.mjs - refresh sherpa CLI binaries from source repo

Usage:
  node scripts/refresh-sherpa-cli.mjs [--dry-run] [--force] [--help]

Flags:
  --dry-run   Report what would change; perform no copies / writes.
  --force     Re-copy and rewrite provenance.json even if sha256 matches.
  --help      Print this usage message.

Reads bin/sherpa.provenance.json to learn source_repo + source_path.
Computes sha256 of source binaries; if any differ from provenance.json
(or --force), copies them into bin/ and rewrites provenance.json atomically.

Forbidden: compilation. Source binaries are imported, never built here.
Per ADR-001 skill_constraint, this repo is TypeScript-only; build sherpa
in its own repo first, then run this script.
`;

const BINARIES = ['sherpa', 'sherpa.exe'];
const PLATFORM_OF = { sherpa: 'linux', 'sherpa.exe': 'windows' };

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, help: false };
  for (const arg of argv.slice(2)) {
    switch (arg) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        process.stderr.write(`Unknown argument: ${arg}\n\n${HELP_TEXT}`);
        process.exit(2);
    }
  }
  return opts;
}

function fail(msg, code = 1) {
  process.stderr.write(`refresh-sherpa-cli: ERROR: ${msg}\n`);
  process.exit(code);
}

function info(msg) {
  process.stdout.write(`refresh-sherpa-cli: ${msg}\n`);
}

function repoRootGuard() {
  // Mirrors T-L0-07 cleanup-external-state.mjs sanity guard: refuse to run
  // outside the implementation repo. Looks for .sherpa-build/ in cwd.
  const cwd = process.cwd();
  const marker = path.join(cwd, '.sherpa-build');
  if (!existsSync(marker)) {
    fail(
      `cwd does not look like the sherpa-ui implementation repo (no .sherpa-build/ found at ${cwd}). ` +
        `cd to the repo root before running this script.`,
      3,
    );
  }
  return cwd;
}

function sha256OfFile(filePath) {
  const buf = readFileSync(filePath);
  const h = createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

function readProvenance(provenancePath) {
  if (!existsSync(provenancePath)) {
    fail(
      `provenance file not found at ${provenancePath}. ` +
        `Bootstrap T-L0-04 must be completed first.`,
      4,
    );
  }
  let raw;
  try {
    raw = readFileSync(provenancePath, 'utf8');
  } catch (e) {
    fail(`failed to read ${provenancePath}: ${e.message}`, 4);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    fail(`provenance file ${provenancePath} is not valid JSON: ${e.message}`, 4);
  }
  if (!json.source_repo || !json.source_path || !json.binaries) {
    fail(
      `provenance file ${provenancePath} missing required fields ` +
        `(source_repo, source_path, binaries).`,
      4,
    );
  }
  return json;
}

function gitHeadSha(repoPath) {
  try {
    const out = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.toString('utf8').trim();
  } catch (e) {
    fail(`failed to read git HEAD of ${repoPath}: ${e.message}`, 5);
  }
}

function atomicWriteJson(destPath, obj) {
  const ts = Date.now();
  const tmpPath = `${destPath}.tmp.${ts}`;
  const body = JSON.stringify(obj, null, 2) + '\n';
  writeFileSync(tmpPath, body, { encoding: 'utf8' });
  renameSync(tmpPath, destPath);
}

function isoNow() {
  return new Date().toISOString();
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const repoRoot = repoRootGuard();
  const provenancePath = path.join(repoRoot, 'bin', 'sherpa.provenance.json');
  const provenance = readProvenance(provenancePath);

  const sourceRepo = provenance.source_repo;
  const sourceSubPath = provenance.source_path;
  const sourceDir = path.join(sourceRepo, sourceSubPath);

  // Compute fresh sha256 of source binaries; bail clearly if missing.
  const sourceInfo = {};
  for (const name of BINARIES) {
    const srcPath = path.join(sourceDir, name);
    if (!existsSync(srcPath)) {
      fail(
        `source binary missing: ${srcPath}. ` +
          `Build it in the sherpa source repo first (this script does NOT compile).`,
        6,
      );
    }
    const sz = statSync(srcPath).size;
    const hash = sha256OfFile(srcPath);
    sourceInfo[name] = { srcPath, size: sz, sha256: hash };
  }

  // Compare against recorded provenance.
  const changes = [];
  for (const name of BINARIES) {
    const recorded = provenance.binaries?.[name];
    const fresh = sourceInfo[name];
    if (!recorded || recorded.sha256 !== fresh.sha256 || recorded.size !== fresh.size) {
      changes.push(name);
    }
  }

  if (changes.length === 0 && !opts.force) {
    info('no update needed (sha256 matches for all binaries).');
    process.exit(0);
  }

  if (opts.force && changes.length === 0) {
    info('--force specified; refreshing all binaries despite sha256 match.');
  } else {
    info(`refresh required for: ${changes.join(', ')}`);
  }
  const targets = opts.force ? BINARIES : changes;

  if (opts.dryRun) {
    for (const name of targets) {
      const fresh = sourceInfo[name];
      const recorded = provenance.binaries?.[name];
      info(
        `would copy ${fresh.srcPath} -> bin/${name} ` +
          `(size ${recorded?.size ?? 'n/a'} -> ${fresh.size}, ` +
          `sha256 ${recorded?.sha256 ?? 'n/a'} -> ${fresh.sha256})`,
      );
    }
    info('dry-run complete; no files written.');
    process.exit(0);
  }

  // Perform copies + recompute destination sha256 (truth-from-disk).
  const newBinaries = { ...(provenance.binaries ?? {}) };
  for (const name of targets) {
    const srcPath = sourceInfo[name].srcPath;
    const destPath = path.join(repoRoot, 'bin', name);
    copyFileSync(srcPath, destPath);
    const destSha = sha256OfFile(destPath);
    const destSize = statSync(destPath).size;
    if (destSha !== sourceInfo[name].sha256 || destSize !== sourceInfo[name].size) {
      fail(
        `post-copy integrity check failed for ${name}: ` +
          `dest sha256=${destSha} size=${destSize}, src sha256=${sourceInfo[name].sha256} size=${sourceInfo[name].size}`,
        7,
      );
    }
    newBinaries[name] = {
      platform: PLATFORM_OF[name],
      size: destSize,
      sha256: destSha,
    };
    info(`copied ${name} (sha256 ${destSha}, ${destSize} B)`);
  }

  // Update provenance.
  const newCommit = gitHeadSha(sourceRepo);
  const updated = {
    ...provenance,
    source_commit: newCommit,
    copied_at: isoNow(),
    binaries: newBinaries,
  };
  atomicWriteJson(provenancePath, updated);
  info(`provenance updated at ${provenancePath} (source_commit=${newCommit}).`);
  process.exit(0);
}

main();
