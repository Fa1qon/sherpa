// Ed25519 manifest signer for the Sherpa release pipeline (T-L7-04).
//
// Reads the unsigned manifest JSON, signs the canonicalised payload with
// `SHERPA_RELEASE_PRIVATE_KEY` (PEM PKCS#8 from a GitHub Actions secret),
// and writes the signed manifest to disk. Output shape matches
// `UpdateManifest` in `src/core/adapters/updater/manifest_verifier.ts`:
//
//   { version, sha256, signing_key_hash, signature, ...passthrough }
//
// Canonicalisation MUST match `manifest_verifier.canonicaliseManifest`
// byte-for-byte:
//   1. Drop the `signature` field
//   2. Sort remaining keys lexicographically
//   3. JSON.stringify (no extra whitespace)
//
// Any divergence makes the runtime verifier reject the signature; this
// script + manifest_verifier.ts are tested in lockstep.
//
// Usage:
//   SHERPA_RELEASE_PRIVATE_KEY="$(cat private.pem)" \
//     node scripts/sign-release-manifest.mjs \
//       --in dist/manifest.unsigned.json \
//       --out dist/manifest.json \
//       --artifact dist/Sherpa-Setup-0.1.0-alpha.1.exe \
//       --version 0.1.0-alpha.1
//
// CLI flags:
//   --in <path>       Path to unsigned manifest JSON (required, unless --build)
//   --out <path>      Path to write signed manifest JSON (required)
//   --artifact <path> Compute sha256 of this file and inject into manifest
//                     (optional; if omitted the input must already have sha256)
//   --version <ver>   Override / set the manifest's version field
//   --public-key <p>  PEM file path for the public key (used to compute
//                     signing_key_hash). If omitted, derived from the
//                     private key.
//   --build           Build a fresh manifest from CLI flags only (no --in
//                     required); writes {version, sha256, signing_key_hash,
//                     signature, released_at, ...extras passed via --field}
//
// On success: prints `wrote <path> (sig=<base64-prefix>...)` and exit 0.
// On failure: prints reason to stderr and exits 1.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  sign as cryptoSign,
} from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';

const argv = process.argv.slice(2);

function getFlag(name) {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  const val = argv[idx + 1];
  if (!val || val.startsWith('--')) return null;
  return val;
}

function hasFlag(name) {
  return argv.includes(name);
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function fail(msg) {
  process.stderr.write(`${RED}${BOLD}[sign-release-manifest] ${msg}${RESET}\n`);
  process.exit(1);
}

function info(msg) {
  process.stdout.write(`${GREEN}[sign-release-manifest]${RESET} ${msg}\n`);
}

const inPath = getFlag('--in');
const outPath = getFlag('--out');
const artifactPath = getFlag('--artifact');
const versionFlag = getFlag('--version');
const publicKeyFlag = getFlag('--public-key');
const buildMode = hasFlag('--build');

if (!outPath) fail('--out <path> is required.');
if (!inPath && !buildMode) fail('--in <path> or --build is required.');

const privatePem = process.env.SHERPA_RELEASE_PRIVATE_KEY;
if (!privatePem || privatePem.trim() === '') {
  fail(
    `SHERPA_RELEASE_PRIVATE_KEY env var is empty.\n` +
      `  This script is invoked from the CI release pipeline; the secret ` +
      `must be set on the workflow run.\n` +
      `  Local parity-test: pass the integration TEST_PRIVATE_KEY ` +
      `(see tests/integration/_helpers/electron_updater_mock.ts).`,
  );
}

let privateKey;
try {
  privateKey = createPrivateKey({ key: privatePem, format: 'pem' });
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    fail(
      `SHERPA_RELEASE_PRIVATE_KEY is not an Ed25519 key ` +
        `(got ${privateKey.asymmetricKeyType ?? 'unknown'}).`,
    );
  }
} catch (err) {
  fail(
    `failed to parse SHERPA_RELEASE_PRIVATE_KEY as PEM: ` +
      `${err && err.message ? err.message : err}`,
  );
}

// ─── Resolve public key + its hash ─────────────────────────────────────────

let publicPem;
if (publicKeyFlag) {
  publicPem = readFileSync(publicKeyFlag, 'utf8');
} else if (process.env.SHERPA_RELEASE_PUBLIC_KEY) {
  publicPem = process.env.SHERPA_RELEASE_PUBLIC_KEY;
} else {
  // Derive the public key from the private key. Output format: SPKI PEM
  // (matches what `signing_key.ts` pins).
  const derived = createPublicKey(privateKey).export({
    format: 'pem',
    type: 'spki',
  });
  publicPem =
    typeof derived === 'string' ? derived : derived.toString('utf8');
}

// Normalise the public PEM for hashing: ensure trailing newline, LF line
// endings. The `signing_key.PINNED_KEYS` entry is hashed in the same shape
// (`hashSigningKey` uses raw PEM bytes UTF-8). Mismatch here = runtime
// `signing_key_unrecognized` failure.
const publicPemNormalised =
  publicPem.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
const signingKeyHash = createHash('sha256')
  .update(publicPemNormalised, 'utf8')
  .digest('hex');

// ─── Build / load the unsigned manifest ────────────────────────────────────

let manifest;
if (buildMode) {
  manifest = {};
} else {
  try {
    manifest = JSON.parse(readFileSync(inPath, 'utf8'));
  } catch (err) {
    fail(
      `failed to read/parse ${inPath}: ` +
        `${err && err.message ? err.message : err}`,
    );
  }
  if (typeof manifest !== 'object' || manifest === null) {
    fail(`input manifest at ${inPath} is not a JSON object.`);
  }
}

// Drop any pre-existing signature; we are about to compute the real one.
delete manifest.signature;

// Override / set fields from CLI flags.
if (versionFlag) manifest.version = versionFlag;

if (artifactPath) {
  let bytes;
  try {
    bytes = readFileSync(artifactPath);
  } catch (err) {
    fail(
      `--artifact ${artifactPath}: cannot read: ` +
        `${err && err.message ? err.message : err}`,
    );
  }
  manifest.sha256 = createHash('sha256').update(bytes).digest('hex');
}

// Always populate signing_key_hash so canonical payload includes it.
manifest.signing_key_hash = signingKeyHash;

// Sanity checks before signing.
if (typeof manifest.version !== 'string' || manifest.version === '') {
  fail(
    `manifest is missing 'version' (string). Pass --version <ver> or include ` +
      `it in the input file.`,
  );
}
if (typeof manifest.sha256 !== 'string' || manifest.sha256 === '') {
  fail(
    `manifest is missing 'sha256'. Pass --artifact <path> to compute it, or ` +
      `include the field in the input file.`,
  );
}

// ─── Canonicalise + sign ───────────────────────────────────────────────────
//
// Mirror manifest_verifier.canonicaliseManifest exactly:
//   - drop signature field (already deleted above)
//   - sort keys
//   - JSON.stringify
function canonicaliseManifest(m) {
  const { signature: _omit, ...rest } = m;
  void _omit;
  const sortedEntries = Object.keys(rest)
    .sort()
    .map((k) => [k, rest[k]]);
  const canonicalised = Object.fromEntries(sortedEntries);
  return Buffer.from(JSON.stringify(canonicalised), 'utf8');
}

const payload = canonicaliseManifest(manifest);
const sigBytes = cryptoSign(null, payload, privateKey);
const signatureB64 = sigBytes.toString('base64');
manifest.signature = signatureB64;

// ─── Write the signed manifest ─────────────────────────────────────────────

const json = JSON.stringify(manifest, null, 2) + '\n';
try {
  writeFileSync(outPath, json, 'utf8');
} catch (err) {
  fail(
    `failed to write ${outPath}: ` +
      `${err && err.message ? err.message : err}`,
  );
}

info(
  `wrote ${path.relative(process.cwd(), outPath)} ` +
    `(sig=${signatureB64.slice(0, 16)}..., key_hash=${signingKeyHash.slice(0, 12)}...)`,
);
process.exit(0);
