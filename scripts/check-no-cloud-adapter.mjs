#!/usr/bin/env node
/*
 * T-L6-E AC-2 / NF16 -- verify the production bundle has no cloud-* adapter.
 *
 * Cross-platform Node implementation; the sibling .sh is a literal
 * fulfillment of the T-L6-E creates: spec for POSIX runners, but
 * `npm run check:no-cloud` invokes this .mjs directly so the gate works
 * identically on Windows / macOS / Linux.
 *
 * Two complementary checks:
 *   1. Directory check -- no src/core/adapters/cloud_X/ or src/main/cloud_X/
 *      directory exists. Local-first architecture per ADR-001 + NF16: any
 *      remote adapter would have to live behind an explicitly-marked path
 *      that this script blocks.
 *   2. Hostname check -- no source file references a SaaS cloud hostname
 *      (AWS / GCP / Azure / Cloudflare / OpenAI / Anthropic). Inline //
 *      and block-comment lines are filtered out so docstrings / README
 *      references do not trip the gate.
 *
 * Exit codes:
 *   0 -- clean
 *   1 -- at least one offender found (CI fails)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const SCAN_ROOTS = ['src/core/adapters', 'src/main'];
const HOST_RE = /https?:\/\/[a-zA-Z0-9-]+\.(amazonaws|googleapis|azure|cloudflare|openai|anthropic)\.com/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|\/\*)/;
const FIXTURE_RE = /\.(spec|test)\./;

console.log('[check-no-cloud-adapter] scope:', SCAN_ROOTS.join(' '));

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield { type: 'dir', name: entry.name, full };
      yield* walk(full);
    } else if (entry.isFile()) {
      yield { type: 'file', name: entry.name, full };
    }
  }
}

let failed = false;

// 1. Directory check — any dir whose name starts with `cloud_`
for (const scanRoot of SCAN_ROOTS) {
  const abs = path.join(root, scanRoot);
  for (const node of walk(abs)) {
    if (node.type === 'dir' && node.name.startsWith('cloud_')) {
      console.error(`ERROR (NF16): cloud_* adapter directory exists: ${node.full}`);
      failed = true;
    }
  }
}

// 2. Hostname check — any source line matching the cloud-host regex
for (const scanRoot of SCAN_ROOTS) {
  const abs = path.join(root, scanRoot);
  for (const node of walk(abs)) {
    if (node.type !== 'file') continue;
    if (!SOURCE_EXTS.has(path.extname(node.name))) continue;
    if (FIXTURE_RE.test(node.name)) continue;
    if (/README/i.test(node.name)) continue;

    const lines = fs.readFileSync(node.full, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_RE.test(line)) continue;
      if (HOST_RE.test(line)) {
        console.error(`ERROR (NF16): cloud hostname in ${path.relative(root, node.full)}:${i + 1}: ${line.trim()}`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
console.log('OK: no cloud adapter in production bundle (NF16)');
