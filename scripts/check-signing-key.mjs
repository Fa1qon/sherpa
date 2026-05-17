// Build-time guard: refuse to ship a production build while
// `src/core/adapters/updater/signing_key.ts` still exports the Phase-2
// PLACEHOLDER public key. T-L7-04 (Phase 7 packaging) owns the swap to a
// real release-signing key; this script is the safety net that makes
// "forgot to do the swap" a build failure instead of a shipped
// vulnerability (the placeholder's private half is publicly committed in
// `tests/integration/_helpers/electron_updater_mock.ts` for round-trip
// tests, so anyone could sign a malicious update against a build that
// still trusts the placeholder).
//
// Usage:
//   node scripts/check-signing-key.mjs            # production check
//   SHERPA_DEV_BUILD=1 node scripts/check-signing-key.mjs  # bypass
//
// The bypass exists ONLY for local dev / smoke iteration where engineers
// run `npm run build:main` against the placeholder key on purpose. CI and
// release packaging MUST NOT set SHERPA_DEV_BUILD — let the guard fire so
// a forgotten T-L7-04 swap fails the pipeline.
//
// Wired into npm via `prebuild` + `prebuild:main` lifecycle hooks in
// package.json; npm runs `pre*` automatically before the matching script.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const signingKeyFile = path.join(
  repoRoot,
  'src',
  'core',
  'adapters',
  'updater',
  'signing_key.ts',
);

// SHA-256 (hex, lowercase) of the Phase-2 placeholder PEM bytes (UTF-8).
// Computed once at script-write time; if T-L7-04 changes the constant the
// computed hash will diverge from this and the guard exits 0 ("production
// key").
const PLACEHOLDER_PEM_HASH =
  '247ca69cbcaa1c4c4bf6cc9e836bf1931463c92762f1376f7e72fe00a73a7cdb';

const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function fail(msg) {
  process.stderr.write(`${RED}${BOLD}${msg}${RESET}\n`);
  process.exit(1);
}

if (process.env.SHERPA_DEV_BUILD === '1') {
  console.log('[check-signing-key] DEV BUILD: skipping signing-key placeholder check');
  process.exit(0);
}

let source;
try {
  source = fs.readFileSync(signingKeyFile, 'utf8');
} catch (err) {
  fail(
    `[check-signing-key] ERROR: cannot read ${signingKeyFile}\n` +
      `  ${err && err.message ? err.message : String(err)}\n` +
      `  This file must exist; if it was renamed, update scripts/check-signing-key.mjs.`,
  );
}

// ─── T-L7-04 production-injection check ───────────────────────────────────
//
// The CI release pipeline runs `scripts/inject-release-key.mjs` BEFORE
// `npm run build:main`, which mutates the `RELEASE_PUBLIC_KEY` literal in
// signing_key.ts from `null` to a real PEM array. When that has happened
// the production trust root is present in the binary and the placeholder
// `TEST_PUBLIC_KEY` check below is orthogonal — `composePinnedKeys()`
// excludes the placeholder under NODE_ENV='production' (see signing_key.ts
// header §Slot model). So:
//
//   - If RELEASE_PUBLIC_KEY is non-null → CI injection succeeded → exit 0.
//   - If RELEASE_PUBLIC_KEY is `null` and TEST_PUBLIC_KEY is the placeholder
//     → unsafe production build → exit 1.
//   - If RELEASE_PUBLIC_KEY is `null` and TEST_PUBLIC_KEY has been swapped
//     manually → unusual but allowed (the placeholder check below would
//     pass on its own).
//
// Detect the injection by inspecting the literal that follows the
// T-L7-04-INJECT-MARKER comment. Any non-`null` literal counts as
// "production key embedded". The literal can span multiple lines (PEM
// array form: `[\n  '-----BEGIN...',\n  ...].join('\n')`) so we capture
// up to the next semicolon at column 0 (the assignment terminator).
const releaseSlotMatch = source.match(
  /const\s+RELEASE_PUBLIC_KEY\s*:\s*string\s*\|\s*null\s*=\s*\n\s*\/\/\s*T-L7-04-INJECT-MARKER[\s\S]*?\n\s*([\s\S]*?);\s*\n/,
);
if (releaseSlotMatch) {
  // Strip leading comment lines (the marker spans multiple `//` lines
  // before the literal itself) — find the first non-`//` line.
  const captured = releaseSlotMatch[1];
  const lines = captured.split('\n').map((l) => l.trim());
  const firstNonComment = lines.findIndex((l) => l !== '' && !l.startsWith('//'));
  const literal = firstNonComment >= 0
    ? lines.slice(firstNonComment).join('\n').trim()
    : '';
  if (literal !== '' && literal !== 'null') {
    // Production trust root injected by CI release pipeline. Compute and
    // print its fingerprint for transparency / audit.
    const arrayMatchInjected = literal.match(/^\[([\s\S]*)\]\.join\(\s*['"]\\n['"]\s*\)$/);
    let fingerprint = 'unknown-shape';
    if (arrayMatchInjected) {
      const lineRegexInjected = /'([^'\\]*(?:\\.[^'\\]*)*)'/g;
      const linesInjected = [];
      let mm;
      while ((mm = lineRegexInjected.exec(arrayMatchInjected[1])) !== null) {
        linesInjected.push(mm[1]);
      }
      if (linesInjected.length >= 3) {
        fingerprint = createHash('sha256')
          .update(linesInjected.join('\n'), 'utf8')
          .digest('hex')
          .slice(0, 12);
      }
    }
    console.log(
      `[check-signing-key] Production RELEASE_PUBLIC_KEY embedded (sha256 ${fingerprint}...); placeholder check skipped.`,
    );
    process.exit(0);
  }
}

// ─── Plan 8-fix DEV STUB detection ────────────────────────────────────────
//
// Plan 8-fix committed signing_key.ts as a minimal stub (the real updater
// workstream — METH-070 T-L2-I — is deferred). The stub exports
// `SIGNING_KEY_STATUS = 'stub' as const` and has no TEST_PUBLIC_KEY array,
// so the regex extraction below would fail with the unhelpful "could not
// locate TEST_PUBLIC_KEY array literal" diagnostic. Detect the stub here
// and emit an accurate message: production builds are blocked until the
// signing infrastructure lands; SHERPA_DEV_BUILD=1 remains the dev bypass.
//
// Note: the RELEASE_PUBLIC_KEY check above runs first, so a future
// release-injection that flips the stub into a production-keyed file will
// still take precedence over this branch.
const stubMatch = source.match(
  /export\s+const\s+SIGNING_KEY_STATUS\s*=\s*['"]stub['"]\s+as\s+const/,
);
if (stubMatch) {
  fail(
    `\n` +
      `[check-signing-key] ERROR: production build refused.\n` +
      `\n` +
      `  src/core/adapters/updater/signing_key.ts is the Plan 8-fix DEV STUB.\n` +
      `  No production trust root is embedded; the updater workstream\n` +
      `  (METH-070 T-L2-I) is deferred. Production builds are blocked until\n` +
      `  the real signing infrastructure lands.\n` +
      `\n` +
      `  Bypass for local dev only:\n` +
      `    SHERPA_DEV_BUILD=1 npm run dist:win\n` +
      `  CI / release pipelines MUST NOT set SHERPA_DEV_BUILD.\n`,
  );
}

// Extract the array literal that builds TEST_PUBLIC_KEY. The file uses:
//   export const TEST_PUBLIC_KEY: string = [
//     '-----BEGIN PUBLIC KEY-----',
//     '<base64 SPKI>',
//     '-----END PUBLIC KEY-----',
//     '',
//   ].join('\n');
// Regex (multiline + dotall via [\s\S]) captures the array body.
const arrayMatch = source.match(
  /export\s+const\s+TEST_PUBLIC_KEY\s*:\s*string\s*=\s*\[([\s\S]*?)\]\s*\.join\(\s*['"]\\n['"]\s*\)/,
);

if (!arrayMatch) {
  fail(
    `[check-signing-key] ERROR: could not locate TEST_PUBLIC_KEY array literal in\n` +
      `  ${signingKeyFile}\n` +
      `  The file format may have changed (e.g. T-L7-04 switched to a different\n` +
      `  embedding scheme). Update scripts/check-signing-key.mjs to match the new\n` +
      `  shape, or set SHERPA_DEV_BUILD=1 to bypass for dev builds.`,
  );
}

// Pull each single-quoted string out of the array body, in order, then
// reconstruct the PEM the same way the runtime does (.join('\n')).
const lineRegex = /'([^'\\]*(?:\\.[^'\\]*)*)'/g;
const lines = [];
let m;
while ((m = lineRegex.exec(arrayMatch[1])) !== null) {
  lines.push(m[1]);
}

if (lines.length < 3) {
  fail(
    `[check-signing-key] ERROR: TEST_PUBLIC_KEY array had ${lines.length} string(s); ` +
      `expected at least 3 (BEGIN line, base64, END line).\n` +
      `  ${signingKeyFile}`,
  );
}

const reconstructedPem = lines.join('\n');
const actualHash = createHash('sha256')
  .update(reconstructedPem, 'utf8')
  .digest('hex');

if (actualHash === PLACEHOLDER_PEM_HASH) {
  fail(
    `\n` +
      `[check-signing-key] ERROR: production build refused.\n` +
      `\n` +
      `  src/core/adapters/updater/signing_key.ts still exports the Phase-2\n` +
      `  PLACEHOLDER public key (SHA-256 ${actualHash}).\n` +
      `\n` +
      `  The placeholder's PRIVATE half is committed in\n` +
      `    tests/integration/_helpers/electron_updater_mock.ts (TEST_PRIVATE_KEY)\n` +
      `  so any release built with this constant could be hijacked by a manifest\n` +
      `  signed with that publicly-known key.\n` +
      `\n` +
      `  Action: T-L7-04 (Phase 7 packaging) must replace TEST_PUBLIC_KEY with\n` +
      `  the real release-signing public key before any production / CI build.\n` +
      `\n` +
      `  Bypass for local dev only:\n` +
      `    SHERPA_DEV_BUILD=1 npm run build:main\n` +
      `    SHERPA_DEV_BUILD=1 npm run build\n` +
      `  CI / release pipelines MUST NOT set SHERPA_DEV_BUILD.\n`,
  );
}

console.log(
  `[check-signing-key] Signing key check OK (production key, sha256 ${actualHash.slice(0, 12)}...)`,
);
process.exit(0);
