#!/usr/bin/env node
/**
 * T-L6-E AC-3 / NF17 — verify no telemetry endpoint pattern in source.
 *
 * Cross-platform Node implementation; the sibling `.sh` is a literal
 * fulfillment of the T-L6-E `creates:` spec for POSIX runners, but `npm run
 * check:no-telemetry` invokes this `.mjs` directly so the gate works
 * identically on Windows / macOS / Linux.
 *
 * Two complementary checks:
 *   1. SaaS vendor names — posthog / mixpanel / segment.io / sentry.io /
 *      analytics.google.com / amplitude.com.
 *   2. Generic endpoint patterns — `/v1/(track|event|telemetry|analytics)`
 *      style URLs, regardless of host.
 *
 * Inline `//` and block-comment lines, README files, spec/test files, and
 * fixture directories are excluded so that documentation can legitimately
 * mention the names ("we don't ship telemetry — no posthog / mixpanel").
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one offender found (CI fails)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const SCAN_ROOTS = ['src/core', 'src/main', 'src/renderer', 'src/presentation'];
const VENDOR_RE = /(posthog|mixpanel|segment\.io|analytics\.google\.com|sentry\.io|amplitude\.com)/i;
const GENERIC_RE = /\/v1\/(track|event|telemetry|analytics)/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|\/\*)/;
const FIXTURE_RE = /\.(spec|test)\.|fixtures[\\/]/;

console.log('[check-no-telemetry-endpoint] scope:', SCAN_ROOTS.join(' '));

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

let failed = false;

for (const scanRoot of SCAN_ROOTS) {
  const abs = path.join(root, scanRoot);
  for (const file of walk(abs)) {
    if (!SOURCE_EXTS.has(path.extname(file))) continue;
    if (FIXTURE_RE.test(file)) continue;
    if (/README/i.test(path.basename(file))) continue;

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_RE.test(line)) continue;
      if (VENDOR_RE.test(line)) {
        console.error(`ERROR (NF17): telemetry SaaS vendor in ${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
        failed = true;
      }
      if (GENERIC_RE.test(line)) {
        console.error(`ERROR (NF17): generic telemetry endpoint in ${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
console.log('OK: no telemetry endpoint in source (NF17)');
