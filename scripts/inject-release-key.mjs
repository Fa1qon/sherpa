// Build-time injector for the production release signing key (T-L7-04).
//
// Reads `SHERPA_RELEASE_PUBLIC_KEY` (and optionally
// `SHERPA_RELEASE_KEY_EXPIRES`, `SHERPA_RETIRED_PUBLIC_KEY`,
// `SHERPA_RETIRED_KEY_EXPIRES`) from the environment and rewrites
// `src/core/adapters/updater/signing_key.ts` in place — turning the
// `RELEASE_PUBLIC_KEY` literal `null` into a string literal containing the
// production Ed25519 SPKI PEM. The rewrite happens BEFORE
// `npm run build:main` so the prebuild guard (`scripts/check-signing-key.mjs`)
// sees a non-null `RELEASE_PUBLIC_KEY` and exits 0.
//
// Why a pre-build script and not an electron-builder afterPack hook:
// after `tsc` runs, the source file in dist-electron is JavaScript, not
// TypeScript — but the `RELEASE_PUBLIC_KEY = null` literal survives the
// compile unchanged. Doing the replacement on TS source is the simplest
// "single-source-of-truth" strategy and means the JS output is correct
// the first time. See header in
// src/core/adapters/updater/signing_key.ts for the full design rationale
// (option I-B per T-L7-04 brief).
//
// Usage (CI release pipeline):
//   SHERPA_RELEASE_PUBLIC_KEY="$(cat release-pub.pem)" \
//     node scripts/inject-release-key.mjs
//
// Optional env:
//   SHERPA_RELEASE_KEY_EXPIRES   ISO 8601 date (defaults to 2099-12-31T23:59:59Z)
//   SHERPA_RETIRED_PUBLIC_KEY    PEM string for the retired-rotation slot
//   SHERPA_RETIRED_KEY_EXPIRES   ISO 8601 date for the retired key
//
// Local-dev parity test:
//   $env:SHERPA_RELEASE_PUBLIC_KEY = (Get-Content tests/_fixtures/fake-release.pem -Raw)
//   node scripts/inject-release-key.mjs --dry-run
//
// Safety properties (idempotency + double-injection refusal):
//   1. Refuses to run if `RELEASE_PUBLIC_KEY` is already non-null in
//      source (CI re-runs do NOT silently overwrite an existing key).
//   2. With `--dry-run`, prints the planned diff to stdout and exits 0
//      without touching the file.
//   3. With `--restore`, restores the original `null` literal (used by
//      the local-dev parity smoke test to leave a clean working tree).
//   4. Validates the input PEM by attempting `crypto.createPublicKey` —
//      garbage input fails fast with a clear error.

import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const restore = args.includes('--restore');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function fail(msg) {
  process.stderr.write(`${RED}${BOLD}[inject-release-key] ${msg}${RESET}\n`);
  process.exit(1);
}

function info(msg) {
  process.stdout.write(`${GREEN}[inject-release-key]${RESET} ${msg}\n`);
}

function warn(msg) {
  process.stdout.write(`${YELLOW}[inject-release-key]${RESET} ${msg}\n`);
}

// The exact text region the rewrite targets. Locate by the marker comment
// — NOT a fragile char offset. The marker contract is documented in
// signing_key.ts header.
//
// Primary slot regex captures:
//   const RELEASE_PUBLIC_KEY: string | null =
//     // T-L7-04-INJECT-MARKER ...
//     null;
//
// Group 1 = full prefix up to (and including) the marker comment line.
// Group 2 = "null" (the literal we replace).
const PRIMARY_REGEX =
  /(export const RELEASE_PUBLIC_KEY: string \| null =\s*\n\s*\/\/ T-L7-04-INJECT-MARKER[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*)(null|\[(?:[^\]])+\]\.join\(\s*['"]\\n['"]\s*\))(\s*;)/;

const RETIRED_REGEX =
  /(export const RETIRED_PUBLIC_KEY: string \| null =\s*\n\s*\/\/ T-L7-04-INJECT-MARKER-RETIRED[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*)(null|\[(?:[^\]])+\]\.join\(\s*['"]\\n['"]\s*\))(\s*;)/;

function pemToArrayLiteral(pem) {
  // Normalise CRLF → LF, strip trailing whitespace, ensure exactly one
  // trailing newline. This mirrors how `TEST_PUBLIC_KEY` is laid out so
  // the final `.join('\n')` reconstructs the canonical PEM bytes.
  const normalised = pem.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
  const lines = normalised.split('\n');
  // Each line is single-quoted; embedded apostrophes get escaped (PEMs
  // never contain them but be defensive).
  const escaped = lines.map((l) => `'${l.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  // Indent matches the existing TEST_PUBLIC_KEY array layout (2 spaces
  // for each element, opening bracket on the assignment line).
  return ['[', ...escaped.map((s) => `  ${s},`), '].join(\'\\n\')'].join('\n');
}

function validatePem(pem, label) {
  try {
    const key = createPublicKey({ key: pem, format: 'pem' });
    if (key.asymmetricKeyType !== 'ed25519') {
      fail(
        `${label}: expected an Ed25519 public key; got ` +
          `${key.asymmetricKeyType ?? 'unknown'}.`,
      );
    }
  } catch (err) {
    fail(
      `${label}: failed to parse PEM. Ensure the env var contains the full ` +
        `PEM including BEGIN/END lines. Underlying error: ` +
        `${err && err.message ? err.message : String(err)}`,
    );
  }
}

let source;
try {
  source = readFileSync(signingKeyFile, 'utf8');
} catch (err) {
  fail(
    `cannot read ${signingKeyFile}: ${err && err.message ? err.message : err}`,
  );
}

if (restore) {
  // Local-dev mode: revert any existing injection back to `null`. Used
  // by the smoke test in `scripts/_smoke-inject-release-key.mjs` so the
  // working tree stays clean.
  let next = source;
  let touched = false;
  for (const re of [PRIMARY_REGEX, RETIRED_REGEX]) {
    const m = next.match(re);
    if (!m) continue;
    if (m[2] === 'null') continue;
    next = next.replace(re, '$1null$3');
    touched = true;
  }
  if (!touched) {
    info('--restore: nothing to revert; both slots already null.');
    process.exit(0);
  }
  if (dryRun) {
    info('--restore --dry-run: would revert injected key(s) to null. (no write)');
    process.exit(0);
  }
  writeFileSync(signingKeyFile, next, 'utf8');
  info(`--restore: signing_key.ts reverted to null literal(s).`);
  process.exit(0);
}

// ─── Inject mode ────────────────────────────────────────────────────────────

const releasePem = process.env.SHERPA_RELEASE_PUBLIC_KEY;
if (!releasePem || releasePem.trim() === '') {
  fail(
    `SHERPA_RELEASE_PUBLIC_KEY env var is empty.\n` +
      `  This script is invoked from the CI release pipeline before ` +
      `npm run build:main.\n` +
      `  Set the env var to the full PEM string (including BEGIN/END lines).\n` +
      `  Local-dev: prefer SHERPA_DEV_BUILD=1 (skip injection entirely) over ` +
      `passing a fake key.`,
  );
}

validatePem(releasePem, 'SHERPA_RELEASE_PUBLIC_KEY');

const releaseExpires =
  process.env.SHERPA_RELEASE_KEY_EXPIRES ?? '2099-12-31T23:59:59Z';
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(releaseExpires)) {
  fail(
    `SHERPA_RELEASE_KEY_EXPIRES must be ISO 8601 UTC ` +
      `(YYYY-MM-DDTHH:mm:ssZ); got "${releaseExpires}".`,
  );
}

const retiredPem = process.env.SHERPA_RETIRED_PUBLIC_KEY;
if (retiredPem && retiredPem.trim() !== '') {
  validatePem(retiredPem, 'SHERPA_RETIRED_PUBLIC_KEY');
}

// Locate primary slot.
const primaryMatch = source.match(PRIMARY_REGEX);
if (!primaryMatch) {
  fail(
    `could not locate the T-L7-04-INJECT-MARKER region in\n` +
      `  ${signingKeyFile}\n` +
      `  The file format may have changed. Update inject-release-key.mjs ` +
      `regex or the marker comment in signing_key.ts.`,
  );
}

if (primaryMatch[2] !== 'null') {
  fail(
    `RELEASE_PUBLIC_KEY is already non-null in signing_key.ts. ` +
      `Refusing to overwrite (idempotency / double-injection guard).\n` +
      `  If this is a CI re-run after a partial failure, restore the file ` +
      `via 'git checkout -- ${signingKeyFile}' and retry.\n` +
      `  Local dev: 'node scripts/inject-release-key.mjs --restore'.`,
  );
}

let nextSource = source.replace(PRIMARY_REGEX, (_full, prefix, _literal, suffix) => {
  return `${prefix}${pemToArrayLiteral(releasePem)}${suffix}`;
});

// Optionally update the RELEASE_KEY_EXPIRES constant if a non-default
// expiry was passed.
if (releaseExpires !== '2099-12-31T23:59:59Z') {
  nextSource = nextSource.replace(
    /(const RELEASE_KEY_EXPIRES = ')[^']+(';)/,
    `$1${releaseExpires}$2`,
  );
}

// Optionally inject retired slot.
if (retiredPem && retiredPem.trim() !== '') {
  const retiredMatch = nextSource.match(RETIRED_REGEX);
  if (!retiredMatch) {
    fail(
      `SHERPA_RETIRED_PUBLIC_KEY was set but ` +
        `T-L7-04-INJECT-MARKER-RETIRED region not found in source.`,
    );
  }
  if (retiredMatch[2] !== 'null') {
    fail(
      `RETIRED_PUBLIC_KEY is already non-null. ` +
        `Refusing to overwrite (idempotency).`,
    );
  }
  nextSource = nextSource.replace(
    RETIRED_REGEX,
    (_full, prefix, _literal, suffix) =>
      `${prefix}${pemToArrayLiteral(retiredPem)}${suffix}`,
  );
  const retiredExpires =
    process.env.SHERPA_RETIRED_KEY_EXPIRES ?? '2099-12-31T23:59:59Z';
  if (retiredExpires !== '2099-12-31T23:59:59Z') {
    nextSource = nextSource.replace(
      /(const RETIRED_KEY_EXPIRES = ')[^']+(';)/,
      `$1${retiredExpires}$2`,
    );
  }
}

if (dryRun) {
  info(
    `--dry-run: would inject Ed25519 release key (${releasePem.length} bytes ` +
      `PEM, expires=${releaseExpires}). No file written.`,
  );
  if (retiredPem) info(`  + retired-slot key would also be injected.`);
  process.exit(0);
}

writeFileSync(signingKeyFile, nextSource, 'utf8');
info(
  `Injected RELEASE_PUBLIC_KEY (${releasePem.length} bytes PEM, ` +
    `expires=${releaseExpires}) into signing_key.ts.`,
);
if (retiredPem) info(`Injected RETIRED_PUBLIC_KEY into retired slot.`);
warn(
  `signing_key.ts is now mutated; do NOT commit this change. ` +
    `The CI workflow performs this swap on a fresh checkout for each release.`,
);
process.exit(0);
