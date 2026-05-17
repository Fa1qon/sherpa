# Contributing

This document collects the local-development conventions for sherpa-ui that
do not yet have a dedicated home in `docs/architecture/` or
`docs/user-guide/`. New sections land here first; once a topic grows past
~one screen it graduates into its own file.

## Running the dev distribution server

`tools/dev-server/` ships a minimal HTTPS static server that mirrors the
production release endpoint shape. Use it to drive the F7 update flow
(`tests/integration/flows/F7_update.spec.ts`) and the
`ElectronUpdaterAdapter` against a controllable URL — particularly useful
when iterating on `update:check`, `update:download-stage`, and the
manifest-verifier wiring without depending on the live CDN.

### Start the server

```bash
node tools/dev-server/index.js
```

Output (first run):

```
[dev-server] generating self-signed cert via openssl...
[dev-server] cert written to tools/dev-server/cert/
[dev-server] listening on https://127.0.0.1:8443 (self-signed)
[dev-server] published version: 0.1.0-alpha.1
[dev-server] try: curl -k https://127.0.0.1:8443/channels/stable.json
```

Subsequent runs reuse the cert. The cert + private key live under
`tools/dev-server/cert/` and are gitignored.

Override the host or port via env:

```bash
SHERPA_DEV_SERVER_PORT=9443 SHERPA_DEV_SERVER_HOST=0.0.0.0 \
  node tools/dev-server/index.js
```

### Verify the endpoints

```bash
# Channel pointer
curl -k https://127.0.0.1:8443/channels/stable.json

# Manifest
curl -k https://127.0.0.1:8443/v/0.1.0-alpha.1/manifest.json

# Artefact (binary)
curl -k -O https://127.0.0.1:8443/v/0.1.0-alpha.1/core.tar.gz

# Health probe
curl -k https://127.0.0.1:8443/healthz
```

The `-k` flag is required because the cert is self-signed (no public CA
chain); production manifests are served via a publicly-trusted cert (see
`tools/dev-server/PRODUCTION.md`).

### Pointing the updater at the dev server

For ad-hoc local testing of the update flow, set the update URL via the
environment variable consumed by the test harness:

```bash
SHERPA_UPDATE_URL=https://127.0.0.1:8443/channels/stable.json \
  npm run dev:electron
```

> **Note.** The current production wiring drives `electron-updater`'s
> built-in GitHub Releases poller, not an arbitrary URL. The dev server
> exists to exercise the manifest-verifier + downloader plumbing
> end-to-end; integration tests inject mocks rather than actually hitting
> the dev server (see `tests/integration/_helpers/electron_updater_mock.ts`).
> Routing real updater traffic through this stub is a follow-up wiring
> task — file an issue if you need it before that lands.

### Regenerating the self-signed cert

Delete the directory and restart the server:

```bash
rm -rf tools/dev-server/cert/
node tools/dev-server/index.js
```

The server requires `openssl` on `PATH` to regenerate. Git for Windows
ships openssl; Linux/macOS users have it system-wide. If `openssl` is not
available the server prints the manual command to run and exits.

### Regenerating the sample artefact

The committed `tools/dev-server/sample-core.tar.gz` is a 96-byte tar.gz
containing a single `version.txt` file. Its SHA-256 is recorded in
`sample-manifest.json`. To change the fixture:

1. Edit `tools/dev-server/_gen-fixture.mjs` (the body or filename inside
   the tar).
2. Run `node tools/dev-server/_gen-fixture.mjs` — it overwrites the
   archive and prints the new SHA.
3. Paste the printed `sha256` into `tools/dev-server/sample-manifest.json`
   (`sha256` field) and update `size_bytes` if the byte length changed.

The manifest's `signature` field is a deliberate placeholder — the dev
server does not sign manifests. Signature verification will return
`signature_invalid` against this fixture, which is the documented
behaviour for an unsigned dev manifest. End-to-end signature testing uses
a TEST private key in `tests/integration/_helpers/electron_updater_mock.ts`
(see T-L5-07).

## Production server configuration

See `tools/dev-server/PRODUCTION.md` for nginx + Let's Encrypt,
Cloudflare R2, and AWS S3 + CloudFront recipes. The dev server stub is
intentionally not production-grade.
