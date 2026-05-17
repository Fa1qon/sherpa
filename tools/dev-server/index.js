#!/usr/bin/env node
// Sherpa core distribution server — local dev / test stub. T-L7-03.
//
// Static HTTPS server that mirrors the production release endpoint shape so
// the F7 update flow (T-L5-07 spec) and the ElectronUpdaterAdapter can be
// driven against a controllable URL during local development. The production
// distribution is served by a CDN / static origin (see PRODUCTION.md for
// recommended configurations); this stub exists so contributors can iterate
// without depending on the live CDN.
//
// Routes:
//   GET /channels/<channel>.json
//       → { current, url } pointing to the manifest for the published version
//   GET /v/<version>/manifest.json
//       → JSON manifest matching `UpdateManifest` (manifest_verifier.ts)
//   GET /v/<version>/core.tar.gz
//       → binary archive containing the core payload
//   GET /healthz
//       → 200 OK plain-text "ok"      (smoke / readiness probe)
//
// Environment:
//   SHERPA_DEV_SERVER_PORT   (default 8443)
//   SHERPA_DEV_SERVER_HOST   (default 127.0.0.1)
//
// TLS:
//   At startup the server generates a self-signed cert into ./cert/ if one is
//   not already present. Generation requires `openssl` on PATH (Git for
//   Windows ships it; Linux/macOS have it system-wide). When openssl is
//   missing the server prints a clear error with manual remediation steps
//   and exits non-zero. The cert/ directory is gitignored — never commit
//   private keys.
//
// Logging:
//   Each request logs `[dev-server] <method> <path> <status>` to stderr.
//
// This file is plain ESM JS (allowJs:false in tsconfig.json), runs on
// Node >= 20, and uses only built-in modules. No npm dependencies.

import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number.parseInt(process.env.SHERPA_DEV_SERVER_PORT ?? '8443', 10);
const HOST = process.env.SHERPA_DEV_SERVER_HOST ?? '127.0.0.1';
const CERT_DIR = join(__dirname, 'cert');
const CERT_PATH = join(CERT_DIR, 'dev-cert.pem');
const KEY_PATH = join(CERT_DIR, 'dev-key.pem');
const MANIFEST_PATH = join(__dirname, 'sample-manifest.json');
const ARCHIVE_PATH = join(__dirname, 'sample-core.tar.gz');
const PUBLISHED_VERSION = '0.1.0-alpha.1';

/**
 * Ensure a self-signed cert exists at CERT_DIR. If it does not, generate one
 * via openssl. We use a 2048-bit RSA key + 365-day cert, CN=localhost, with
 * subjectAltName covering localhost + 127.0.0.1 so the same cert works for
 * both hostnames a contributor might use.
 *
 * Why openssl rather than node:crypto:
 *   Node's crypto module exposes key generation but not X.509 certificate
 *   creation. Rolling our own cert by hand-crafting DER bytes is hostile to
 *   maintenance; openssl is universally available (Git for Windows bundles
 *   it; Linux/macOS ship it). When unavailable we surface a clean error.
 */
function ensureCert() {
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) return;

  mkdirSync(CERT_DIR, { recursive: true });

  const opensslCheck = spawnSync('openssl', ['version'], { encoding: 'utf8' });
  if (opensslCheck.status !== 0) {
    process.stderr.write(
      [
        '[dev-server] openssl not found on PATH.',
        '            Install openssl (Git for Windows includes it) or generate',
        '            a self-signed cert manually and place at:',
        `              ${CERT_PATH}`,
        `              ${KEY_PATH}`,
        '            Example command (any host with openssl):',
        '              openssl req -x509 -newkey rsa:2048 -nodes \\',
        `                -keyout '${KEY_PATH}' \\`,
        `                -out '${CERT_PATH}' \\`,
        '                -days 365 -subj "/CN=localhost" \\',
        '                -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"',
        '',
      ].join('\n'),
    );
    process.exit(2);
  }

  process.stderr.write('[dev-server] generating self-signed cert via openssl...\n');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      KEY_PATH,
      '-out',
      CERT_PATH,
      '-days',
      '365',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  process.stderr.write(`[dev-server] cert written to ${CERT_DIR}/\n`);
}

/**
 * Build the channel-pointer JSON. Production servers MAY add extra fields
 * (rollout-percentage, supported-platforms, etc.); the minimal shape the
 * updater consumes is `{ current, url }`.
 */
function buildChannelPointer(channel, host, port) {
  return {
    channel,
    current: PUBLISHED_VERSION,
    url: `https://${host}:${port}/v/${PUBLISHED_VERSION}/manifest.json`,
  };
}

function logRequest(req, status) {
  process.stderr.write(
    `[dev-server] ${req.method ?? '?'} ${req.url ?? '?'} ${status}\n`,
  );
}

function send(res, status, contentType, body, req) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
  logRequest(req, status);
}

function handle(req, res) {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed', req);
    return;
  }

  if (url === '/healthz') {
    send(res, 200, 'text/plain; charset=utf-8', 'ok', req);
    return;
  }

  // /channels/<name>.json
  const channelMatch = /^\/channels\/([A-Za-z0-9_-]+)\.json$/.exec(url);
  if (channelMatch) {
    const channel = channelMatch[1];
    const body = JSON.stringify(buildChannelPointer(channel, HOST, PORT), null, 2);
    send(res, 200, 'application/json; charset=utf-8', body, req);
    return;
  }

  // /v/<version>/manifest.json
  const manifestMatch = /^\/v\/([A-Za-z0-9._-]+)\/manifest\.json$/.exec(url);
  if (manifestMatch) {
    const version = manifestMatch[1];
    if (version !== PUBLISHED_VERSION) {
      send(res, 404, 'application/json; charset=utf-8',
        JSON.stringify({ error: 'version not found', version }), req);
      return;
    }
    const body = readFileSync(MANIFEST_PATH);
    send(res, 200, 'application/json; charset=utf-8', body, req);
    return;
  }

  // /v/<version>/core.tar.gz
  const archiveMatch = /^\/v\/([A-Za-z0-9._-]+)\/core\.tar\.gz$/.exec(url);
  if (archiveMatch) {
    const version = archiveMatch[1];
    if (version !== PUBLISHED_VERSION) {
      send(res, 404, 'application/json; charset=utf-8',
        JSON.stringify({ error: 'version not found', version }), req);
      return;
    }
    const body = readFileSync(ARCHIVE_PATH);
    send(res, 200, 'application/gzip', body, req);
    return;
  }

  send(res, 404, 'text/plain; charset=utf-8', 'Not Found', req);
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    process.stderr.write(`[dev-server] sample-manifest.json missing at ${MANIFEST_PATH}\n`);
    process.exit(2);
  }
  if (!existsSync(ARCHIVE_PATH)) {
    process.stderr.write(
      `[dev-server] sample-core.tar.gz missing at ${ARCHIVE_PATH}\n` +
      `             regenerate via: node tools/dev-server/_gen-fixture.mjs\n`,
    );
    process.exit(2);
  }

  ensureCert();

  const server = createServer(
    { cert: readFileSync(CERT_PATH), key: readFileSync(KEY_PATH) },
    handle,
  );

  server.listen(PORT, HOST, () => {
    process.stderr.write(
      `[dev-server] listening on https://${HOST}:${PORT} (self-signed)\n` +
      `[dev-server] published version: ${PUBLISHED_VERSION}\n` +
      `[dev-server] try: curl -k https://${HOST}:${PORT}/channels/stable.json\n`,
    );
  });

  // Graceful shutdown so Ctrl-C does not leak the listener in CI.
  const shutdown = (signal) => {
    process.stderr.write(`[dev-server] received ${signal}, shutting down\n`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
